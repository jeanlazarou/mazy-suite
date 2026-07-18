package analysis

import (
	"math"
	"testing"

	"github.com/audiomaster/mastering/pkg/dsp"
)

func generateSine(freq, sampleRate float64, channels, length int) *dsp.AudioBuffer {
	buf := dsp.NewAudioBuffer(channels, length, int(sampleRate))
	for ch := 0; ch < channels; ch++ {
		for i := 0; i < length; i++ {
			buf.Samples[ch][i] = 0.5 * math.Sin(2*math.Pi*freq*float64(i)/sampleRate)
		}
	}
	return buf
}

func TestAnalyze(t *testing.T) {
	buf := generateSine(1000, 44100, 2, 44100*2)
	result := Analyze(buf)

	if result.Spectrum == nil {
		t.Fatal("spectrum analysis missing")
	}
	if result.Dynamics == nil {
		t.Fatal("dynamics analysis missing")
	}
	if result.Loudness == nil {
		t.Fatal("loudness analysis missing")
	}
	if result.StereoField == nil {
		t.Fatal("stereo analysis missing")
	}

	// Peak should be near -6dBFS for 0.5 amplitude
	if result.Dynamics.PeakDB < -7 || result.Dynamics.PeakDB > -5 {
		t.Errorf("unexpected peak: %.1f dBFS", result.Dynamics.PeakDB)
	}

	// Stereo correlation should be ~1.0 for identical channels
	if result.StereoField.Correlation < 0.99 {
		t.Errorf("unexpected stereo correlation: %.3f", result.StereoField.Correlation)
	}
}

func TestFFT(t *testing.T) {
	n := 1024
	data := make([]complex128, n)
	sr := 44100.0
	freq := 1000.0
	for i := 0; i < n; i++ {
		data[i] = complex(math.Sin(2*math.Pi*freq*float64(i)/sr), 0)
	}

	result := fft(data)
	if len(result) != n {
		t.Fatalf("FFT length mismatch: %d != %d", len(result), n)
	}

	// Find peak bin
	var peakBin int
	var peakMag float64
	for i := 1; i < n/2; i++ {
		mag := math.Sqrt(real(result[i])*real(result[i]) + imag(result[i])*imag(result[i]))
		if mag > peakMag {
			peakMag = mag
			peakBin = i
		}
	}

	peakFreq := float64(peakBin) * sr / float64(n)
	if math.Abs(peakFreq-freq) > sr/float64(n) {
		t.Errorf("FFT peak at %.0f Hz, expected ~%.0f Hz", peakFreq, freq)
	}
}

func TestRecommend(t *testing.T) {
	buf := generateSine(1000, 44100, 2, 44100*2)
	result := Analyze(buf)

	for _, target := range []string{"headphones", "car", "studio", "phone", "bluetooth"} {
		rec, err := Recommend(result, target)
		if err != nil {
			t.Errorf("recommend %s: %v", target, err)
			continue
		}
		if len(rec.Suggestions) == 0 {
			t.Errorf("no suggestions for %s", target)
		}
		if len(rec.Processors) == 0 {
			t.Errorf("no processor settings for %s", target)
		}
	}

	// Unknown target should error
	_, err := Recommend(result, "mars")
	if err == nil {
		t.Error("expected error for unknown target")
	}
}
