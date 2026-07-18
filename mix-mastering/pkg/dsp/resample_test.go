package dsp

import (
	"math"
	"testing"
)

func TestResampleUpsamplePreservesSignal(t *testing.T) {
	buf := generateSine(1000, 44100, 2, 44100)
	for ch := 0; ch < 2; ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.5
		}
	}

	out, err := Resample(buf, 48000)
	if err != nil {
		t.Fatal(err)
	}

	if out.SampleRate != 48000 {
		t.Errorf("expected 48000Hz, got %d", out.SampleRate)
	}
	if out.Length() != 48000 {
		t.Errorf("expected 48000 samples, got %d", out.Length())
	}

	// RMS preserved (compare interior to avoid edge effects).
	rmsIn := rms(buf.Samples[0][1000:43000])
	rmsOut := rms(out.Samples[0][1100:46000])
	diffDB := 20 * math.Log10(rmsOut/rmsIn)
	if math.Abs(diffDB) > 0.1 {
		t.Errorf("upsampling changed level by %.3f dB", diffDB)
	}
}

func TestResampleDownsampleAntiAlias(t *testing.T) {
	// A 23kHz tone at 48kHz is above the 44.1kHz Nyquist (22.05kHz) and
	// must be strongly attenuated by the resampler's anti-alias filter.
	buf := generateSine(23000, 48000, 1, 48000)
	rmsIn := rms(buf.Samples[0])

	out, err := Resample(buf, 44100)
	if err != nil {
		t.Fatal(err)
	}
	rmsOut := rms(out.Samples[0][1000 : out.Length()-1000])

	attenuationDB := 20 * math.Log10(rmsOut/rmsIn)
	if attenuationDB > -40 {
		t.Errorf("expected >40dB attenuation of super-Nyquist content, got %.1f dB", attenuationDB)
	}
}

func TestResampleSameRateNoop(t *testing.T) {
	buf := generateSine(1000, 44100, 1, 4410)
	out, err := Resample(buf, 44100)
	if err != nil {
		t.Fatal(err)
	}
	if out != buf {
		t.Error("same-rate resample should return the input buffer")
	}
}

func TestGainReductionMeters(t *testing.T) {
	sr := 44100.0
	buf := generateSine(1000, sr, 1, 44100)
	for i := range buf.Samples[0] {
		buf.Samples[0][i] *= 0.9
	}

	comp := NewCompressor(sr)
	comp.Threshold = -20
	if err := comp.Process(buf); err != nil {
		t.Fatal(err)
	}
	maxDB, avgDB := comp.GainReduction()
	if maxDB <= 0 || avgDB <= 0 {
		t.Errorf("compressor should report gain reduction: max=%.2f avg=%.2f", maxDB, avgDB)
	}
	if avgDB > maxDB {
		t.Errorf("average GR (%.2f) cannot exceed max GR (%.2f)", avgDB, maxDB)
	}

	limiter := NewLimiter(sr)
	limiter.Ceiling = -6
	buf2 := generateSine(1000, sr, 1, 44100)
	if err := limiter.Process(buf2); err != nil {
		t.Fatal(err)
	}
	maxDB, avgDB = limiter.GainReduction()
	// A full-scale sine into a -6dB ceiling needs ~6dB of reduction.
	if maxDB < 5 || maxDB > 7 {
		t.Errorf("limiter max GR should be ~6dB, got %.2f", maxDB)
	}
	if avgDB <= 0 || avgDB > maxDB {
		t.Errorf("limiter avg GR out of range: avg=%.2f max=%.2f", avgDB, maxDB)
	}

	// A quiet signal should report no reduction.
	quiet := generateSine(1000, sr, 1, 4410)
	for i := range quiet.Samples[0] {
		quiet.Samples[0][i] *= 0.1
	}
	limiter2 := NewLimiter(sr)
	limiter2.Process(quiet)
	maxDB, _ = limiter2.GainReduction()
	if maxDB > 0.01 {
		t.Errorf("quiet signal should need no limiting, got %.2f dB", maxDB)
	}
}
