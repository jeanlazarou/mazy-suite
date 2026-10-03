package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/audiomaster/mastering/pkg/analysis"
	audioio "github.com/audiomaster/mastering/pkg/io"
	"github.com/spf13/cobra"
)

var (
	analyzeSet    settingsFlags
	analyzeFormat string
)

var analyzeCmd = &cobra.Command{
	Use:   "analyze <input-file>",
	Short: "Analyze an audio file and show what mastering would do",
	Long: `Analyzes audio for spectrum, dynamics, stereo field, and loudness, then
shows the settings 'master process' would use with the same --style/--for
(default: streaming), including the problems it would fix.`,
	Args: cobra.ExactArgs(1),
	RunE: runAnalyze,
}

func init() {
	analyzeSet.register(analyzeCmd)
	analyzeCmd.Flags().StringVarP(&analyzeFormat, "format", "f", "text", "Output format (text, json)")
}

func runAnalyze(cmd *cobra.Command, args []string) error {
	inputPath := args[0]
	if _, err := os.Stat(inputPath); os.IsNotExist(err) {
		return fmt.Errorf("input file not found: %s", inputPath)
	}

	fmt.Printf("Analyzing: %s\n", inputPath)

	buf, meta, err := audioio.ReadAudio(inputPath)
	if err != nil {
		return fmt.Errorf("failed to read input: %w", err)
	}

	fmt.Printf("  Format: %dHz, %d-bit, %d channels, %.2fs\n\n",
		meta.SampleRate, meta.BitDepth, meta.Channels, meta.Duration)

	result := analysis.Analyze(buf)
	set, err := analyzeSet.resolve(result)
	if err != nil {
		return err
	}

	if analyzeFormat == "json" {
		out := map[string]any{"analysis": result}
		if set.recipe != nil {
			out["settings"] = set.recipe
		} else {
			out["settings"] = set.preset
		}
		data, _ := json.MarshalIndent(out, "", "  ")
		fmt.Println(string(data))
		return nil
	}

	// Text output
	fmt.Println("=== Spectrum Analysis ===")
	if result.Spectrum != nil {
		fmt.Printf("  Peak frequency: %.0f Hz (%.1f dB)\n", result.Spectrum.PeakFreq, result.Spectrum.PeakMag)
		fmt.Printf("  Spectral balance: %s\n", result.Spectrum.SpectralBalance)
	}

	fmt.Println("\n=== Dynamics Analysis ===")
	if result.Dynamics != nil {
		fmt.Printf("  Peak: %.1f dBFS\n", result.Dynamics.PeakDB)
		fmt.Printf("  RMS: %.1f dBFS\n", result.Dynamics.RMSDB)
		fmt.Printf("  Dynamic range: %.1f dB\n", result.Dynamics.DynamicRange)
		fmt.Printf("  Crest factor: %.1f dB\n", result.Dynamics.CrestFactor)
	}

	fmt.Println("\n=== Loudness Analysis ===")
	if result.Loudness != nil {
		fmt.Printf("  Integrated: %.1f LUFS\n", result.Loudness.IntegratedLUFS)
		fmt.Printf("  Momentary max: %.1f LUFS\n", result.Loudness.MomentaryMax)
		fmt.Printf("  Loudness range: %.1f LU\n", result.Loudness.LoudnessRange)
		fmt.Printf("  True peak: %.1f dBTP\n", result.Loudness.TruePeak)
	}

	if result.StereoField != nil {
		fmt.Println("\n=== Stereo Analysis ===")
		fmt.Printf("  Correlation: %.3f\n", result.StereoField.Correlation)
		fmt.Printf("  Width: %.1f%%\n", result.StereoField.Width*100)
		fmt.Printf("  Balance: %.3f\n", result.StereoField.Balance)
		fmt.Printf("  Mid RMS: %.1f dB\n", result.StereoField.MidRMS)
		fmt.Printf("  Side RMS: %.1f dB\n", result.StereoField.SideRMS)
	}

	fmt.Println("\n=== Mastering ===")
	set.print("  ")

	return nil
}
