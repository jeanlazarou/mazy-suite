package recipe

import (
	"math"
	"strings"
	"testing"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
)

// An analysis whose spectrum follows the target, plus shape(freq) dB.
func spectrumAnalysis(shape func(freq float64) float64) *analysis.AnalysisResult {
	const bins, df = 2048, 44100.0 / 4096
	s := &analysis.SpectrumAnalysis{SpectralBalance: "balanced"}
	for k := 0; k < bins; k++ {
		f := float64(k) * df
		s.Frequencies = append(s.Frequencies, f)
		db := -200.0
		if k > 0 {
			// Band energy to per-Hz level: minus 10·log10 of the bandwidth.
			db = targetDB(f) - 10*math.Log10(f) + shape(f)
		}
		s.Magnitudes = append(s.Magnitudes, db)
	}
	return &analysis.AnalysisResult{Spectrum: s}
}

func bandNear(freq float64) int { return int(math.Round(3 * math.Log2(freq/20))) }

func TestToneMatchLeavesTheTargetAlone(t *testing.T) {
	curve, ok := toneMatch(spectrumAnalysis(func(float64) float64 { return 0 }), neutralStyle)
	if ok {
		t.Errorf("a spectrum on the target needs no correction, got %v", curve)
	}
}

func TestToneMatchFillsAHoleAndLevelsABump(t *testing.T) {
	a := spectrumAnalysis(func(f float64) float64 {
		switch {
		case f > 2200 && f < 2900:
			return -6 // a hole around 2.5 kHz
		case f > 280 && f < 360:
			return 5 // a bump around 320 Hz
		}
		return 0
	})
	curve, ok := toneMatch(a, neutralStyle)
	if !ok {
		t.Fatal("no correction")
	}
	if g := curve[bandNear(2560)]; g < 1.5 || g > matchMaxDB {
		t.Errorf("hole at 2.5 kHz: %+.1f dB, want a boost of 1.5 to %.0f", g, matchMaxDB)
	}
	if g := curve[bandNear(320)]; g > -1.5 || g < -matchMaxDB {
		t.Errorf("bump at 320 Hz: %+.1f dB, want a cut of 1.5 to %.0f", g, matchMaxDB)
	}
	if g := curve[bandNear(1000)]; math.Abs(g) > 0.75 {
		t.Errorf("1 kHz was on target, moved %+.1f dB", g)
	}
}

func TestToneMatchBrightensADarkSongWithinLimits(t *testing.T) {
	// Falls 3 dB per octave more than the target above 500 Hz, and has
	// nothing above 11 kHz (a low-passed file).
	a := spectrumAnalysis(func(f float64) float64 {
		if f > 11000 {
			return -60
		}
		return -3 * math.Max(0, math.Log2(f/500))
	})
	curve, ok := toneMatch(a, neutralStyle)
	if !ok {
		t.Fatal("no correction")
	}
	if g := curve[bandNear(5000)]; g < 2 {
		t.Errorf("5 kHz: %+.1f dB, want a clear boost", g)
	}
	for i, g := range curve {
		f := dsp.ToneMatchFreq(i)
		if math.Abs(g) > matchMaxDB {
			t.Errorf("%.0f Hz: %+.1f dB beyond the %.0f dB limit", f, g, matchMaxDB)
		}
		if f > 13000 && g > 0.5 {
			t.Errorf("%.0f Hz: %+.1f dB boost where the file has nothing", f, g)
		}
		if f < matchNoBoost && g > 0 {
			t.Errorf("%.0f Hz: rumble boosted %+.1f dB", f, g)
		}
	}
	// A style the target doesn't describe is corrected less.
	classical, _ := findStyle("classical")
	gentle, _ := toneMatch(a, classical)
	if gentle[bandNear(5000)] >= curve[bandNear(5000)] {
		t.Errorf("classical %+.1f dB should be less than %+.1f", gentle[bandNear(5000)], curve[bandNear(5000)])
	}
}

