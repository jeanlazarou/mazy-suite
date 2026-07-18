package dsp

import "fmt"

// EQBandType defines the type of an EQ band.
type EQBandType int

const (
	EQBandPeak EQBandType = iota
	EQBandLowShelf
	EQBandHighShelf
	EQBandLowPass
	EQBandHighPass
)

// EQBand represents a single band of a parametric EQ.
type EQBand struct {
	Type      EQBandType
	Frequency float64
	Gain      float64 // dB
	Q         float64
	Enabled   bool
	filter    *BiquadFilter
}

// ParametricEQ is a multi-band parametric equalizer.
type ParametricEQ struct {
	BaseProcessor
	Bands      []*EQBand
	sampleRate float64
	channels   int
}

// NewParametricEQ creates an EQ with the specified number of bands.
func NewParametricEQ(sampleRate float64, channels int) *ParametricEQ {
	eq := &ParametricEQ{
		BaseProcessor: BaseProcessor{ProcessorName: "Parametric EQ", IsEnabled: true},
		sampleRate:    sampleRate,
		channels:      channels,
	}
	// Default 6-band setup. The high-pass and low-pass bands start disabled
	// so the default chain is transparent until the user opts in.
	defaults := []struct {
		typ     EQBandType
		freq    float64
		gain    float64
		q       float64
		enabled bool
	}{
		{EQBandHighPass, 30, 0, 0.707, false},
		{EQBandLowShelf, 100, 0, 0.707, true},
		{EQBandPeak, 500, 0, 1.0, true},
		{EQBandPeak, 2000, 0, 1.0, true},
		{EQBandHighShelf, 8000, 0, 0.707, true},
		{EQBandLowPass, 18000, 0, 0.707, false},
	}
	for _, d := range defaults {
		eq.AddBand(d.typ, d.freq, d.gain, d.q)
		eq.Bands[len(eq.Bands)-1].Enabled = d.enabled
	}
	return eq
}

// AddBand adds a new EQ band.
func (eq *ParametricEQ) AddBand(bandType EQBandType, freq, gain, q float64) {
	biquadType := eqBandToBiquad(bandType)
	band := &EQBand{
		Type:      bandType,
		Frequency: freq,
		Gain:      gain,
		Q:         q,
		Enabled:   true,
		filter:    NewBiquadFilter(biquadType, freq, q, gain, eq.sampleRate, eq.channels),
	}
	eq.Bands = append(eq.Bands, band)
}

func eqBandToBiquad(bt EQBandType) BiquadType {
	switch bt {
	case EQBandPeak:
		return BiquadPeakEQ
	case EQBandLowShelf:
		return BiquadLowShelf
	case EQBandHighShelf:
		return BiquadHighShelf
	case EQBandLowPass:
		return BiquadLowPass
	case EQBandHighPass:
		return BiquadHighPass
	default:
		return BiquadPeakEQ
	}
}

// Process applies all enabled EQ bands to the audio buffer.
func (eq *ParametricEQ) Process(buf *AudioBuffer) error {
	if !eq.IsEnabled {
		return nil
	}
	for _, band := range eq.Bands {
		if !band.Enabled {
			continue
		}
		band.filter.EnsureChannels(buf.Channels())
		for ch := 0; ch < buf.Channels(); ch++ {
			for i, s := range buf.Samples[ch] {
				buf.Samples[ch][i] = band.filter.ProcessSample(s, ch)
			}
		}
	}
	return nil
}

// SetParam sets a parameter. Format: "band.N.freq", "band.N.gain", "band.N.q"
func (eq *ParametricEQ) SetParam(name string, value float64) error {
	var bandIdx int
	var param string
	if _, err := fmt.Sscanf(name, "band.%d.%s", &bandIdx, &param); err != nil {
		return fmt.Errorf("invalid EQ param: %s", name)
	}
	if bandIdx < 0 || bandIdx >= len(eq.Bands) {
		return fmt.Errorf("band index out of range: %d", bandIdx)
	}
	band := eq.Bands[bandIdx]
	switch param {
	case "freq":
		band.Frequency = value
		band.filter.SetFrequency(value)
	case "gain":
		band.Gain = value
		band.filter.SetGain(value)
	case "q":
		band.Q = value
		band.filter.SetQ(value)
	case "enabled":
		band.Enabled = value > 0.5
	default:
		return fmt.Errorf("unknown EQ param: %s", param)
	}
	return nil
}

// GetParam returns a parameter value.
func (eq *ParametricEQ) GetParam(name string) (float64, error) {
	var bandIdx int
	var param string
	if _, err := fmt.Sscanf(name, "band.%d.%s", &bandIdx, &param); err != nil {
		return 0, fmt.Errorf("invalid EQ param: %s", name)
	}
	if bandIdx < 0 || bandIdx >= len(eq.Bands) {
		return 0, fmt.Errorf("band index out of range: %d", bandIdx)
	}
	band := eq.Bands[bandIdx]
	switch param {
	case "freq":
		return band.Frequency, nil
	case "gain":
		return band.Gain, nil
	case "q":
		return band.Q, nil
	case "enabled":
		if band.Enabled {
			return 1, nil
		}
		return 0, nil
	default:
		return 0, fmt.Errorf("unknown EQ param: %s", param)
	}
}

// GetParams returns all parameters.
func (eq *ParametricEQ) GetParams() map[string]float64 {
	params := make(map[string]float64)
	for i, band := range eq.Bands {
		params[fmt.Sprintf("band.%d.freq", i)] = band.Frequency
		params[fmt.Sprintf("band.%d.gain", i)] = band.Gain
		params[fmt.Sprintf("band.%d.q", i)] = band.Q
		if band.Enabled {
			params[fmt.Sprintf("band.%d.enabled", i)] = 1
		} else {
			params[fmt.Sprintf("band.%d.enabled", i)] = 0
		}
	}
	return params
}

// SetSampleRate updates the sample rate and recomputes all band filters.
func (eq *ParametricEQ) SetSampleRate(sampleRate float64) {
	if sampleRate == eq.sampleRate {
		return
	}
	eq.sampleRate = sampleRate
	for _, band := range eq.Bands {
		band.filter.SampleRate = sampleRate
		band.filter.SetFrequency(band.Frequency)
	}
}

// Reset clears all filter states.
func (eq *ParametricEQ) Reset() {
	for _, band := range eq.Bands {
		band.filter.Reset()
	}
}
