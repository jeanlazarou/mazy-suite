package dsp

import (
	"fmt"
	"math"
)

// MultibandCompressor splits audio into frequency bands and compresses each independently.
// The crossovers are 4th-order Linkwitz-Riley (two cascaded Butterworth
// biquads per edge), so the recombined bands sum to a flat magnitude response.
type MultibandCompressor struct {
	BaseProcessor
	Bands      []*MultibandBand
	sampleRate float64
	channels   int
}

// MultibandBand represents a single band in the multiband compressor.
type MultibandBand struct {
	LowFreq    float64
	HighFreq   float64
	Compressor *Compressor
	filters    []*BiquadFilter // cascaded crossover filters, multi-channel state
}

// multibandCrossovers are the default band edges and compressor settings:
// low (<200Hz), mid (200-4000Hz), high (>4000Hz).
var multibandCrossovers = []struct {
	low, high float64
	thresh    float64
	ratio     float64
}{
	{0, 200, -20, 3},
	{200, 4000, -18, 3},
	{4000, 0, -16, 2.5}, // high band: no upper edge
}

// NewMultibandCompressor creates a 3-band compressor with default crossovers.
func NewMultibandCompressor(sampleRate float64, channels int) *MultibandCompressor {
	mb := &MultibandCompressor{
		BaseProcessor: BaseProcessor{ProcessorName: "Multiband Compressor", IsEnabled: true},
		sampleRate:    sampleRate,
		channels:      channels,
	}

	for _, x := range multibandCrossovers {
		band := &MultibandBand{
			LowFreq:    x.low,
			HighFreq:   x.high,
			Compressor: NewCompressor(sampleRate),
		}
		band.Compressor.Threshold = x.thresh
		band.Compressor.Ratio = x.ratio
		band.buildFilters(sampleRate, channels)
		mb.Bands = append(mb.Bands, band)
	}

	return mb
}

// buildFilters creates the LR4 crossover cascade for the band's edges.
func (b *MultibandBand) buildFilters(sampleRate float64, channels int) {
	const lr4Q = 0.7071 // Butterworth Q; two cascaded stages form LR4
	b.filters = nil
	if b.LowFreq > 0 {
		b.filters = append(b.filters,
			NewBiquadFilter(BiquadHighPass, b.LowFreq, lr4Q, 0, sampleRate, channels),
			NewBiquadFilter(BiquadHighPass, b.LowFreq, lr4Q, 0, sampleRate, channels))
	}
	if b.HighFreq > 0 {
		b.filters = append(b.filters,
			NewBiquadFilter(BiquadLowPass, b.HighFreq, lr4Q, 0, sampleRate, channels),
			NewBiquadFilter(BiquadLowPass, b.HighFreq, lr4Q, 0, sampleRate, channels))
	}
}

func (mb *MultibandCompressor) Process(buf *AudioBuffer) error {
	if !mb.IsEnabled {
		return nil
	}

	channels := buf.Channels()
	length := buf.Length()

	// Split into bands, compress each, and sum
	output := NewAudioBuffer(channels, length, buf.SampleRate)

	for _, band := range mb.Bands {
		// Create a copy for this band
		bandBuf := NewAudioBuffer(channels, length, buf.SampleRate)
		for ch := 0; ch < channels; ch++ {
			copy(bandBuf.Samples[ch], buf.Samples[ch])
		}

		// Apply the LR4 crossover cascade
		for _, f := range band.filters {
			f.EnsureChannels(channels)
			for ch := 0; ch < channels; ch++ {
				for i := 0; i < length; i++ {
					bandBuf.Samples[ch][i] = f.ProcessSample(bandBuf.Samples[ch][i], ch)
				}
			}
		}

		// Compress this band
		band.Compressor.Process(bandBuf)

		// Sum into output
		for ch := 0; ch < channels; ch++ {
			for i := 0; i < length; i++ {
				output.Samples[ch][i] += bandBuf.Samples[ch][i]
			}
		}
	}

	// Copy output back
	for ch := 0; ch < channels; ch++ {
		copy(buf.Samples[ch], output.Samples[ch])
	}

	return nil
}