func TestRecipeUsesToneMatchAsAFix(t *testing.T) {
	a := spectrumAnalysis(func(f float64) float64 { return -3 * math.Max(0, math.Log2(f/500)) })
	a.Spectrum.SpectralBalance = "dark"

	r, err := Build(Choice{Destination: "streaming", Fix: true}, a)
	if err != nil {
		t.Fatal(err)
	}
	tm := r.Processors["Tone Match"]
	if !r.Enabled["Tone Match"] || tm["enabled"] != 1 || tm["g."+"24"] <= 0 {
		t.Errorf("tone match not applied: enabled=%v params=%v", r.Enabled["Tone Match"], tm)
	}
	var matched bool
	for _, n := range r.Notes {
		matched = matched || (n.Layer == "fix" && strings.HasPrefix(n.Text, "Tone balanced to the song"))
		if strings.Contains(n.Text, "Sounds dark") {
			t.Errorf("the verdict fix is replaced by the curve, got %q", n.Text)
		}
	}
	if !matched {
		t.Errorf("no tone note in %v", r.Notes)
	}
	if g := r.Processors["Parametric EQ"]["band.4.gain"]; g != 0 {
		t.Errorf("air band %+.1f dB: the curve already brightens", g)
	}

	// Fixes off: the stage is off and flat.
	off, _ := Build(Choice{Destination: "streaming", Fix: false}, a)
	if off.Enabled["Tone Match"] || off.Processors["Tone Match"]["enabled"] != 0 || off.Processors["Tone Match"]["g.24"] != 0 {
		t.Errorf("fixes off: tone match should be off, got %v", off.Processors["Tone Match"])
	}

	// No spectrum (an album's aggregate): the verdict fix still applies.
	verdict := &analysis.AnalysisResult{Spectrum: &analysis.SpectrumAnalysis{SpectralBalance: "dark"}}
	v, _ := Build(Choice{Destination: "streaming", Fix: true}, verdict)
	if v.Enabled["Tone Match"] || v.Processors["Parametric EQ"]["band.4.gain"] != 2 {
		t.Errorf("verdict fallback: tone match %v, air %+.1f", v.Enabled["Tone Match"], v.Processors["Parametric EQ"]["band.4.gain"])
	}
}

func TestRecipeMultibandFollowsTheBandLevels(t *testing.T) {
	a := &analysis.AnalysisResult{
		Dynamics: &analysis.DynamicsAnalysis{LoudLevelDB: -8, BandLoudLevelsDB: []float64{-10, -14, -28}},
		Loudness: &analysis.LoudnessAnalysis{IntegratedLUFS: -16, LoudnessRange: 8},
	}
	r, err := Build(Choice{Destination: "streaming", Fix: true}, a)
	if err != nil {
		t.Fatal(err)
	}
	mb := r.Processors["Multiband Compressor"]
	if !r.Enabled["Multiband Compressor"] || mb["enabled"] != 1 {
		t.Fatalf("multiband off: %v", mb)
	}
	for i, level := range a.Dynamics.BandLoudLevelsDB {
		p := func(name string) float64 { return mb["band."+string(rune('0'+i))+"."+name] }
		// The band's loud level gets the gain reduction its makeup gives back.
		gr := dsp.GainReductionDB(level, p("threshold"), p("ratio"), p("knee"))
		if p("makeup") < 0.5 || math.Abs(gr-p("makeup")) > 0.15 {
			t.Errorf("band %d: %.2f dB at its loud level, makeup %.1f", i, gr, p("makeup"))
		}
		if p("attack") < minAttackMS || p("release") < minReleaseMS {
			t.Errorf("band %d: timings %v / %v ms", i, p("attack"), p("release"))
		}
	}
	if mb["band.1.makeup"] <= mb["band.2.makeup"] {
		t.Errorf("mids %.1f dB should get more than highs %.1f", mb["band.1.makeup"], mb["band.2.makeup"])
	}

	// The full-band compressor does less when the bands do the work.
	plain := *a
	plain.Dynamics = &analysis.DynamicsAnalysis{LoudLevelDB: -8}
	single, _ := Build(Choice{Destination: "streaming", Fix: true}, &plain)
	if single.Enabled["Multiband Compressor"] || single.Processors["Multiband Compressor"]["enabled"] != 0 {
		t.Errorf("no band levels: multiband should be off")
	}
	if r.Processors["Compressor"]["makeup"] >= single.Processors["Compressor"]["makeup"] {
		t.Errorf("glue %.1f dB should be less than the single compressor's %.1f",
			r.Processors["Compressor"]["makeup"], single.Processors["Compressor"]["makeup"])
	}

	// An already dense mix gets little; an empty band none.
	dense := *a
	dense.Loudness = &analysis.LoudnessAnalysis{IntegratedLUFS: -10, LoudnessRange: 3}
	dense.Dynamics = &analysis.DynamicsAnalysis{LoudLevelDB: -8, BandLoudLevelsDB: []float64{-10, -14, -200}}
	d, _ := Build(Choice{Destination: "loud", Fix: true}, &dense)
	dm := d.Processors["Multiband Compressor"]
	if dm["band.1.makeup"] > 1.5 || dm["band.2.makeup"] != 0 || dm["band.2.ratio"] != 1 {
		t.Errorf("dense mix: mids %.1f dB, empty highs %.1f dB ratio %.1f", dm["band.1.makeup"], dm["band.2.makeup"], dm["band.2.ratio"])
	}
}

