package dsp

import (
	"fmt"
	"math"
	"sort"
)

// LUFSMeter measures loudness according to ITU-R BS.1770-4.
type LUFSMeter struct {
	sampleRate float64
	channels   int
}

// NewLUFSMeter creates a new LUFS meter.
func NewLUFSMeter(sampleRate float64, channels int) *LUFSMeter {
	return &LUFSMeter{sampleRate: sampleRate, channels: channels}
}

// kWeightedPower returns a per-sample running sum (prefix sum) of the
// K-weighted squared signal, summed across channels with unity weighting
// (mono/stereo). prefix[i] is the sum over samples [0, i).
func (m *LUFSMeter) kWeightedPower(buf *AudioBuffer) []float64 {
	channels := buf.Channels()
	length := buf.Length()
	power := make([]float64, length)

	for ch := 0; ch < channels; ch++ {
		// Stage 1: high shelf at ~1500Hz, +4dB (K-weighting pre-filter)
		stage1 := NewBiquadFilter(BiquadHighShelf, 1500, 0.707, 4.0, m.sampleRate, 1)
		// Stage 2: high-pass at ~38Hz (K-weighting RLB filter)
		stage2 := NewBiquadFilter(BiquadHighPass, 38, 0.5, 0, m.sampleRate, 1)
		for i := 0; i < length; i++ {
			s := buf.Samples[ch][i]
			s = stage1.ProcessSample(s, 0)
			s = stage2.ProcessSample(s, 0)
			power[i] += s * s
		}
	}

	prefix := make([]float64, length+1)
	for i := 0; i < length; i++ {
		prefix[i+1] = prefix[i] + power[i]
	}
	return prefix
}

// blockLoudness computes the loudness in LUFS of windows of the given size
// and hop, using a prefix sum from kWeightedPower.
func blockLoudness(prefix []float64, windowSize, hopSize int) []float64 {
	length := len(prefix) - 1
	var blocks []float64
	for start := 0; start+windowSize <= length; start += hopSize {
		meanSquare := (prefix[start+windowSize] - prefix[start]) / float64(windowSize)
		if meanSquare < 1e-20 {
			blocks = append(blocks, -200)
		} else {
			blocks = append(blocks, -0.691+10*math.Log10(meanSquare))
		}
	}
	return blocks
}

// MeasureIntegrated computes the gated integrated loudness per BS.1770-4:
// 400ms blocks with 75% overlap, a -70 LUFS absolute gate, then a relative
// gate 10 LU below the mean of the surviving blocks.
func (m *LUFSMeter) MeasureIntegrated(buf *AudioBuffer) float64 {
	if buf.Channels() == 0 || buf.Length() == 0 {
		return -200
	}

	prefix := m.kWeightedPower(buf)
	windowSize := int(0.4 * m.sampleRate)
	hopSize := windowSize / 4
	if windowSize < 1 || buf.Length() < windowSize {
		// Shorter than one block: measure the whole buffer ungated.
		meanSquare := prefix[len(prefix)-1] / float64(buf.Length())
		if meanSquare < 1e-20 {
			return -200
		}
		return -0.691 + 10*math.Log10(meanSquare)
	}

	blocks := blockLoudness(prefix, windowSize, hopSize)
	return gatedMean(blocks, -10)
}

// gatedMean applies the -70 LUFS absolute gate, then a relative gate
// `relGate` LU below the mean of surviving blocks, and returns the
// power-domain mean loudness of the blocks that pass both gates.
func gatedMean(blocks []float64, relGate float64) float64 {
	meanAbove := func(threshold float64) (float64, int) {
		var sum float64
		var n int
		for _, l := range blocks {
			if l > threshold {
				sum += math.Pow(10, (l+0.691)/10)
				n++
			}
		}
		if n == 0 {
			return -200, 0
		}
		return -0.691 + 10*math.Log10(sum/float64(n)), n
	}

	absGated, n := meanAbove(-70)
	if n == 0 {
		return -200
	}
	relGated, n := meanAbove(absGated + relGate)
	if n == 0 {
		return -200
	}
	return relGated
}

// GatedLoudness computes integrated loudness from 400ms momentary blocks
// per BS.1770-4 gating. Blocks from multiple tracks (MeasureMomentary per
// track) may be concatenated to measure a whole album as one program.
func GatedLoudness(blocks []float64) float64 {
	return gatedMean(blocks, -10)
}

// MeasureMomentary computes K-weighted momentary loudness (400ms windows,
// 100ms hop) in LUFS. These are also the gating blocks of the integrated
// measurement; feed them to GatedLoudness to integrate.
func (m *LUFSMeter) MeasureMomentary(buf *AudioBuffer) []float64 {
	if buf.Channels() == 0 || buf.Length() == 0 {
		return nil
	}
	prefix := m.kWeightedPower(buf)
	windowSize := int(0.4 * m.sampleRate)
	return blockLoudness(prefix, windowSize, windowSize/4)
}

// MeasureShortTerm computes K-weighted short-term loudness (3s windows,
// 1s hop) in LUFS.
func (m *LUFSMeter) MeasureShortTerm(buf *AudioBuffer) []float64 {
	if buf.Channels() == 0 || buf.Length() == 0 {
		return nil
	}
	prefix := m.kWeightedPower(buf)
	windowSize := int(3.0 * m.sampleRate)
	hopSize := int(1.0 * m.sampleRate)
	if buf.Length() < windowSize {
		// Shorter than one short-term window: use the whole buffer.
		return blockLoudness(prefix, buf.Length(), buf.Length())
	}
	return blockLoudness(prefix, windowSize, hopSize)
}

