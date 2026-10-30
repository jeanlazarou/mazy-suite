package dsp

import (
	"math"
	"testing"
)

// toneDB is the level (dB re. full-scale sine) of the component at freq,
// from a Hann-windowed DFT over the whole signal — selective enough to
// read harmonics and aliases 60+ dB below a tone close by.
func toneDB(samples []float64, freq, sampleRate float64) float64 {
	n := len(samples)
	var re, im, wsum float64
	for i, s := range samples {
		w := 0.5 - 0.5*math.Cos(2*math.Pi*float64(i)/float64(n-1))
		ph := 2 * math.Pi * freq * float64(i) / sampleRate
		re += s * w * math.Cos(ph)
		im += s * w * math.Sin(ph)
		wsum += w
	}
	return 20 * math.Log10(2*math.Hypot(re, im)/wsum+1e-12)
}

func scaled(buf *AudioBuffer, gain float64) *AudioBuffer {
	for ch := range buf.Samples {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= gain
		}
	}
	return buf
}

func TestSaturationOffOrZeroDriveTransparent(t *testing.T) {
	sr := 44100.0
	for _, drive := range []float64{0.5, 0} {
		s := NewSaturation(sr)
		s.SetParam("drive", drive)
		if drive == 0 {
			s.SetEnabled(true)
		}
		buf := scaled(generateSine(200, sr, 2, 4410), 0.9)
		before := append([]float64(nil), buf.Samples[0]...)
		s.Process(buf)
		for i := range before {
			if buf.Samples[0][i] != before[i] {
				t.Fatalf("drive %v enabled=%v altered sample %d", drive, s.Enabled(), i)
			}
		}
	}
}

// Loud notes get low-order harmonics — the 2nd (warmth, from the
// asymmetry) above the 3rd — while the note itself keeps its level.
func TestSaturationAddsWarmHarmonics(t *testing.T) {
	sr := 44100.0
	buf := scaled(generateSine(200, sr, 1, 44100), 0.7)
	s := NewSaturation(sr)
	s.SetEnabled(true)
	s.SetParam("drive", 0.35)
	s.Process(buf)

	x := buf.Samples[0]
	fund := toneDB(x, 200, sr)
	h2 := toneDB(x, 400, sr) - fund
	h3 := toneDB(x, 600, sr) - fund
	if math.Abs(fund-20*math.Log10(0.7)) > 1.5 {
		t.Errorf("fundamental moved to %.1f dB", fund)
	}
	if h2 < -40 || h2 > -15 {
		t.Errorf("2nd harmonic %.1f dB re. fundamental, want a gentle -40..-15", h2)
	}
	if h3 >= h2 {
		t.Errorf("3rd harmonic (%.1f dB) should stay below the 2nd (%.1f dB)", h3, h2)
	}
	var mean float64
	for _, v := range x[4410:] {
		mean += v
	}
	if mean /= float64(len(x) - 4410); math.Abs(mean) > 1e-3 {
		t.Errorf("DC offset %.5f left by the asymmetry", mean)
	}
}

// Quiet passages pass through almost untouched (unit slope at zero).
func TestSaturationLeavesQuietSignalsAlone(t *testing.T) {
	sr := 44100.0
	buf := scaled(generateSine(200, sr, 1, 44100), 0.01) // -40 dBFS
	s := NewSaturation(sr)
	s.SetEnabled(true)
	s.SetParam("drive", 0.35)
	s.Process(buf)
	fund := toneDB(buf.Samples[0], 200, sr)
	if h2 := toneDB(buf.Samples[0], 400, sr) - fund; h2 > -55 {
		t.Errorf("-40 dBFS note got a 2nd harmonic at %.1f dB, want below -55", h2)
	}
}

// The harmonics of a high note land above the original Nyquist; the 2x
// oversampling must keep them from folding back into the audible band.
func TestSaturationSuppressesAliasing(t *testing.T) {
	sr := 44100.0
	f := 15000.0
	buf := scaled(generateSine(f, sr, 1, 44100), 0.9)
	s := NewSaturation(sr)
	s.SetEnabled(true)
	s.SetParam("drive", 1)
	s.Process(buf)
	fund := toneDB(buf.Samples[0], f, sr)
	alias2 := toneDB(buf.Samples[0], sr-2*f, sr) - fund // 30 kHz folds to 14.1 kHz
	alias3 := toneDB(buf.Samples[0], 3*f-sr, sr) - fund // 45 kHz folds to 900 Hz
	if alias2 > -60 || alias3 > -60 {
		t.Errorf("aliases at %.1f dB (2nd) and %.1f dB (3rd) re. the tone, want below -60", alias2, alias3)
	}
}

func TestSaturationParams(t *testing.T) {
	s := NewSaturation(48000)
	if s.Enabled() {
		t.Error("saturation should start disabled")
	}
	s.SetParam("enabled", 1)
	s.SetParam("drive", 2)
	p := s.GetParams()
	if p["enabled"] != 1 || p["drive"] != 1 || !s.Enabled() {
		t.Errorf("params = %v", p)
	}
	if err := s.SetParam("mix", 1); err == nil {
		t.Error("expected error for unknown param")
	}
}
