package dsp

import (
	"math"
	"testing"
)

// TestLimiterBrickwall verifies the core limiter guarantee: no output
// sample ever exceeds the ceiling, including isolated spikes near the
// start and end of the buffer.
func TestLimiterBrickwall(t *testing.T) {
	sr := 44100.0
	length := 44100
	buf := generateSine(1000, sr, 2, length)

	// Add hot spikes at awkward positions.
	for _, idx := range []int{0, 3, 100, 22050, length - 2, length - 1} {
		buf.Samples[0][idx] = 1.9
		buf.Samples[1][idx] = -1.9
	}

	limiter := NewLimiter(sr)
	limiter.Ceiling = -1.0
	if err := limiter.Process(buf); err != nil {
		t.Fatal(err)
	}

	ceilingLin := dbToLinear(-1.0)
	for ch := 0; ch < 2; ch++ {
		for i, s := range buf.Samples[ch] {
			if math.Abs(s) > ceilingLin*(1+1e-9) {
				t.Fatalf("ch %d sample %d exceeds ceiling: %.6f > %.6f", ch, i, math.Abs(s), ceilingLin)
			}
		}
	}
}

// TestLimiterTruePeakCeiling verifies the ceiling holds for true peak
// (BS.1770-4 4x interpolation), not just samples: a sine at fs/4 sampled
// 45° off its crests has every sample 3 dB below its real peak, the
// classic inter-sample overshoot. Quiet passages away from the hot burst
// must come through untouched — the guarantee must come from the
// limiter's envelope, not the whole-buffer backstop trim.
func TestLimiterTruePeakCeiling(t *testing.T) {
	sr := 44100.0
	quiet, hot := 44100, 22050
	length := quiet + hot + quiet
	buf := NewAudioBuffer(2, length, int(sr))
	rng := uint32(12345)
	noise := func() float64 { // deterministic LCG, uniform in [-1, 1)
		rng = rng*1664525 + 1013904223
		return float64(rng)/float64(1<<31) - 1
	}
	for i := 0; i < length; i++ {
		var v float64
		if i >= quiet && i < quiet+hot {
			v = 1.6*math.Sin(math.Pi/2*float64(i)+math.Pi/4) + 0.4*noise()
		} else {
			v = 0.1 * math.Sin(2*math.Pi*440*float64(i)/sr)
		}
		buf.Samples[0][i] = v
		buf.Samples[1][i] = v
	}
	orig := make([]float64, length)
	copy(orig, buf.Samples[0])

	limiter := NewLimiter(sr)
	limiter.Ceiling = -1.0
	if err := limiter.Process(buf); err != nil {
		t.Fatal(err)
	}

	tp := NewLUFSMeter(sr, 2).MeasureTruePeak(buf)
	if tp > -1.0+1e-6 {
		t.Fatalf("true peak %.3f dBTP exceeds -1.0 ceiling", tp)
	}
	// Well before the burst (beyond the lookahead) and well after it
	// (beyond the release), the quiet tone is untouched.
	for _, i := range []int{1000, quiet / 2, length - 1000} {
		if math.Abs(buf.Samples[0][i]-orig[i]) > 1e-6 {
			t.Fatalf("quiet sample %d altered: %.6f != %.6f", i, buf.Samples[0][i], orig[i])
		}
	}
}

// TestLimiterZeroLatency verifies output stays time-aligned with input:
// a signal entirely below the ceiling passes through unchanged.
func TestLimiterZeroLatency(t *testing.T) {
	sr := 44100.0
	length := 4410
	buf := generateSine(1000, sr, 1, length)
	for i := range buf.Samples[0] {
		buf.Samples[0][i] *= 0.25 // ~-12dBFS, far below ceiling
	}
	original := make([]float64, length)
	copy(original, buf.Samples[0])

	limiter := NewLimiter(sr)
	limiter.Ceiling = -0.3
	if err := limiter.Process(buf); err != nil {
		t.Fatal(err)
	}

	for i := range original {
		if math.Abs(buf.Samples[0][i]-original[i]) > 1e-9 {
			t.Fatalf("sample %d changed on sub-ceiling signal: %.9f != %.9f", i, buf.Samples[0][i], original[i])
		}
	}
}

// TestLUFSGating verifies integrated loudness gating: appending silence to
// a signal must not change its integrated loudness (the -70 LUFS absolute
// gate discards silent blocks).
func TestLUFSGating(t *testing.T) {
	sr := 44100.0
	toneLen := 44100 * 2
	tone := generateSine(1000, sr, 2, toneLen)
	for ch := 0; ch < 2; ch++ {
		for i := range tone.Samples[ch] {
			tone.Samples[ch][i] *= 0.25
		}
	}

	meter := NewLUFSMeter(sr, 2)
	toneOnly := meter.MeasureIntegrated(tone)

	// Same tone with 2s of silence appended.
	padded := NewAudioBuffer(2, toneLen*2, int(sr))
	for ch := 0; ch < 2; ch++ {
		copy(padded.Samples[ch], tone.Samples[ch])
	}
	withSilence := meter.MeasureIntegrated(padded)

	if math.Abs(toneOnly-withSilence) > 0.5 {
		t.Errorf("silence changed gated loudness: tone=%.2f LUFS, tone+silence=%.2f LUFS", toneOnly, withSilence)
	}
}

