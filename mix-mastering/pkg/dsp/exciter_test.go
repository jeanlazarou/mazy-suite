package dsp

import (
	"math"
	"testing"
)

// bandRMS measures the RMS energy a signal has in a narrow band around
// freq, skipping the first 0.5s to let the measurement filter settle
// (same approach as TestMultibandFlatSum).
func bandRMS(samples []float64, freq, sampleRate float64) float64 {
	f := NewBiquadFilter(BiquadBandPass, freq, 10, 0, sampleRate, 1)
	filtered := make([]float64, len(samples))
	for i, s := range samples {
		filtered[i] = f.ProcessSample(s, 0)
	}
	skip := int(0.5 * sampleRate)
	if skip >= len(filtered) {
		skip = 0
	}
	return rms(filtered[skip:])
}

func TestExciterDisabledTransparent(t *testing.T) {
	sr := 44100.0
	length := 44100

	for _, ex := range []*Exciter{NewBassExciter(sr), NewTrebleExciter(sr)} {
		buf := generateSine(200, sr, 2, length)
		before := make([]float64, len(buf.Samples[0]))
		copy(before, buf.Samples[0])

		if err := ex.Process(buf); err != nil {
			t.Fatal(err)
		}

		for i := range before {
			if buf.Samples[0][i] != before[i] {
				t.Fatalf("%s: disabled exciter altered sample %d: %v != %v",
					ex.Name(), i, buf.Samples[0][i], before[i])
			}
		}
	}
}

func TestBassExciterAddsHarmonics(t *testing.T) {
	sr := 44100.0
	length := 44100
	fundamental := 60.0
	thirdHarmonic := fundamental * 3 // tanh is odd-symmetric: no 2nd harmonic

	buf := generateSine(fundamental, sr, 1, length)
	fundBefore := bandRMS(buf.Samples[0], fundamental, sr)
	harmBefore := bandRMS(buf.Samples[0], thirdHarmonic, sr)

	ex := NewBassExciter(sr)
	ex.SetEnabled(true)
	ex.SetParam("drive", 0.6)
	ex.SetParam("mix", 0.5)

	if err := ex.Process(buf); err != nil {
		t.Fatal(err)
	}

	fundAfter := bandRMS(buf.Samples[0], fundamental, sr)
	harmAfter := bandRMS(buf.Samples[0], thirdHarmonic, sr)

	harmGainDB := 20 * math.Log10(harmAfter/math.Max(harmBefore, 1e-9))
	if harmGainDB < 10 {
		t.Errorf("expected >10dB rise at 3rd harmonic (%.0fHz), got %.1fdB (before=%.5f after=%.5f)",
			thirdHarmonic, harmGainDB, harmBefore, harmAfter)
	}

	// The fundamental sits below the band/post cutoff (120Hz) on both
	// filters, so the wet path should contribute little there.
	fundChangeDB := 20 * math.Log10(fundAfter/fundBefore)
	if math.Abs(fundChangeDB) > 2 {
		t.Errorf("expected <2dB change at fundamental (post-filter should strip the dry band from the wet path), got %.2fdB", fundChangeDB)
	}
}

