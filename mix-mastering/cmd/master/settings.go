package main

import (
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/engine"
	"github.com/audiomaster/mastering/pkg/preset"
	"github.com/audiomaster/mastering/pkg/recipe"
	"github.com/spf13/cobra"
)

// settingsFlags are the flags every mastering command shares to choose
// its settings, the same way the web UI does: what the material is
// (--style), where it will be heard (--for) and whether to fix problems
// found by analysis — or a saved preset instead.
type settingsFlags struct {
	style  string
	dest   string
	noFix  bool
	preset string
}

func (f *settingsFlags) register(cmd *cobra.Command) {
	cmd.Flags().StringVar(&f.style, "style", "", "What the material is; sets the character (see 'master options')")
	cmd.Flags().StringVar(&f.dest, "for", "", "Where it will be heard; sets loudness and delivery (default streaming; see 'master options')")
	cmd.Flags().BoolVar(&f.noFix, "no-fix", false, "Don't correct problems found by analysis (too dark, squashed, ...)")
	cmd.Flags().StringVarP(&f.preset, "preset", "p", "", "Use a saved preset from ~/.audiomaster/presets instead of --style/--for")
}

// needsAnalysis tells whether resolve uses the audio's analysis, so
// callers can skip analyzing when it doesn't.
func (f *settingsFlags) needsAnalysis() bool {
	return f.preset == "" && !f.noFix
}

// settings is what a command applies to its chains: a recipe built from
// the choice, or a saved preset.
type settings struct {
	recipe *recipe.Recipe
	preset *preset.Preset
}

// resolve builds the settings. analyses are the audio's analyses (one
// track, or every track of an album — aggregated so the settings suit the
// whole record); they're only used for fixes.
func (f *settingsFlags) resolve(analyses ...*analysis.AnalysisResult) (*settings, error) {
	if f.preset != "" {
		if f.style != "" || f.dest != "" {
			return nil, fmt.Errorf("use either --preset or --style/--for, not both")
		}
		p, err := getPresetManager().Get(f.preset)
		if err != nil {
			return nil, err
		}
		return &settings{preset: p}, nil
	}
	var a *analysis.AnalysisResult
	if !f.noFix {
		a = analysis.Aggregate(analyses)
	}
	r, err := recipe.Build(recipe.Choice{Style: f.style, Destination: f.dest, Fix: !f.noFix}, a)
	if err != nil {
		return nil, err
	}
	return &settings{recipe: r}, nil
}

// apply configures every processor of a full chain.
func (s *settings) apply(eng *engine.MasteringEngine) {
	if s.preset != nil {
		applyPreset(eng, s.preset)
		return
	}
	for procName, params := range s.recipe.Processors {
		for paramName, value := range params {
			if err := eng.SetParam(procName, paramName, value); err != nil {
				fmt.Printf("  Warning: %v\n", err)
			}
		}
	}
	for _, p := range eng.Processors() {
		if on, ok := s.recipe.Enabled[p.Name()]; ok {
			p.SetEnabled(on)
		}
	}
}

// targetLUFS is the loudness the settings aim for (used as the album
// target). A saved preset without a normalizer block means the default.
func (s *settings) targetLUFS() float64 {
	if s.recipe != nil {
		return s.recipe.TargetLUFS
	}
	if ln, ok := s.preset.Processors["Loudness Normalizer"]; ok {
		if t, ok := ln["target_lufs"]; ok {
			return t
		}
	}
	return -14
}

func (s *settings) summary() string {
	if s.preset != nil {
		return fmt.Sprintf("saved preset %q", s.preset.Name)
	}
	return s.recipe.Summary
}

// print shows the settings and, for a recipe, what each part does.
func (s *settings) print(indent string) {
	fmt.Printf("%sSettings: %s\n", indent, s.summary())
	if s.recipe == nil {
		return
	}
	for _, n := range s.recipe.Notes {
		fmt.Printf("%s  [%s] %s\n", indent, n.Layer, n.Text)
	}
}

var optionsCmd = &cobra.Command{
	Use:   "options",
	Short: "List the styles (--style) and destinations (--for)",
	Long: `Lists what --style and --for accept. The two combine: the style sets the
character (tone, how the compressor moves), the destination sets delivery
(loudness, peak ceiling, device tuning). Problems found by analysing the
audio are corrected on top unless --no-fix is given.

  master process song.wav -o out.wav --style rock --for podcast`,
	Run: func(cmd *cobra.Command, args []string) {
		opts := recipe.ListOptions()
		w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(w, "STYLE (--style)\tCHARACTER")
		for _, s := range opts.Styles {
			fmt.Fprintf(w, "  %s\t%s\n", s.ID, s.Description)
		}
		fmt.Fprintln(w, "\t")
		fmt.Fprintln(w, "DESTINATION (--for)\tLOUDNESS\tPEAKS\tDELIVERY")
		for _, d := range opts.Destinations {
			def := ""
			if d.ID == recipe.DefaultDestination {
				def = " (default)"
			}
			fmt.Fprintf(w, "  %s%s\t%.0f LUFS\t%.1f dBTP\t%s\n", d.ID, def, d.TargetLUFS, d.CeilingDBTP, firstSentence(d.Description))
		}
		w.Flush()
	},
}

func firstSentence(s string) string {
	if i := strings.Index(s, ". "); i >= 0 {
		return s[:i+1]
	}
	return s
}