func TestToneStrengthScalesTheCurve(t *testing.T) {
	a := spectrumAnalysis(func(f float64) float64 { return -3 * math.Max(0, math.Log2(f/500)) })
	a.Spectrum.SpectralBalance = "dark"
	normal, _ := Build(Choice{Destination: "streaming", Fix: true}, a)
	if normal.Tone != "normal" || normal.Processors["Tone Match"]["amount"] != 1 {
		t.Fatalf("default strength: tone %q amount %v", normal.Tone, normal.Processors["Tone Match"]["amount"])
	}
	for _, c := range []struct {
		id     string
		amount float64
		word   string
	}{{"gentle", 0.5, "(gentle)"}, {"strong", 1.5, "(strong)"}} {
		r, err := Build(Choice{Destination: "streaming", Fix: true, Tone: c.id}, a)
		if err != nil {
			t.Fatal(err)
		}
		tm := r.Processors["Tone Match"]
		if tm["amount"] != c.amount || tm["enabled"] != 1 || tm["g.24"] != normal.Processors["Tone Match"]["g.24"] {
			t.Errorf("%s: amount %v enabled %v, curve should stay the fitted one", c.id, tm["amount"], tm["enabled"])
		}
		var noted bool
		for _, n := range r.Notes {
			noted = noted || strings.Contains(n.Text, c.word)
		}
		if !noted {
			t.Errorf("%s: no note naming it in %v", c.id, r.Notes)
		}
	}

	// Off: no tone fix at all, not even the verdict fallback.
	off, _ := Build(Choice{Destination: "streaming", Fix: true, Tone: "off"}, a)
	if off.Enabled["Tone Match"] || off.Processors["Parametric EQ"]["band.4.gain"] != 0 {
		t.Errorf("off: tone match %v, air %+.1f", off.Enabled["Tone Match"], off.Processors["Parametric EQ"]["band.4.gain"])
	}
	verdict := &analysis.AnalysisResult{Spectrum: &analysis.SpectrumAnalysis{SpectralBalance: "dark"}}
	if v, _ := Build(Choice{Destination: "streaming", Fix: true, Tone: "off"}, verdict); v.Processors["Parametric EQ"]["band.4.gain"] != 0 {
		t.Errorf("off without a spectrum: verdict fix applied anyway")
	}
	for _, n := range off.Notes {
		if strings.Contains(n.Text, "Tone balanced") {
			t.Errorf("off: %q", n.Text)
		}
	}

	if _, err := Build(Choice{Tone: "loud"}, a); err == nil {
		t.Error("unknown tone strength accepted")
	}
}
