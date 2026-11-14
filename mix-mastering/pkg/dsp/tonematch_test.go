package dsp

import (
	"math"
	"testing"
)

// Level (dB) of a sine of the given frequency after ToneMatch, measured
// away from the buffer's ends.
func toneMatchSineDB(t *testing.T, tm *ToneMatch, freq float64) float64 {
	t.Helper()
	const sr = 44100
	n := 3 * sr // several convolution blocks
	buf := NewAudioBuffer(1, n, sr)
	for i := range buf.Samples[0] {
		buf.Samples[0][i] = 0.5 * math.Sin(2*math.Pi*freq*float64(i)/sr)
	}
	if err := tm.Process(buf); err != nil {
		t.Fatal(err)
	}
	var sum float64
	for _, v := range buf.Samples[0][sr : 2*sr] {
		sum += v * v
	}
	return 10*math.Log10(sum/sr) - 10*math.Log10(0.125)
}

func TestToneMatchFollowsCurve(t *testing.T) {
	tm := NewToneMatch(44100)
	tm.SetEnabled(true)
	tm.SetParam("g.17", 4)  // 1016 Hz
	tm.SetParam("g.24", -3) // 5120 Hz
	for _, c := range []struct{ freq, want float64 }{
		{ToneMatchFreq(17), 4},
		{ToneMatchFreq(24), -3},
		{100, 0},
		{(ToneMatchFreq(17) + ToneMatchFreq(18)) / 2, ToneMatchDB(tm.Gains[:], (ToneMatchFreq(17)+ToneMatchFreq(18))/2)},
	} {
		if got := toneMatchSineDB(t, tm, c.freq); math.Abs(got-c.want) > 0.15 {
			t.Errorf("%.0f Hz: %.2f dB, want %.2f", c.freq, got, c.want)
		}
	}

	tm.SetParam("amount", 0.5)
	if got := toneMatchSineDB(t, tm, ToneMatchFreq(17)); math.Abs(got-2) > 0.15 {
		t.Errorf("amount 0.5: %.2f dB at 1 kHz, want 2", got)
	}
}

// The output stays aligned with the input and continuous across the
// convolution blocks: a flat +3 dB curve is the input times 1.41.
func TestToneMatchAlignedAndSeamless(t *testing.T) {
	const sr = 44100
	tm := NewToneMatch(sr)
	tm.SetEnabled(true)
	for i := 0; i < ToneMatchBands; i++ {
		tm.Gains[i] = 3
	}
	n := 3 * sr
	buf := NewAudioBuffer(2, n, sr)
	in := make([]float64, n)
	for i := range in {
		in[i] = 0.3*math.Sin(2*math.Pi*440*float64(i)/sr) + 0.2*math.Sin(2*math.Pi*3170*float64(i)/sr)
		buf.Samples[0][i], buf.Samples[1][i] = in[i], -in[i]
	}
	tm.Process(buf)
	g := math.Pow(10, 3.0/20)
	for i := 0; i < n; i++ {
		if math.Abs(buf.Samples[0][i]-in[i]*g) > 1e-3 || math.Abs(buf.Samples[1][i]+in[i]*g) > 1e-3 {
			t.Fatalf("sample %d: %.5f / %.5f, want ±%.5f", i, buf.Samples[0][i], buf.Samples[1][i], in[i]*g)
		}
	}
}

func TestToneMatchFlatOrOffIsUntouched(t *testing.T) {
	const sr = 44100
	for _, enabled := range []bool{false, true} {
		tm := NewToneMatch(sr)
		tm.SetEnabled(enabled)
		if !enabled {
			tm.Gains[10] = 6
		}
		buf := NewAudioBuffer(1, sr, sr)
		for i := range buf.Samples[0] {
			buf.Samples[0][i] = math.Sin(float64(i) * 0.1)
		}
		tm.Process(buf)
		for i, v := range buf.Samples[0] {
			if v != math.Sin(float64(i)*0.1) {
				t.Fatalf("enabled=%v: sample %d changed", enabled, i)
			}
		}
	}
}
