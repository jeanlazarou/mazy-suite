package dsp

import (
	"fmt"
	"math"
)

// Compressor implements a dynamic range compressor with attack/release envelope.
type Compressor struct {
	BaseProcessor
	Threshold  float64 // dB
	Ratio      float64 // e.g. 4.0 means 4:1
	Attack     float64 // milliseconds
	Release    float64 // milliseconds
	KneeWidth  float64 // dB (soft knee width)
	MakeupGain float64 // dB
	AutoMakeup bool

	envelope   float64 // current envelope level (linear)
	sampleRate float64

	// Gain reduction stats from the most recent Process call (linear gains).
	minGain     float64
	sumGain     float64
	gainSamples int
}

// NewCompressor creates a compressor with sensible defaults.
func NewCompressor(sampleRate float64) *Compressor {
	return &Compressor{
		BaseProcessor: BaseProcessor{ProcessorName: "Compressor", IsEnabled: true},
		Threshold:     -18,
		Ratio:         4,
		Attack:        10,
		Release:       100,
		KneeWidth:     6,
		MakeupGain:    0,
		AutoMakeup:    false,
		sampleRate:    sampleRate,
	}
}

// Process applies compression to the audio buffer.
func (c *Compressor) Process(buf *AudioBuffer) error {
	if !c.IsEnabled {
		return nil
	}

	attackCoeff := math.Exp(-1.0 / (c.Attack * 0.001 * c.sampleRate))
	releaseCoeff := math.Exp(-1.0 / (c.Release * 0.001 * c.sampleRate))

	makeupDB := c.MakeupGain
	if c.AutoMakeup {
		// Compensate half the gain reduction a full-scale signal would see.
		makeupDB = -c.Threshold * (1 - 1/c.Ratio) / 2
	}
	makeupLin := dbToLinear(makeupDB)

	length := buf.Length()
	channels := buf.Channels()

	c.minGain = 1.0
	c.sumGain = 0
	c.gainSamples = length

	for i := 0; i < length; i++ {
		// Compute peak across all channels for this sample
		var peak float64
		for ch := 0; ch < channels; ch++ {
			abs := math.Abs(buf.Samples[ch][i])
			if abs > peak {
				peak = abs
			}
		}

		// Envelope follower
		if peak > c.envelope {
			c.envelope = attackCoeff*c.envelope + (1-attackCoeff)*peak
		} else {
			c.envelope = releaseCoeff*c.envelope + (1-releaseCoeff)*peak
		}

		// Compute gain reduction
		gainReduction := c.computeGainReduction(c.envelope)
		if gainReduction < c.minGain {
			c.minGain = gainReduction
		}
		c.sumGain += gainReduction

		// Apply gain reduction and makeup to all channels
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] *= gainReduction * makeupLin
		}
	}

	return nil
}

// GainReduction reports the max and average gain reduction (dB, positive)
// applied by the most recent Process call, excluding makeup gain.
func (c *Compressor) GainReduction() (maxDB, avgDB float64) {
	if c.gainSamples == 0 {
		return 0, 0
	}
	return -linearToDb(c.minGain), -linearToDb(c.sumGain / float64(c.gainSamples))
}

func (c *Compressor) computeGainReduction(level float64) float64 {
	if level < 1e-10 {
		return 1.0
	}

	levelDB := linearToDb(level)
	threshDB := c.Threshold
	kneeHalf := c.KneeWidth / 2.0

	var outputDB float64
	if c.KneeWidth > 0 && levelDB > (threshDB-kneeHalf) && levelDB < (threshDB+kneeHalf) {
		// Soft knee region
		x := levelDB - threshDB + kneeHalf
		outputDB = levelDB + (1.0/c.Ratio-1.0)*x*x/(2.0*c.KneeWidth)
	} else if levelDB >= threshDB+kneeHalf {
		// Above threshold
		outputDB = threshDB + (levelDB-threshDB)/c.Ratio
	} else {
		// Below threshold
		return 1.0
	}

	return dbToLinear(outputDB - levelDB)
}

func (c *Compressor) SetParam(name string, value float64) error {
	switch name {
	case "threshold":
		c.Threshold = value
	case "ratio":
		c.Ratio = math.Max(1.0, value)
	case "attack":
		c.Attack = math.Max(0.01, value)
	case "release":
		c.Release = math.Max(1.0, value)
	case "knee":
		c.KneeWidth = math.Max(0, value)
	case "makeup":
		c.MakeupGain = value
	case "auto_makeup":
		c.AutoMakeup = value > 0.5
	default:
		return fmt.Errorf("unknown compressor param: %s", name)
	}
	return nil
}

func (c *Compressor) GetParam(name string) (float64, error) {
	switch name {
	case "threshold":
		return c.Threshold, nil
	case "ratio":
		return c.Ratio, nil
	case "attack":
		return c.Attack, nil
	case "release":
		return c.Release, nil
	case "knee":
		return c.KneeWidth, nil
	case "makeup":
		return c.MakeupGain, nil
	case "auto_makeup":
		if c.AutoMakeup {
			return 1, nil
		}
		return 0, nil
	default:
		return 0, fmt.Errorf("unknown compressor param: %s", name)
	}
}

func (c *Compressor) GetParams() map[string]float64 {
	auto := 0.0
	if c.AutoMakeup {
		auto = 1.0
	}
	return map[string]float64{
		"threshold":   c.Threshold,
		"ratio":       c.Ratio,
		"attack":      c.Attack,
		"release":     c.Release,
		"knee":        c.KneeWidth,
		"makeup":      c.MakeupGain,
		"auto_makeup": auto,
	}
}

// SetSampleRate updates the sample rate used for time-based coefficients.
func (c *Compressor) SetSampleRate(sampleRate float64) {
	c.sampleRate = sampleRate
}

func (c *Compressor) Reset() {
	c.envelope = 0
}

// Utility functions
func dbToLinear(db float64) float64 {
	return math.Pow(10, db/20.0)
}

func linearToDb(linear float64) float64 {
	if linear < 1e-10 {
		return -200
	}
	return 20.0 * math.Log10(linear)
}