func TestTrebleExciterAddsHighs(t *testing.T) {
	sr := 44100.0
	length := 44100
	fundamental := 4000.0
	harmonic := 12000.0 // 3rd harmonic
	corner := 3000.0
	midsProbe := 500.0 // well below the corner; must stay clean

	buf := generateSine(fundamental, sr, 1, length)
	harmBefore := bandRMS(buf.Samples[0], harmonic, sr)

	ex := NewTrebleExciter(sr)
	ex.SetEnabled(true)
	ex.SetParam("frequency", corner)
	ex.SetParam("drive", 0.6)
	ex.SetParam("mix", 0.5)

	if err := ex.Process(buf); err != nil {
		t.Fatal(err)
	}

	harmAfter := bandRMS(buf.Samples[0], harmonic, sr)
	midsAfter := bandRMS(buf.Samples[0], midsProbe, sr)

	harmGainDB := 20 * math.Log10(harmAfter/math.Max(harmBefore, 1e-9))
	if harmGainDB < 10 {
		t.Errorf("expected a material rise at %.0fHz, got %.1fdB (before=%.5f after=%.5f)",
			harmonic, harmGainDB, harmBefore, harmAfter)
	}

	// The fundamental (4kHz) sits above the corner, so it's fine for it
	// to remain in the wet path — the post-filter's job is only to stop
	// intermodulation products from folding down below the corner into
	// the mids (the flaw in the old unwired HarmonicExciter). Assert
	// that guarantee directly, in absolute terms (the source has ~no
	// energy at 500Hz to begin with, so a before/after ratio is noisy).
	if midsAfter > 0.01 {
		t.Errorf("expected near-silence well below the corner (%.0fHz), got RMS %.5f — harmonics are folding down into the mids",
			midsProbe, midsAfter)
	}
}

func TestExciterParamClampAndEnabled(t *testing.T) {
	ex := NewBassExciter(44100)

	if ex.Enabled() {
		t.Error("exciter should start disabled")
	}

	ex.SetParam("drive", 5)
	if v, _ := ex.GetParam("drive"); v != 1 {
		t.Errorf("drive should clamp to 1, got %f", v)
	}
	ex.SetParam("drive", -1)
	if v, _ := ex.GetParam("drive"); v != 0 {
		t.Errorf("drive should clamp to 0, got %f", v)
	}

	ex.SetParam("mix", 5)
	if v, _ := ex.GetParam("mix"); v != 1 {
		t.Errorf("mix should clamp to 1, got %f", v)
	}

	ex.SetParam("frequency", 999999)
	if v, _ := ex.GetParam("frequency"); v != 20000 {
		t.Errorf("frequency should clamp to 20000, got %f", v)
	}
	ex.SetParam("frequency", 1)
	if v, _ := ex.GetParam("frequency"); v != 20 {
		t.Errorf("frequency should clamp to 20, got %f", v)
	}

	if err := ex.SetParam("enabled", 1); err != nil {
		t.Fatal(err)
	}
	if !ex.Enabled() {
		t.Error("enabled param 1 should enable the processor")
	}
	if v, _ := ex.GetParam("enabled"); v != 1 {
		t.Errorf("GetParam(enabled) should report 1, got %f", v)
	}
	if v := ex.GetParams()["enabled"]; v != 1 {
		t.Errorf("GetParams()[enabled] should report 1, got %f", v)
	}

	if err := ex.SetParam("enabled", 0); err != nil {
		t.Fatal(err)
	}
	if ex.Enabled() {
		t.Error("enabled param 0 should disable the processor")
	}

	if _, err := ex.GetParam("bogus"); err == nil {
		t.Error("expected error for unknown param")
	}
	if err := ex.SetParam("bogus", 1); err == nil {
		t.Error("expected error for unknown param")
	}
}

func TestExciterSampleRateAware(t *testing.T) {
	sr := 44100.0
	ex := NewBassExciter(sr)
	ex.SetEnabled(true)
	ex.SetParam("drive", 0.6)
	ex.SetParam("mix", 0.5)

	newSR := 96000.0
	ex.SetSampleRate(newSR)

	length := int(newSR)
	fundamental := 60.0
	thirdHarmonic := fundamental * 3

	buf := generateSine(fundamental, newSR, 1, length)
	harmBefore := bandRMS(buf.Samples[0], thirdHarmonic, newSR)

	if err := ex.Process(buf); err != nil {
		t.Fatal(err)
	}

	harmAfter := bandRMS(buf.Samples[0], thirdHarmonic, newSR)
	harmGainDB := 20 * math.Log10(harmAfter/math.Max(harmBefore, 1e-9))
	if harmGainDB < 10 {
		t.Errorf("expected exciter to still generate harmonics after sample rate change, got %.1fdB rise", harmGainDB)
	}
}