// TestLUFSMomentaryKWeighted verifies momentary blocks use the same
// K-weighted scale as integrated loudness: for a steady tone, the
// momentary values should match the integrated value closely.
func TestLUFSMomentaryKWeighted(t *testing.T) {
	sr := 44100.0
	buf := generateSine(1000, sr, 2, 44100*2)
	for ch := 0; ch < 2; ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.25
		}
	}

	meter := NewLUFSMeter(sr, 2)
	integrated := meter.MeasureIntegrated(buf)
	momentary := meter.MeasureMomentary(buf)
	if len(momentary) == 0 {
		t.Fatal("no momentary blocks")
	}

	// Skip the first blocks (filter warm-up).
	mid := momentary[len(momentary)/2]
	if math.Abs(mid-integrated) > 1.0 {
		t.Errorf("momentary and integrated diverge for steady tone: momentary=%.2f, integrated=%.2f", mid, integrated)
	}
}

// TestTruePeakOversampling verifies inter-sample peaks are detected: a
// sine near quarter Nyquist sampled off its crests has a true peak above
// its sample peak.
func TestTruePeakOversampling(t *testing.T) {
	sr := 44100.0
	length := 4410
	buf := NewAudioBuffer(1, length, int(sr))
	// Frequency and phase chosen so sample points straddle the crests.
	freq := sr / 4.0
	for i := 0; i < length; i++ {
		buf.Samples[0][i] = 0.9 * math.Sin(2*math.Pi*freq*float64(i)/sr+math.Pi/4)
	}

	var samplePeak float64
	for _, s := range buf.Samples[0] {
		if a := math.Abs(s); a > samplePeak {
			samplePeak = a
		}
	}

	meter := NewLUFSMeter(sr, 1)
	truePeakDB := meter.MeasureTruePeak(buf)
	samplePeakDB := 20 * math.Log10(samplePeak)

	if truePeakDB <= samplePeakDB+0.5 {
		t.Errorf("true peak did not detect inter-sample overs: TP=%.2f dBTP, SP=%.2f dBFS", truePeakDB, samplePeakDB)
	}
}

// TestDefaultEQTransparent verifies the default EQ chain passes audio
// through unchanged (all gains at zero, filter bands disabled).
func TestDefaultEQTransparent(t *testing.T) {
	sr := 44100.0
	buf := generateSine(50, sr, 2, 44100) // low frequency would expose an active HPF
	original := make([]float64, buf.Length())
	copy(original, buf.Samples[0])

	eq := NewParametricEQ(sr, 2)
	if err := eq.Process(buf); err != nil {
		t.Fatal(err)
	}

	rmsBefore := rms(original)
	rmsAfter := rms(buf.Samples[0])
	diffDB := 20 * math.Log10(rmsAfter/rmsBefore)
	if math.Abs(diffDB) > 0.1 {
		t.Errorf("default EQ is not transparent: %.2f dB change at 50Hz", diffDB)
	}
}

// TestMultibandFlatSum verifies the LR4 crossovers recombine to a roughly
// flat response: with compression disabled, output level stays within 1 dB
// of input across the spectrum.
func TestMultibandFlatSum(t *testing.T) {
	sr := 44100.0
	for _, freq := range []float64{50, 200, 1000, 4000, 10000} {
		buf := generateSine(freq, sr, 1, 44100)
		for i := range buf.Samples[0] {
			buf.Samples[0][i] *= 0.1 // below all thresholds
		}
		rmsBefore := rms(buf.Samples[0][22050:]) // skip filter transient

		mb := NewMultibandCompressor(sr, 1)
		for _, band := range mb.Bands {
			band.Compressor.Ratio = 1 // no compression
		}
		if err := mb.Process(buf); err != nil {
			t.Fatal(err)
		}
		rmsAfter := rms(buf.Samples[0][22050:])

		diffDB := 20 * math.Log10(rmsAfter/rmsBefore)
		if math.Abs(diffDB) > 1.0 {
			t.Errorf("multiband sum not flat at %.0fHz: %.2f dB deviation", freq, diffDB)
		}
	}
}

// TestCompressorAutoMakeup verifies auto makeup gain is actually applied.
func TestCompressorAutoMakeup(t *testing.T) {
	sr := 44100.0
	makeBuf := func() *AudioBuffer {
		b := generateSine(1000, sr, 1, 44100)
		for i := range b.Samples[0] {
			b.Samples[0][i] *= 0.5
		}
		return b
	}

	manual := NewCompressor(sr)
	manual.Threshold = -20
	bufManual := makeBuf()
	manual.Process(bufManual)

	auto := NewCompressor(sr)
	auto.Threshold = -20
	auto.SetParam("auto_makeup", 1)
	bufAuto := makeBuf()
	auto.Process(bufAuto)

	if rms(bufAuto.Samples[0]) <= rms(bufManual.Samples[0]) {
		t.Error("auto makeup did not increase output level over no makeup")
	}
}
