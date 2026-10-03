package recipe

import (
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
