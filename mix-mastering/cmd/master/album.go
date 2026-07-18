package main

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"text/tabwriter"

	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/audiomaster/mastering/pkg/engine"
	audioio "github.com/audiomaster/mastering/pkg/io"
	"github.com/spf13/cobra"
)

var albumCmd = &cobra.Command{
	Use:   "album <input-dir>",
	Short: "Master a set of tracks as one album",
	Long: `Masters all audio files in a directory as one album: every track goes
through the same processing chain, and loudness is normalized with a single
shared gain offset (computed from the album's integrated loudness per
BS.1770 gating over all tracks) so the relative levels between tracks are
preserved. Per-track loudness targets from presets are ignored.

Track order follows file name order.`,
	Args: cobra.ExactArgs(1),
	RunE: runAlbum,
}

var (
	albumOutput   string
	albumPreset   string
	albumBitDepth int
	albumFormat   string
	albumTarget   float64
)

func init() {
	albumCmd.Flags().StringVarP(&albumOutput, "output", "o", "", "Output directory (required)")
	albumCmd.Flags().StringVarP(&albumPreset, "preset", "p", "", "Preset to apply to every track")
	albumCmd.Flags().IntVarP(&albumBitDepth, "bit-depth", "b", 0, "Output bit depth (16, 24, 32; default: same as input)")
	albumCmd.Flags().StringVarP(&albumFormat, "format", "f", "wav", "Output format (wav, flac)")
	albumCmd.Flags().Float64VarP(&albumTarget, "target-lufs", "t", -14, "Album loudness target in LUFS")
	albumCmd.MarkFlagRequired("output")
}

type albumTrack struct {
	path    string
	name    string
	inLUFS  float64 // raw input loudness
	midLUFS float64 // after processing, before album offset
	outLUFS float64 // final output loudness
	outTP   float64 // final true peak (dBTP)
}

// buildAlbumEngine creates the album chain for one track. NewFullChain
// already places the Gain stage (which carries the shared album offset)
// before the limiter, so the ceiling holds on the actual output.
func buildAlbumEngine(meta *audioio.AudioMetadata, preset string) (*engine.MasteringEngine, error) {
	eng := engine.NewFullChain(meta.SampleRate, meta.Channels)

	if preset != "" {
		mgr := getPresetManager()
		p, err := mgr.Get(preset)
		if err != nil {
			return nil, fmt.Errorf("preset error: %w", err)
		}
		applyPreset(eng, p)
	}

	// Album mode: loudness is a single shared offset, never per-track.
	if norm, _, err := eng.GetProcessorByName("Loudness Normalizer"); err == nil {
		norm.SetEnabled(false)
	}

	return eng, nil
}