// LoudnessRange computes the loudness range (LRA) in LU per EBU Tech 3342:
// short-term loudness, -70 LUFS absolute gate, relative gate 20 LU below
// the gated mean, then the spread between the 10th and 95th percentiles.
func (m *LUFSMeter) LoudnessRange(buf *AudioBuffer) float64 {
	shortTerm := m.MeasureShortTerm(buf)

	var absGated []float64
	for _, l := range shortTerm {
		if l > -70 {
			absGated = append(absGated, l)
		}
	}
	if len(absGated) == 0 {
		return 0
	}

	var sum float64
	for _, l := range absGated {
		sum += math.Pow(10, (l+0.691)/10)
	}
	mean := -0.691 + 10*math.Log10(sum/float64(len(absGated)))

	var gated []float64
	for _, l := range absGated {
		if l > mean-20 {
			gated = append(gated, l)
		}
	}
	if len(gated) < 2 {
		return 0
	}

	sort.Float64s(gated)
	p10 := percentile(gated, 0.10)
	p95 := percentile(gated, 0.95)
	return p95 - p10
}

// percentile returns the linearly interpolated percentile of sorted values.
func percentile(sorted []float64, p float64) float64 {
	pos := p * float64(len(sorted)-1)
	lo := int(pos)
	if lo >= len(sorted)-1 {
		return sorted[len(sorted)-1]
	}
	frac := pos - float64(lo)
	return sorted[lo]*(1-frac) + sorted[lo+1]*frac
}

// MeasureTruePeak returns the true peak (dBTP) of the buffer using 4x
// oversampling with a windowed-sinc interpolator, per BS.1770-4 Annex 2.
func (m *LUFSMeter) MeasureTruePeak(buf *AudioBuffer) float64 {
	const taps = 8 // one-sided taps for the interpolation kernel
	var peak float64

	for ch := 0; ch < buf.Channels(); ch++ {
		samples := buf.Samples[ch]
		length := len(samples)
		for i := 0; i < length; i++ {
			abs := math.Abs(samples[i])
			if abs > peak {
				peak = abs
			}
			// Interpolate at phases 1/4, 2/4, 3/4 between i and i+1.
			for phase := 1; phase < 4; phase++ {
				frac := float64(phase) / 4.0
				var v float64
				for k := -taps + 1; k <= taps; k++ {
					idx := i + k
					if idx < 0 || idx >= length {
						continue
					}
					x := frac - float64(k)
					v += samples[idx] * sincHann(x, taps)
				}
				if abs := math.Abs(v); abs > peak {
					peak = abs
				}
			}
		}
	}

	if peak < 1e-20 {
		return -200
	}
	return 20 * math.Log10(peak)
}

// sincHann is a Hann-windowed sinc kernel with the given one-sided width.
func sincHann(x float64, width int) float64 {
	if math.Abs(x) >= float64(width) {
		return 0
	}
	sinc := 1.0
	if x != 0 {
		px := math.Pi * x
		sinc = math.Sin(px) / px
	}
	window := 0.5 * (1 + math.Cos(math.Pi*x/float64(width)))
	return sinc * window
}

// LoudnessNormalizer normalizes audio to a target LUFS.
type LoudnessNormalizer struct {
	BaseProcessor
	TargetLUFS float64
	sampleRate float64
}

// NewLoudnessNormalizer creates a loudness normalizer.
func NewLoudnessNormalizer(sampleRate float64) *LoudnessNormalizer {
	return &LoudnessNormalizer{
		BaseProcessor: BaseProcessor{ProcessorName: "Loudness Normalizer", IsEnabled: true},
		TargetLUFS:    -14, // Streaming standard
		sampleRate:    sampleRate,
	}
}

func (ln *LoudnessNormalizer) Process(buf *AudioBuffer) error {
	if !ln.IsEnabled {
		return nil
	}

	meter := NewLUFSMeter(ln.sampleRate, buf.Channels())
	currentLUFS := meter.MeasureIntegrated(buf)

	if currentLUFS < -100 {
		return nil // too quiet to normalize
	}

	gainDB := ln.TargetLUFS - currentLUFS
	gainLin := dbToLinear(gainDB)

	for ch := 0; ch < buf.Channels(); ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= gainLin
		}
	}

	return nil
}

func (ln *LoudnessNormalizer) SetParam(name string, value float64) error {
	switch name {
	case "target_lufs":
		ln.TargetLUFS = value
	default:
		return fmt.Errorf("unknown loudness param: %s", name)
	}
	return nil
}

func (ln *LoudnessNormalizer) GetParam(name string) (float64, error) {
	switch name {
	case "target_lufs":
		return ln.TargetLUFS, nil
	default:
		return 0, fmt.Errorf("unknown loudness param: %s", name)
	}
}

func (ln *LoudnessNormalizer) GetParams() map[string]float64 {
	return map[string]float64{"target_lufs": ln.TargetLUFS}
}

// SetSampleRate updates the sample rate used for measurement.
func (ln *LoudnessNormalizer) SetSampleRate(sampleRate float64) {
	ln.sampleRate = sampleRate
}

func (ln *LoudnessNormalizer) Reset() {}
