package recipe

import (
	"fmt"
	"strings"
	"testing"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/engine"
)

// A recipe must carry every param of every processor, and every one of
// them must be accepted by the engine — that's what guarantees applying a
// recipe never leaves values behind from an earlier choice.
func TestRecipeIsCompleteAndApplies(t *testing.T) {
	r, err := Build(Choice{Style: "rock", Destination: "phone", Fix: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	e := engine.NewFullChain(48000, 2)
	for _, p := range e.Processors() {
		got, ok := r.Processors[p.Name()]
		if !ok {
			t.Fatalf("missing processor %q", p.Name())
		}
		for param := range p.GetParams() {
			if _, ok := got[param]; !ok {
				t.Errorf("%s: missing param %q", p.Name(), param)
			}
		}
		if _, ok := r.Enabled[p.Name()]; !ok {
			t.Errorf("missing enabled state for %q", p.Name())
		}
		for param, v := range got {
			if err := e.SetParam(p.Name(), param, v); err != nil {
				t.Errorf("%s.%s rejected: %v", p.Name(), param, err)
			}
		}
	}
}

// Style and destination own different things and combine: a rock song
// for a podcast keeps rock's tone and gets the podcast's loudness.
func TestStyleAndDestinationCombine(t *testing.T) {
	rock, _ := Build(Choice{Style: "rock", Destination: "streaming"}, nil)
	rockPod, _ := Build(Choice{Style: "rock", Destination: "podcast"}, nil)
	plainPod, _ := Build(Choice{Destination: "podcast"}, nil)

	if got := rockPod.Processors["Loudness Normalizer"]["target_lufs"]; got != -16 {
		t.Errorf("rock+podcast target = %v, want -16", got)
	}
	if got := rockPod.Processors["Parametric EQ"]["band.1.gain"]; got != rock.Processors["Parametric EQ"]["band.1.gain"] {
		t.Errorf("rock+podcast low shelf = %v, want rock's %v", got, rock.Processors["Parametric EQ"]["band.1.gain"])
	}
	if rockPod.Processors["Compressor"]["attack"] != 10 || plainPod.Processors["Compressor"]["attack"] != 15 {
		t.Errorf("compressor attack should follow the style")
	}
	// Podcast as a destination is about delivery; it must not turn on the
	// voice high-pass (that belongs to the Voice style).
	if rockPod.Processors["Parametric EQ"]["band.0.enabled"] != 0 {
		t.Errorf("podcast destination must not high-pass music")
	}
	voice, _ := Build(Choice{Style: "voice", Destination: "podcast"}, nil)
	if voice.Processors["Parametric EQ"]["band.0.enabled"] != 1 {
		t.Errorf("voice style should enable the high-pass")
	}
}

func TestFixesFollowAnalysisAndSwitch(t *testing.T) {
	a := &analysis.AnalysisResult{
		Spectrum: &analysis.SpectrumAnalysis{SpectralBalance: "dark"},
		Dynamics: &analysis.DynamicsAnalysis{DynamicRange: 25, CrestFactor: 15},
		Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -20, LoudnessRange: 18},
	}
	on, _ := Build(Choice{Destination: "streaming", Fix: true}, a)
	off, _ := Build(Choice{Destination: "streaming", Fix: false}, a)
	if on.Fixes != 3 {
		t.Errorf("fixes = %d, want 3 (dark, dynamics, peaks)", on.Fixes)
	}
	if off.Fixes != 0 {
		t.Errorf("fixes off but got %d", off.Fixes)
	}
	if on.Processors["Parametric EQ"]["band.4.gain"] <= off.Processors["Parametric EQ"]["band.4.gain"] {
		t.Errorf("dark fix should raise the air band")
	}
	if on.Processors["Compressor"]["attack"] != 5 {
		t.Errorf("peak fix should cap attack at 5 ms, got %v", on.Processors["Compressor"]["attack"])
	}
}

func TestExcitersFollowDestination(t *testing.T) {
	phone, _ := Build(Choice{Destination: "phone"}, nil)
	stream, _ := Build(Choice{Destination: "streaming"}, nil)
	for _, name := range []string{"Bass Exciter", "Treble Exciter"} {
		if !phone.Enabled[name] || phone.Processors[name]["enabled"] != 1 {
			t.Errorf("phone: %s should be on", name)
		}
		if stream.Enabled[name] || stream.Processors[name]["enabled"] != 0 {
			t.Errorf("streaming: %s should be off", name)
		}
	}
}

func TestUnknownChoices(t *testing.T) {
	if _, err := Build(Choice{Style: "polka"}, nil); err == nil {
		t.Error("expected error for unknown style")
	}
	if _, err := Build(Choice{Destination: "moon"}, nil); err == nil {
		t.Error("expected error for unknown destination")
	}
	r, err := Build(Choice{}, nil)
	if err != nil || r.Destination != DefaultDestination {
		t.Errorf("empty choice should default to %s, got %v %v", DefaultDestination, r, err)
	}
}

// A fade-out makes the dynamic-range figure huge on any song; the
// dynamics fix must follow the loudness range instead. Values from a real
// rock track: DR 79 dB, LRA 6.8 LU — an ordinary mix, nothing to fix.
func TestDynamicsFixIgnoresFades(t *testing.T) {
	a := &analysis.AnalysisResult{
		Dynamics: &analysis.DynamicsAnalysis{DynamicRange: 79, CrestFactor: 8},
		Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -15.7, LoudnessRange: 6.8},
	}
	r, _ := Build(Choice{Destination: "streaming", Fix: true}, a)
	if r.Fixes != 0 {
		t.Errorf("expected no fixes, got %v", r.Notes)
	}
	squashed := &analysis.AnalysisResult{Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -8, LoudnessRange: 2.5}}
	r, _ = Build(Choice{Destination: "streaming", Fix: true}, squashed)
	gentle, _ := Build(Choice{Destination: "streaming", Fix: false}, squashed)
	if r.Fixes != 1 || r.Processors["Compressor"]["ratio"] >= gentle.Processors["Compressor"]["ratio"] {
		t.Errorf("squashed master should get gentler compression, got %v", r.Notes)
	}
}

