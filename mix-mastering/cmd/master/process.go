package main

import (
	"fmt"
	"os"
	"time"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/audiomaster/mastering/pkg/engine"
	audioio "github.com/audiomaster/mastering/pkg/io"
	"github.com/spf13/cobra"
)

var (
	outputFile   string
	bitDepth     int
	sampleRate   int
	eqEnabled    bool
	compEnabled  bool
	limitEnabled bool
	processSet   settingsFlags
)

var processCmd = &cobra.Command{
	Use:   "process <input-file>",
	Short: "Master an audio file",
	Long: `Reads an audio file, masters it, and writes the output.

Say what the material is and where it will be heard:

  master process song.wav -o out.wav --style rock --for podcast

--style sets the character, --for sets loudness and delivery (default:
streaming, -14 LUFS); 'master options' lists both. The file is analyzed and
problems (too dark, squashed, ...) are corrected unless --no-fix is given.
--preset uses a saved preset instead.`,
	Args: cobra.ExactArgs(1),
	RunE: runProcess,
}

func init() {
	processCmd.Flags().StringVarP(&outputFile, "output", "o", "", "Output file path (required)")
	processCmd.Flags().IntVarP(&bitDepth, "bit-depth", "b", 0, "Output bit depth (16, 24, 32; default: same as input)")
	processCmd.Flags().IntVarP(&sampleRate, "sample-rate", "r", 0, "Output sample rate in Hz (default: same as input)")
	processSet.register(processCmd)
	processCmd.Flags().BoolVar(&eqEnabled, "eq", true, "Enable EQ")
	processCmd.Flags().BoolVar(&compEnabled, "comp", true, "Enable compressor")
	processCmd.Flags().BoolVar(&limitEnabled, "limit", true, "Enable limiter")
	processCmd.MarkFlagRequired("output")
}

func runProcess(cmd *cobra.Command, args []string) error {
	inputPath := args[0]

	// Validate input
	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		return fmt.Errorf("input file not found: %s", inputPath)
	}

	fmt.Printf("Reading: %s\n", inputPath)
	start := time.Now()

	// Read input to get metadata for engine setup
	buf, meta, err := audioio.ReadAudio(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read input: %w", err)
	}

	fmt.Printf("  Format: %dHz, %d-bit, %d channels, %.2fs\n",
		meta.SampleRate, meta.BitDepth, meta.Channels, meta.Duration)

	// Create engine
	eng := engine.NewFullChain(meta.SampleRate, meta.Channels)

	var a *analysis.AnalysisResult
	if processSet.needsAnalysis() {
		a = analysis.Analyze(buf)
	}
	set, err := processSet.resolve(a)
	if err != nil {
		return err
	}
	set.print("  ")
	set.apply(eng)

	// Toggle processors
	procs := eng.Processors()
	for _, p := range procs {
		switch p.Name() {
		case "Parametric EQ":
			p.SetEnabled(eqEnabled)
		case "Compressor":
			p.SetEnabled(compEnabled)
		case "Limiter":
			p.SetEnabled(limitEnabled)
		}
	}

	// Process
	fmt.Printf("Processing...\n")
	if err := eng.Process(buf); err != nil {
		return fmt.Errorf("processing failed: %w", err)
	}

	// Resample after processing so the limiter ceiling was applied at the
	// native rate; note true peak can rise slightly through resampling.
	if sampleRate != 0 && sampleRate != meta.SampleRate {
		fmt.Printf("Resampling: %dHz -> %dHz\n", meta.SampleRate, sampleRate)
		buf, err = dsp.Resample(buf, sampleRate)
		if err != nil {
			return fmt.Errorf("resample failed: %w", err)
		}
	}

	// Write output
	outBitDepth := bitDepth
	if outBitDepth == 0 {
		outBitDepth = meta.BitDepth
	}

	if err := audioio.WriteAudio(outputFile, buf, outBitDepth); err != nil {
		return fmt.Errorf("failed to write output: %w", err)
	}

	elapsed := time.Since(start)
	fmt.Printf("Output: %s (%d-bit, %.2fs)\n", outputFile, outBitDepth, elapsed.Seconds())
	return nil
}
