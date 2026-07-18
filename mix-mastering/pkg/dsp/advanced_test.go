package dsp

import (
	"math"
	"testing"
)

func TestLUFSMeter(t *testing.T) {
	sr := 44100.0
	length := 44100 * 2 // 2 seconds
	buf := generateSine(1000, sr, 2, length)

	// Scale to known level
	for ch := 0; ch < 2; ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.5
		}
	}

	meter := NewLUFSMeter(sr, 2)
	lufs := meter.MeasureIntegrated(buf)

	// A 0.5 amplitude 1kHz sine should be somewhere around -10 to -6 LUFS
	if lufs < -20 || lufs > 0 {
		t.Errorf("LUFS measurement out of expected range: %.1f", lufs)
	}
}

func TestLoudnessNormalizer(t *testing.T) {
	sr := 44100.0
	length := 44100 * 2
	buf := generateSine(1000, sr, 2, length)

	for ch := 0; ch < 2; ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.1
		}
	}

	norm := NewLoudnessNormalizer(sr)
	norm.TargetLUFS = -14

	if err := norm.Process(buf); err != nil {
		t.Fatal(err)
	}

	// Check it got louder
	var peak float64
	for _, s := range buf.Samples[0] {
		if math.Abs(s) > peak {
			peak = math.Abs(s)
		}
	}
	if peak < 0.2 {
		t.Errorf("normalizer didn't increase level enough, peak=%.3f", peak)
	}
}

func TestStereoWidener(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := NewAudioBuffer(2, length, int(sr))

	// Create a signal with some stereo content
	for i := 0; i < length; i++ {
		buf.Samples[0][i] = math.Sin(2*math.Pi*440*float64(i)/sr) * 0.5
		buf.Samples[1][i] = math.Sin(2*math.Pi*440*float64(i)/sr+0.5) * 0.5
	}

	// Widen
	sw := NewStereoWidener()
	sw.Width = 2.0

	origDiff := rms(diffChannels(buf))
	if err := sw.Process(buf); err != nil {
		t.Fatal(err)
	}
	widenedDiff := rms(diffChannels(buf))

	// Wider stereo should have more L-R difference
	if widenedDiff <= origDiff {
		t.Errorf("stereo widener didn't increase width")
	}
}

func diffChannels(buf *AudioBuffer) []float64 {
	diff := make([]float64, buf.Length())
	for i := range diff {
		diff[i] = buf.Samples[0][i] - buf.Samples[1][i]
	}
	return diff
}

func TestStereoWidenerMono(t *testing.T) {
	sw := NewStereoWidener()
	sw.Width = 0 // full mono

	buf := NewAudioBuffer(2, 1000, 44100)
	for i := 0; i < 1000; i++ {
		buf.Samples[0][i] = 0.5
		buf.Samples[1][i] = -0.5
	}

	sw.Process(buf)

	// In mono mode, L and R should be identical
	for i := 0; i < 1000; i++ {
		if math.Abs(buf.Samples[0][i]-buf.Samples[1][i]) > 1e-10 {
			t.Errorf("mono mode: L and R differ at sample %d", i)
			break
		}
	}
}

func TestMultibandCompressor(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := generateSine(1000, sr, 2, length)

	mb := NewMultibandCompressor(sr, 2)
	rmsBefore := rms(buf.Samples[0])

	if err := mb.Process(buf); err != nil {
		t.Fatal(err)
	}

	rmsAfter := rms(buf.Samples[0])
	// Multiband should process without error and not amplify silence
	if rmsAfter > rmsBefore*2 {
		t.Errorf("multiband compressor unexpectedly amplified signal")
	}
}

func TestHarmonicExciter(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := generateSine(5000, sr, 2, length)

	he := NewHarmonicExciter(sr)
	rmsBefore := rms(buf.Samples[0])

	if err := he.Process(buf); err != nil {
		t.Fatal(err)
	}

	rmsAfter := rms(buf.Samples[0])
	// Exciter should add harmonics (increase RMS slightly)
	if rmsAfter <= rmsBefore*0.99 {
		t.Errorf("exciter reduced signal too much: before=%.4f, after=%.4f", rmsBefore, rmsAfter)
	}
}

func TestDeEsser(t *testing.T) {
	sr := 44100.0
	length := 44100
	// 6kHz sine simulates sibilance
	buf := generateSine(6000, sr, 2, length)

	de := NewDeEsser(sr)
	de.Threshold = -20

	rmsBefore := rms(buf.Samples[0])
	if err := de.Process(buf); err != nil {
		t.Fatal(err)
	}
	rmsAfter := rms(buf.Samples[0])

	// De-esser should reduce 6kHz signal
	if rmsAfter >= rmsBefore {
		t.Errorf("de-esser didn't reduce sibilance: before=%.4f, after=%.4f", rmsBefore, rmsAfter)
	}
}

func TestMidSideProcessor(t *testing.T) {
	sr := 44100.0
	buf := NewAudioBuffer(2, 1000, int(sr))
	for i := 0; i < 1000; i++ {
		buf.Samples[0][i] = 0.5
		buf.Samples[1][i] = 0.3
	}

	ms := NewMidSideProcessor(sr)
	ms.SideGain = 6 // boost side

	if err := ms.Process(buf); err != nil {
		t.Fatal(err)
	}

	// Side content should be amplified
	diff := math.Abs(buf.Samples[0][500] - buf.Samples[1][500])
	origDiff := math.Abs(0.5 - 0.3)
	if diff <= origDiff {
		t.Errorf("mid/side processor didn't boost side channel")
	}
}