func runAlbum(cmd *cobra.Command, args []string) error {
	inputDir := args[0]
	if _, err := os.Stat(inputDir); os.IsNotExist(err) {
		return fmt.Errorf("input directory not found: %s", inputDir)
	}

	audioExts := map[string]bool{".wav": true, ".flac": true, ".mp3": true, ".ogg": true, ".aiff": true, ".aif": true}
	var files []string
	filepath.Walk(inputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if audioExts[strings.ToLower(filepath.Ext(path))] {
			files = append(files, path)
		}
		return nil
	})
	sort.Strings(files)

	if len(files) == 0 {
		return fmt.Errorf("no audio files found in %s", inputDir)
	}

	fmt.Printf("Album: %d tracks\n", len(files))
	if albumPreset != "" {
		fmt.Printf("Preset: %s (loudness target ignored — album offset is used instead)\n", albumPreset)
	}

	// Pass 1: process every track (no limiter, no offset) and collect the
	// 400ms gating blocks so the album can be integrated as one program.
	fmt.Printf("\nPass 1/2: analyzing album loudness...\n")
	tracks := make([]*albumTrack, 0, len(files))
	var albumBlocks []float64

	for _, path := range files {
		buf, meta, err := audioio.ReadAudio(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", filepath.Base(path), err)
		}

		track := &albumTrack{path: path, name: filepath.Base(path)}
		meter := dsp.NewLUFSMeter(float64(meta.SampleRate), meta.Channels)
		track.inLUFS = meter.MeasureIntegrated(buf)

		eng, err := buildAlbumEngine(meta, albumPreset)
		if err != nil {
			return err
		}
		if lim, _, err := eng.GetProcessorByName("Limiter"); err == nil {
			lim.SetEnabled(false) // measure unlimited loudness
		}
		if err := eng.Process(buf); err != nil {
			return fmt.Errorf("process %s: %w", track.name, err)
		}

		blocks := meter.MeasureMomentary(buf)
		track.midLUFS = dsp.GatedLoudness(blocks)
		albumBlocks = append(albumBlocks, blocks...)
		tracks = append(tracks, track)
		fmt.Printf("  %-40s %7.1f LUFS\n", track.name, track.midLUFS)
	}

	albumLUFS := dsp.GatedLoudness(albumBlocks)
	offset := albumTarget - albumLUFS
	fmt.Printf("\nAlbum loudness: %.1f LUFS -> target %.1f LUFS (offset %+.1f dB, same for all tracks)\n",
		albumLUFS, albumTarget, offset)

	// Pass 2: process again with the shared offset and the limiter, write.
	fmt.Printf("\nPass 2/2: mastering...\n")
	os.MkdirAll(albumOutput, 0755)

	for _, track := range tracks {
		buf, meta, err := audioio.ReadAudio(track.path)
		if err != nil {
			return fmt.Errorf("read %s: %w", track.name, err)
		}

		eng, err := buildAlbumEngine(meta, albumPreset)
		if err != nil {
			return err
		}
		if err := eng.SetParam("Gain", "gain_db", offset); err != nil {
			return err
		}
		if err := eng.Process(buf); err != nil {
			return fmt.Errorf("process %s: %w", track.name, err)
		}

		meter := dsp.NewLUFSMeter(float64(meta.SampleRate), meta.Channels)
		track.outLUFS = meter.MeasureIntegrated(buf)
		track.outTP = meter.MeasureTruePeak(buf)

		basename := strings.TrimSuffix(track.name, filepath.Ext(track.name))
		outPath := filepath.Join(albumOutput, basename+"."+albumFormat)
		bd := albumBitDepth
		if bd == 0 {
			bd = meta.BitDepth
		}
		if err := audioio.WriteAudio(outPath, buf, bd); err != nil {
			return fmt.Errorf("write %s: %w", outPath, err)
		}
		fmt.Printf("  %-40s -> %s\n", track.name, filepath.Base(outPath))
	}

	// Report: relative levels are preserved by construction; show them and
	// flag tracks that sit far from the album average.
	fmt.Printf("\n=== Album Report ===\n")
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(w, "TRACK\tIN\tOUT\tREL\tTRUE PEAK\n")
	for _, t := range tracks {
		fmt.Fprintf(w, "%s\t%.1f LUFS\t%.1f LUFS\t%+.1f dB\t%.1f dBTP\n",
			t.name, t.inLUFS, t.outLUFS, t.outLUFS-albumTarget, t.outTP)
	}
	w.Flush()

	median := medianOf(tracks, func(t *albumTrack) float64 { return t.midLUFS })
	for _, t := range tracks {
		if diff := t.midLUFS - median; math.Abs(diff) > 3 {
			fmt.Printf("\nNote: %s sits %+.1f dB relative to the album median — intentional?\n", t.name, diff)
		}
	}

	return nil
}

func medianOf(tracks []*albumTrack, val func(*albumTrack) float64) float64 {
	vals := make([]float64, len(tracks))
	for i, t := range tracks {
		vals[i] = val(t)
	}
	sort.Float64s(vals)
	mid := len(vals) / 2
	if len(vals)%2 == 0 {
		return (vals[mid-1] + vals[mid]) / 2
	}
	return vals[mid]
}