// Clean is today's sound: the same recipe as no variant at all. The other
// variants change color and movement but never the delivery.
func TestVariantsKeepDelivery(t *testing.T) {
	a := &analysis.AnalysisResult{
		Spectrum: &analysis.SpectrumAnalysis{SpectralBalance: "balanced"},
		Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -18, LoudnessRange: 7},
	}
	none, _ := Build(Choice{Style: "rock", Destination: "car", Fix: true}, a)
	clean, _ := Build(Choice{Style: "rock", Destination: "car", Fix: true, Variant: "clean"}, a)
	if none.Variant != "clean" || clean.Summary != none.Summary {
		t.Errorf("no variant should mean clean, got %q / %q vs %q", none.Variant, clean.Summary, none.Summary)
	}
	for proc, params := range none.Processors {
		for p, v := range params {
			if clean.Processors[proc][p] != v {
				t.Errorf("clean %s.%s = %v, want %v", proc, p, clean.Processors[proc][p], v)
			}
		}
	}
	for _, id := range []string{"punch", "smooth", "warm"} {
		r, err := Build(Choice{Style: "rock", Destination: "car", Fix: true, Variant: id}, a)
		if err != nil {
			t.Fatal(err)
		}
		if r.Processors["Loudness Normalizer"]["target_lufs"] != -12 || r.Processors["Limiter"]["ceiling"] != -0.3 {
			t.Errorf("%s changed the delivery", id)
		}
		if !r.Enabled["Treble Exciter"] {
			t.Errorf("%s dropped the car's treble exciter", id)
		}
		if r.Fixes != none.Fixes {
			t.Errorf("%s: fixes %d, want %d", id, r.Fixes, none.Fixes)
		}
		v, _ := findVariant(id)
		if last := r.Notes[len(r.Notes)-1]; last.Layer != "variant" || !strings.Contains(r.Summary, v.Name) {
			t.Errorf("%s: should be named in the summary %q and explained in a note, got %+v", id, r.Summary, last)
		}
	}
}

func TestVariantsDoWhatTheySay(t *testing.T) {
	build := func(v string) *Recipe {
		r, err := Build(Choice{Style: "pop", Destination: "streaming", Variant: v}, nil)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	clean, punch, smooth, warm := build("clean"), build("punch"), build("smooth"), build("warm")
	eq := func(r *Recipe, band int) float64 {
		return r.Processors["Parametric EQ"][fmt.Sprintf("band.%d.gain", band)]
	}
	comp := func(r *Recipe, p string) float64 { return r.Processors["Compressor"][p] }

	if comp(punch, "attack") <= comp(clean, "attack") || eq(punch, 3) <= eq(clean, 3) {
		t.Error("punch: slower attack and more presence expected")
	}
	if comp(smooth, "attack") >= comp(clean, "attack") || eq(smooth, 4) >= eq(clean, 4) || eq(smooth, 3) >= eq(clean, 3) {
		t.Error("smooth: faster attack, less presence and air expected")
	}
	if eq(warm, 1) <= eq(clean, 1) || comp(warm, "release") <= comp(clean, "release") {
		t.Error("warm: more lows and a slower release expected")
	}
	for _, r := range []*Recipe{clean, punch, smooth} {
		if r.Enabled["Saturation"] || r.Processors["Saturation"]["enabled"] != 0 {
			t.Errorf("%s: saturation should be off", r.Variant)
		}
	}
	if !warm.Enabled["Saturation"] || warm.Processors["Saturation"]["enabled"] != 1 || !warm.Enabled["Bass Exciter"] {
		t.Error("warm: saturation and bass harmonics expected")
	}
	if _, err := Build(Choice{Variant: "loud"}, nil); err == nil {
		t.Error("expected error for unknown variant")
	}
}

func TestSuggestion(t *testing.T) {
	with := func(balance string, lra float64) *analysis.AnalysisResult {
		return &analysis.AnalysisResult{
			Spectrum: &analysis.SpectrumAnalysis{SpectralBalance: balance},
			Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -16, LoudnessRange: lra},
		}
	}
	cases := []struct {
		style string
		a     *analysis.AnalysisResult
		want  string
	}{
		{"", nil, "clean"},
		{"rock", nil, "punch"},
		{"jazz", with("balanced", 8), "warm"},
		{"classical", with("balanced", 12), "clean"},
		{"rock", with("bright", 8), "smooth"},    // what the analysis hears comes first
		{"jazz", with("mid-heavy", 8), "punch"},  // clears crowded low-mids
		{"hiphop", with("balanced", 3), "clean"}, // already squashed
		{"acoustic", with("dark", 8), "clean"},   // not warmer than it is
		{"electronic", with("dark", 8), "punch"}, // punch still suits a dark club track
		{"pop", with("balanced", 0), "clean"},    // LRA 0 = unknown, not squashed
	}
	for _, c := range cases {
		got := Suggest(c.style, c.a)
		if got.Variant != c.want || got.Reason == "" {
			t.Errorf("Suggest(%q, %v) = %+v, want %s", c.style, c.a != nil, got, c.want)
		}
	}
	r, _ := Build(Choice{Style: "rock", Variant: "smooth"}, with("bright", 8))
	if r.Suggested.Variant != "smooth" {
		t.Errorf("recipe should carry the suggestion, got %+v", r.Suggested)
	}
}
