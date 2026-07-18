package dsp

import (
	"math"
	"testing"
)

// generateSine creates a sine wave buffer at the given frequency.
func generateSine(freq, sampleRate float64, channels, length int) *AudioBuffer {
	buf := NewAudioBuffer(channels, length, int(sampleRate))
	for ch := 0; ch < channels; ch++ {
		for i := 0; i < length; i++ {
			buf.Samples[ch][i] = math.Sin(2.0 * math.Pi * freq * float64(i) / sampleRate)
		}
	}
	return buf
}

// rms calculates the root mean square of a slice.
func rms(samples []float64) float64 {
	var sum float64
	for _, s := range samples {
		sum += s * s
	}
	return math.Sqrt(sum / float64(len(samples)))
}

func TestAudioBuffer(t *testing.T) {
	buf := NewAudioBuffer(2, 44100, 44100)
	if buf.Channels() != 2 {
		t.Errorf("expected 2 channels, got %d", buf.Channels())
	}
	if buf.Length() != 44100 {
		t.Errorf("expected 44100 samples, got %d", buf.Length())
	}
}

func TestBiquadLowPass(t *testing.T) {
	sr := 44100.0
	length := 44100
	// 100Hz sine should pass through a 1kHz low-pass filter mostly unchanged
	buf := generateSine(100, sr, 1, length)
	rmsBeforeLow := rms(buf.Samples[0])

	f := NewBiquadFilter(BiquadLowPass, 1000, 0.707, 0, sr, 1)
	for i := range buf.Samples[0] {
		buf.Samples[0][i] = f.ProcessSample(buf.Samples[0][i], 0)
	}
	rmsAfterLow := rms(buf.Samples[0])

	// Should retain most energy (within 1 dB)
	ratio := rmsAfterLow / rmsBeforeLow
	if ratio < 0.9 || ratio > 1.1 {
		t.Errorf("100Hz through 1kHz LPF: expected ~1.0 ratio, got %.3f", ratio)
	}

	// 10kHz sine should be heavily attenuated by a 1kHz LPF
	buf2 := generateSine(10000, sr, 1, length)
	rmsBefore10k := rms(buf2.Samples[0])

	f2 := NewBiquadFilter(BiquadLowPass, 1000, 0.707, 0, sr, 1)
	for i := range buf2.Samples[0] {
		buf2.Samples[0][i] = f2.ProcessSample(buf2.Samples[0][i], 0)
	}
	rmsAfter10k := rms(buf2.Samples[0])

	attenuation := rmsAfter10k / rmsBefore10k
	if attenuation > 0.1 {
		t.Errorf("10kHz through 1kHz LPF: expected heavy attenuation, got %.3f", attenuation)
	}
}

func TestParametricEQ(t *testing.T) {
	sr := 44100.0
	buf := generateSine(1000, sr, 2, 44100)
	eq := NewParametricEQ(sr, 2)

	// Boost 1kHz by 6dB
	eq.SetParam("band.2.freq", 1000)
	eq.SetParam("band.2.gain", 6)
	eq.SetParam("band.2.q", 1.0)

	rmsBefore := rms(buf.Samples[0])
	if err := eq.Process(buf); err != nil {
		t.Fatal(err)
	}
	rmsAfter := rms(buf.Samples[0])

	// Should see about 6dB boost (factor of ~2)
	boostDB := 20 * math.Log10(rmsAfter/rmsBefore)
	if boostDB < 3 || boostDB > 9 {
		t.Errorf("1kHz +6dB boost: expected ~6dB, got %.1fdB", boostDB)
	}
}

func TestCompressor(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := generateSine(1000, sr, 1, length)

	// Make it loud (-6dBFS peak)
	for i := range buf.Samples[0] {
		buf.Samples[0][i] *= 0.5
	}

	comp := NewCompressor(sr)
	comp.Threshold = -12
	comp.Ratio = 4
	comp.Attack = 1
	comp.Release = 50

	rmsBefore := rms(buf.Samples[0])
	if err := comp.Process(buf); err != nil {
		t.Fatal(err)
	}
	rmsAfter := rms(buf.Samples[0])

	// Compressor should reduce level
	if rmsAfter >= rmsBefore {
		t.Errorf("compressor did not reduce level: before=%.4f, after=%.4f", rmsBefore, rmsAfter)
	}

	// Check gain reduction happened
	reductionDB := 20 * math.Log10(rmsAfter/rmsBefore)
	if reductionDB > -1 {
		t.Errorf("expected at least 1dB reduction, got %.1fdB", reductionDB)
	}
}

func TestLimiter(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := generateSine(1000, sr, 1, length)

	limiter := NewLimiter(sr)
	limiter.Ceiling = -6 // -6dBFS ceiling

	if err := limiter.Process(buf); err != nil {
		t.Fatal(err)
	}

	ceilingLin := math.Pow(10, -6.0/20.0)
	// Check that no sample exceeds ceiling (with small tolerance for the delay buffer)
	// Skip the first few samples due to lookahead delay
	skip := int(5 * 0.001 * sr) // lookahead time
	for i := skip; i < length; i++ {
		if math.Abs(buf.Samples[0][i]) > ceilingLin*1.01 {
			t.Errorf("sample %d exceeds ceiling: %.4f > %.4f", i, math.Abs(buf.Samples[0][i]), ceilingLin)
			break
		}
	}
}

func TestCompressorParams(t *testing.T) {
	comp := NewCompressor(44100)
	if err := comp.SetParam("threshold", -20); err != nil {
		t.Fatal(err)
	}
	val, err := comp.GetParam("threshold")
	if err != nil {
		t.Fatal(err)
	}
	if val != -20 {
		t.Errorf("expected -20, got %f", val)
	}

	params := comp.GetParams()
	if params["threshold"] != -20 {
		t.Error("GetParams threshold mismatch")
	}
}

func TestEQParams(t *testing.T) {
	eq := NewParametricEQ(44100, 2)
	params := eq.GetParams()
	if len(params) == 0 {
		t.Error("expected EQ params")
	}

	if err := eq.SetParam("band.0.freq", 50); err != nil {
		t.Fatal(err)
	}
	val, _ := eq.GetParam("band.0.freq")
	if val != 50 {
		t.Errorf("expected 50, got %f", val)
	}
}

func TestDbConversions(t *testing.T) {
	// 0 dB = 1.0 linear
	if math.Abs(dbToLinear(0)-1.0) > 0.0001 {
		t.Errorf("0dB should be 1.0, got %f", dbToLinear(0))
	}
	// -6 dB ≈ 0.5012
	if math.Abs(dbToLinear(-6)-0.5012) > 0.01 {
		t.Errorf("-6dB should be ~0.5, got %f", dbToLinear(-6))
	}
	// Round-trip
	if math.Abs(linearToDb(dbToLinear(-12))-(-12)) > 0.001 {
		t.Error("round-trip failed for -12dB")
	}
}
