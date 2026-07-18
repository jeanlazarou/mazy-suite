package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"text/tabwriter"

	"github.com/audiomaster/mastering/pkg/engine"
	audioio "github.com/audiomaster/mastering/pkg/io"
	"github.com/audiomaster/mastering/pkg/preset"
	"github.com/spf13/cobra"
)

var presetCmd = &cobra.Command{
	Use:   "preset",
	Short: "Manage mastering presets",
}

var batchCmd = &cobra.Command{
	Use:   "batch <input-dir>",
	Short: "Batch process audio files in a directory",
	Args:  cobra.ExactArgs(1),
	RunE:  runBatch,
}

var (
	batchOutput    string
	batchPreset    string
	batchBitDepth  int
	batchFormat    string
	presetCategory string
	presetSearch   string
)

func init() {
	// Preset list
	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List available presets",
		RunE:  runPresetList,
	}
	listCmd.Flags().StringVarP(&presetCategory, "category", "c", "", "Filter by category (genre, target, usecase)")
	presetCmd.AddCommand(listCmd)

	// Preset search
	searchCmd := &cobra.Command{
		Use:   "search <query>",
		Short: "Search presets",
		Args:  cobra.ExactArgs(1),
		RunE:  runPresetSearch,
	}
	presetCmd.AddCommand(searchCmd)

	// Preset show
	showCmd := &cobra.Command{
		Use:   "show <name>",
		Short: "Show preset details",
		Args:  cobra.ExactArgs(1),
		RunE:  runPresetShow,
	}
	presetCmd.AddCommand(showCmd)

	// Batch command
	batchCmd.Flags().StringVarP(&batchOutput, "output", "o", "", "Output directory (required)")
	batchCmd.Flags().StringVarP(&batchPreset, "preset", "p", "", "Preset to apply")
	batchCmd.Flags().IntVarP(&batchBitDepth, "bit-depth", "b", 0, "Output bit depth")
	batchCmd.Flags().StringVarP(&batchFormat, "format", "f", "wav", "Output format (wav, flac)")
	batchCmd.MarkFlagRequired("output")
}

func getPresetManager() *preset.Manager {
	home, _ := os.UserHomeDir()
	customDir := filepath.Join(home, ".audiomaster", "presets")
	return preset.NewManager(customDir)
}

func runPresetList(cmd *cobra.Command, args []string) error {
	mgr := getPresetManager()
	var presets []*preset.Preset

	if presetCategory != "" {
		presets = mgr.ListByCategory(presetCategory)
	} else {
		presets = mgr.List()
	}

	if len(presets) == 0 {
		fmt.Println("No presets found.")
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(w, "NAME\tCATEGORY\tDESCRIPTION\n")
	for _, p := range presets {
		fmt.Fprintf(w, "%s\t%s\t%s\n", p.Name, p.Category, p.Description)
	}
	w.Flush()
	return nil
}

func runPresetSearch(cmd *cobra.Command, args []string) error {
	mgr := getPresetManager()
	results := mgr.Search(args[0])

	if len(results) == 0 {
		fmt.Printf("No presets matching '%s'\n", args[0])
		return nil
	}

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
	fmt.Fprintf(w, "NAME\tCATEGORY\tDESCRIPTION\n")
	for _, p := range results {
		fmt.Fprintf(w, "%s\t%s\t%s\n", p.Name, p.Category, p.Description)
	}
	w.Flush()
	return nil
}

func runPresetShow(cmd *cobra.Command, args []string) error {
	mgr := getPresetManager()
	p, err := mgr.Get(args[0])
	if err != nil {
		return err
	}

	jsonStr, _ := p.ToJSON()
	fmt.Println(jsonStr)
	return nil
}

func runBatch(cmd *cobra.Command, args []string) error {
	inputDir := args[0]
	if _, err := os.Stat(inputDir); os.IsNotExist(err) {
		return fmt.Errorf("input directory not found: %s", inputDir)
	}

	os.MkdirAll(batchOutput, 0755)

	audioExts := map[string]bool{".wav": true, ".flac": true, ".mp3": true, ".ogg": true, ".aiff": true, ".aif": true}
	var files []string

	filepath.Walk(inputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if audioExts[ext] {
			files = append(files, path)
		}
		return nil
	})

	if len(files) == 0 {
		fmt.Println("No audio files found in", inputDir)
		return nil
	}

	fmt.Printf("Found %d audio files\n", len(files))

	for i, inputPath := range files {
		basename := strings.TrimSuffix(filepath.Base(inputPath), filepath.Ext(inputPath))
		outputPath := filepath.Join(batchOutput, basename+"."+batchFormat)

		fmt.Printf("[%d/%d] %s -> %s\n", i+1, len(files), filepath.Base(inputPath), filepath.Base(outputPath))

		buf, meta, err := audioio.ReadAudio(inputPath)
		if err != nil {
			fmt.Printf("  Error reading: %v\n", err)
			continue
		}

		eng := engine.NewFullChain(meta.SampleRate, meta.Channels)

		if batchPreset != "" {
			mgr := getPresetManager()
			p, err := mgr.Get(batchPreset)
			if err != nil {
				return fmt.Errorf("preset error: %w", err)
			}
			applyPreset(eng, p)
		}

		if err := eng.Process(buf); err != nil {
			fmt.Printf("  Error processing: %v\n", err)
			continue
		}

		bd := batchBitDepth
		if bd == 0 {
			bd = meta.BitDepth
		}

		if err := audioio.WriteAudio(outputPath, buf, bd); err != nil {
			fmt.Printf("  Error writing: %v\n", err)
			continue
		}
	}

	fmt.Println("Batch processing complete.")
	return nil
}

// applyPreset applies a preset's processor settings to an engine.
// Parameters that don't match a processor in the chain are reported so
// broken presets fail loudly instead of silently skipping settings.
func applyPreset(eng *engine.MasteringEngine, p *preset.Preset) {
	for procName, params := range p.Processors {
		for paramName, value := range params {
			if err := eng.SetParam(procName, paramName, value); err != nil {
				fmt.Printf("  Warning: preset %q: %v\n", p.Name, err)
			}
		}
		// The normalizer starts disabled; a preset that configures it
		// intends it to run.
		if procName == "Loudness Normalizer" {
			if proc, _, err := eng.GetProcessorByName(procName); err == nil {
				proc.SetEnabled(true)
			}
		}
	}
}