func (mb *MultibandCompressor) SetParam(name string, value float64) error {
	var bandIdx int
	var param string
	if _, err := fmt.Sscanf(name, "band.%d.%s", &bandIdx, &param); err != nil {
		return fmt.Errorf("invalid multiband param: %s", name)
	}
	if bandIdx < 0 || bandIdx >= len(mb.Bands) {
		return fmt.Errorf("band index out of range: %d", bandIdx)
	}
	return mb.Bands[bandIdx].Compressor.SetParam(param, value)
}

func (mb *MultibandCompressor) GetParam(name string) (float64, error) {
	var bandIdx int
	var param string
	if _, err := fmt.Sscanf(name, "band.%d.%s", &bandIdx, &param); err != nil {
		return 0, fmt.Errorf("invalid multiband param: %s", name)
	}
	if bandIdx < 0 || bandIdx >= len(mb.Bands) {
		return 0, fmt.Errorf("band index out of range: %d", bandIdx)
	}
	return mb.Bands[bandIdx].Compressor.GetParam(param)
}

func (mb *MultibandCompressor) GetParams() map[string]float64 {
	params := make(map[string]float64)
	for i, band := range mb.Bands {
		for k, v := range band.Compressor.GetParams() {
			params[fmt.Sprintf("band.%d.%s", i, k)] = v
		}
	}
	return params
}

// SetSampleRate updates the sample rate and rebuilds the crossover filters.
func (mb *MultibandCompressor) SetSampleRate(sampleRate float64) {
	if sampleRate == mb.sampleRate {
		return
	}
	mb.sampleRate = sampleRate
	for _, band := range mb.Bands {
		band.Compressor.SetSampleRate(sampleRate)
		band.buildFilters(sampleRate, mb.channels)
	}
}

func (mb *MultibandCompressor) Reset() {
	for _, band := range mb.Bands {
		band.Compressor.Reset()
		for _, f := range band.filters {
			f.Reset()
		}
	}
}

// HarmonicExciter adds harmonic saturation for brightness and presence.
type HarmonicExciter struct {
	BaseProcessor
	Drive     float64 // 0-1
	Mix       float64 // 0-1 (dry/wet)
	Frequency float64 // high-pass for exciter effect
	filter    *BiquadFilter
}

// NewHarmonicExciter creates a harmonic exciter.
func NewHarmonicExciter(sampleRate float64) *HarmonicExciter {
	return &HarmonicExciter{
		BaseProcessor: BaseProcessor{ProcessorName: "Harmonic Exciter", IsEnabled: true},
		Drive:         0.3,
		Mix:           0.2,
		Frequency:     3000,
		filter:        NewBiquadFilter(BiquadHighPass, 3000, 0.707, 0, sampleRate, 2),
	}
}

func (he *HarmonicExciter) Process(buf *AudioBuffer) error {
	if !he.IsEnabled {
		return nil
	}

	he.filter.EnsureChannels(buf.Channels())

	for ch := 0; ch < buf.Channels(); ch++ {
		for i := range buf.Samples[ch] {
			dry := buf.Samples[ch][i]

			// High-pass filter to isolate highs
			filtered := he.filter.ProcessSample(dry, ch)

			// Soft saturation (tanh waveshaping)
			driven := filtered * (1 + he.Drive*10)
			saturated := math.Tanh(driven)

			// Mix
			buf.Samples[ch][i] = dry + saturated*he.Mix
		}
	}

	return nil
}

func (he *HarmonicExciter) SetParam(name string, value float64) error {
	switch name {
	case "drive":
		he.Drive = math.Max(0, math.Min(1, value))
	case "mix":
		he.Mix = math.Max(0, math.Min(1, value))
	case "frequency":
		he.Frequency = value
		he.filter.SetFrequency(value)
	default:
		return fmt.Errorf("unknown exciter param: %s", name)
	}
	return nil
}

func (he *HarmonicExciter) GetParam(name string) (float64, error) {
	switch name {
	case "drive":
		return he.Drive, nil
	case "mix":
		return he.Mix, nil
	case "frequency":
		return he.Frequency, nil
	default:
		return 0, fmt.Errorf("unknown exciter param: %s", name)
	}
}

