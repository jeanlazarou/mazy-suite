package dsp

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Default crossover frequencies of the multiband compressor: lows below
// 200 Hz, highs above 4 kHz.
const (
	MultibandLowHz  = 200.0
	MultibandHighHz = 4000.0
)

// MultibandBands is the number of bands (low, mid, high).
const MultibandBands = 3

// MultibandBandSignal returns one band of buf (0 low, 1 mid, 2 high) as a
// new buffer. The crossovers are 4th-order Linkwitz-Riley (two cascaded
// Butterworth biquads per edge) and the low band also passes the upper
// crossover's allpass (its low-pass plus its high-pass), so the three
// bands add up to the input with a flat magnitude response.
func MultibandBandSignal(buf *AudioBuffer, band int, lowHz, highHz float64) *AudioBuffer {
	const q = 0.7071 // Butterworth; two cascaded stages form LR4
	channels, length := buf.Channels(), buf.Length()
	sr := float64(buf.SampleRate)
	pair := func(kind BiquadType, freq float64) []*BiquadFilter {
		return []*BiquadFilter{
			NewBiquadFilter(kind, freq, q, 0, sr, channels),
			NewBiquadFilter(kind, freq, q, 0, sr, channels),
		}
	}
	var chain []*BiquadFilter
	var apLow, apHigh []*BiquadFilter // the low band's allpass, as two paths
	switch band {
	case 0:
		chain = pair(BiquadLowPass, lowHz)
		apLow, apHigh = pair(BiquadLowPass, highHz), pair(BiquadHighPass, highHz)
	case 1:
		chain = append(pair(BiquadHighPass, lowHz), pair(BiquadLowPass, highHz)...)
	default:
		chain = append(pair(BiquadHighPass, lowHz), pair(BiquadHighPass, highHz)...)
	}
	out := NewAudioBuffer(channels, length, buf.SampleRate)
	for ch := 0; ch < channels; ch++ {
		in, dst := buf.Samples[ch], out.Samples[ch]
		for i, v := range in {
			for _, f := range chain {
				v = f.ProcessSample(v, ch)
			}
			if apLow != nil {
				lo, hi := v, v
				for k := range apLow {
					lo = apLow[k].ProcessSample(lo, ch)
					hi = apHigh[k].ProcessSample(hi, ch)
				}
				v = lo + hi
			}
			dst[i] = v
		}
	}
	return out
}

// MultibandCompressor compresses lows, mids and highs independently, so a
// loud bass doesn't turn the whole mix down and quiet detail in the mids
// can come up. Each band is a Compressor (params band.{0-2}.threshold,
// ratio, attack, release, knee, makeup). With no gain reduction it is
// transparent up to the crossovers' phase shift.
type MultibandCompressor struct {
	BaseProcessor
	Bands      []*MultibandBand
	sampleRate float64
}

// MultibandBand is one band's compressor.
type MultibandBand struct {
	Compressor *Compressor
}

// NewMultibandCompressor creates a 3-band compressor.
func NewMultibandCompressor(sampleRate float64, channels int) *MultibandCompressor {
	mb := &MultibandCompressor{
		BaseProcessor: BaseProcessor{ProcessorName: "Multiband Compressor", IsEnabled: true},
		sampleRate:    sampleRate,
	}
	for _, x := range []struct{ thresh, ratio float64 }{{-20, 3}, {-18, 3}, {-16, 2.5}} {
		c := NewCompressor(sampleRate)
		c.Threshold, c.Ratio = x.thresh, x.ratio
		mb.Bands = append(mb.Bands, &MultibandBand{Compressor: c})
	}
	return mb
}

func (mb *MultibandCompressor) Process(buf *AudioBuffer) error {
	if !mb.IsEnabled {
		return nil
	}
	channels := buf.Channels()
	output := NewAudioBuffer(channels, buf.Length(), buf.SampleRate)
	for i, band := range mb.Bands {
		bandBuf := MultibandBandSignal(buf, i, MultibandLowHz, MultibandHighHz)
		band.Compressor.Reset()
		if err := band.Compressor.Process(bandBuf); err != nil {
			return err
		}
		for ch := 0; ch < channels; ch++ {
			dst := output.Samples[ch]
			for k, v := range bandBuf.Samples[ch] {
				dst[k] += v
			}
		}
	}
	for ch := 0; ch < channels; ch++ {
		copy(buf.Samples[ch], output.Samples[ch])
	}
	return nil
}

// GainReduction reports the most gain reduction any band applied in the
// last Process call and the average over the bands (dB, positive).
func (mb *MultibandCompressor) GainReduction() (maxDB, avgDB float64) {
	for _, b := range mb.BandGainReduction() {
		maxDB = math.Max(maxDB, b[0])
		avgDB += b[1] / float64(len(mb.Bands))
	}
	return maxDB, avgDB
}

// BandGainReduction reports each band's max and average gain reduction in
// the last Process call (dB, positive).
func (mb *MultibandCompressor) BandGainReduction() [][2]float64 {
	out := make([][2]float64, len(mb.Bands))
	for i, b := range mb.Bands {
		out[i][0], out[i][1] = b.Compressor.GainReduction()
	}
	return out
}

// BandTimelines reports each band's DynamicsTimeline of the last Process
// call.
func (mb *MultibandCompressor) BandTimelines() []DynamicsTimeline {
	out := make([]DynamicsTimeline, len(mb.Bands))
	for i, b := range mb.Bands {
		out[i] = b.Compressor.Timeline()
	}
	return out
}

// bandParam splits "band.1.threshold" into 1 and "threshold".
func (mb *MultibandCompressor) bandParam(name string) (*Compressor, string, error) {
	parts := strings.SplitN(name, ".", 3)
	if len(parts) != 3 || parts[0] != "band" {
		return nil, "", fmt.Errorf("invalid multiband param: %s", name)
	}
	i, err := strconv.Atoi(parts[1])
	if err != nil || i < 0 || i >= len(mb.Bands) {
		return nil, "", fmt.Errorf("invalid multiband param: %s", name)
	}
	return mb.Bands[i].Compressor, parts[2], nil
}

func (mb *MultibandCompressor) SetParam(name string, value float64) error {
	if name == "enabled" {
		mb.IsEnabled = value > 0.5
		return nil
	}
	c, param, err := mb.bandParam(name)
	if err != nil {
		return err
	}
	return c.SetParam(param, value)
}

func (mb *MultibandCompressor) GetParam(name string) (float64, error) {
	if name == "enabled" {
		return mb.GetParams()["enabled"], nil
	}
	c, param, err := mb.bandParam(name)
	if err != nil {
		return 0, err
	}
	return c.GetParam(param)
}

func (mb *MultibandCompressor) GetParams() map[string]float64 {
	params := map[string]float64{"enabled": 0}
	if mb.IsEnabled {
		params["enabled"] = 1
	}
	for i, band := range mb.Bands {
		for k, v := range band.Compressor.GetParams() {
			if k != "auto_makeup" {
				params[fmt.Sprintf("band.%d.%s", i, k)] = v
			}
		}
	}
	return params
}

// SetSampleRate updates the bands' time constants.
func (mb *MultibandCompressor) SetSampleRate(sampleRate float64) {
	mb.sampleRate = sampleRate
	for _, band := range mb.Bands {
		band.Compressor.SetSampleRate(sampleRate)
	}
}

func (mb *MultibandCompressor) Reset() {
	for _, band := range mb.Bands {
		band.Compressor.Reset()
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
