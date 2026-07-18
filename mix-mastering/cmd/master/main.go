package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var version = "0.1.0"

var rootCmd = &cobra.Command{
	Use:   "master",
	Short: "Professional audio mastering tool",
	Long:  "A professional audio mastering application for processing, analyzing, and mastering audio files.",
}

func init() {
	rootCmd.AddCommand(processCmd)
	rootCmd.AddCommand(analyzeCmd)
	rootCmd.AddCommand(presetCmd)
	rootCmd.AddCommand(batchCmd)
	rootCmd.AddCommand(albumCmd)
	rootCmd.AddCommand(versionCmd)
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the version",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("master v%s\n", version)
	},
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}