func (he *HarmonicExciter) GetParams() map[string]float64 {
	return map[string]float64{
		"drive":     he.Drive,
		"mix":       he.Mix,
		"frequency": he.Frequency,
	}
}

// SetSampleRate updates the sample rate and recomputes the exciter filter.
func (he *HarmonicExciter) SetSampleRate(sampleRate float64) {
	he.filter.SampleRate = sampleRate
	he.filter.SetFrequency(he.Frequency)
}

func (he *HarmonicExciter) Reset() {
	he.filter.Reset()
}

// DeEsser reduces sibilance in audio.
type DeEsser struct {
	BaseProcessor
	Frequency  float64 // center frequency for detection
	Threshold  float64 // dB
	Ratio      float64
	Range      float64 // max reduction in dB
	sampleRate float64
	detector   *BiquadFilter
	envelope   float64
}

// NewDeEsser creates a de-esser.
func NewDeEsser(sampleRate float64) *DeEsser {
	return &DeEsser{
		BaseProcessor: BaseProcessor{ProcessorName: "De-Esser", IsEnabled: true},
		Frequency:     6000,
		Threshold:     -20,
		Ratio:         4,
		Range:         -12,
		sampleRate:    sampleRate,
		detector:      NewBiquadFilter(BiquadBandPass, 6000, 2, 0, sampleRate, 2),
	}
}

func (de *DeEsser) Process(buf *AudioBuffer) error {
	if !de.IsEnabled {
		return nil
	}

	de.detector.EnsureChannels(buf.Channels())
	attackCoeff := math.Exp(-1.0 / (0.001 * de.sampleRate))
	releaseCoeff := math.Exp(-1.0 / (0.01 * de.sampleRate))

	for i := 0; i < buf.Length(); i++ {
		// Detect sibilance level across channels
		var peak float64
		for ch := 0; ch < buf.Channels(); ch++ {
			detected := de.detector.ProcessSample(buf.Samples[ch][i], ch)
			abs := math.Abs(detected)
			if abs > peak {
				peak = abs
			}
		}

		// Envelope follower
		if peak > de.envelope {
			de.envelope = attackCoeff*de.envelope + (1-attackCoeff)*peak
		} else {
			de.envelope = releaseCoeff*de.envelope + (1-releaseCoeff)*peak
		}

		// Compute gain reduction
		if de.envelope > 1e-10 {
			levelDB := linearToDb(de.envelope)
			if levelDB > de.Threshold {
				excess := levelDB - de.Threshold
				reduction := excess * (1 - 1/de.Ratio)
				reduction = math.Min(reduction, -de.Range)
				gain := dbToLinear(-reduction)
				for ch := 0; ch < buf.Channels(); ch++ {
					buf.Samples[ch][i] *= gain
				}
			}
		}
	}

	return nil
}

func (de *DeEsser) SetParam(name string, value float64) error {
	switch name {
	case "frequency":
		de.Frequency = value
		de.detector.SetFrequency(value)
	case "threshold":
		de.Threshold = value
	case "ratio":
		de.Ratio = math.Max(1, value)
	case "range":
		de.Range = value
	default:
		return fmt.Errorf("unknown de-esser param: %s", name)
	}
	return nil
}

func (de *DeEsser) GetParam(name string) (float64, error) {
	switch name {
	case "frequency":
		return de.Frequency, nil
	case "threshold":
		return de.Threshold, nil
	case "ratio":
		return de.Ratio, nil
	case "range":
		return de.Range, nil
	default:
		return 0, fmt.Errorf("unknown de-esser param: %s", name)
	}
}

func (de *DeEsser) GetParams() map[string]float64 {
	return map[string]float64{
		"frequency": de.Frequency,
		"threshold": de.Threshold,
		"ratio":     de.Ratio,
		"range":     de.Range,
	}
}

// SetSampleRate updates the sample rate and recomputes the detector filter.
func (de *DeEsser) SetSampleRate(sampleRate float64) {
	de.sampleRate = sampleRate
	de.detector.SampleRate = sampleRate
	de.detector.SetFrequency(de.Frequency)
}

func (de *DeEsser) Reset() {
	de.detector.Reset()
	de.envelope = 0
}
