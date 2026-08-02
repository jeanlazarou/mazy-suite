package dsp

import (
	"fmt"
	"math"
)

// exciterMode selects which band an Exciter isolates before waveshaping.
type exciterMode int

const (
	exciterBass exciterMode = iota
	exciterTreble
)

// Exciter generates new harmonic content from an isolated band and mixes
// it back in parallel with the dry signal — it cannot recreate energy
// that isn't present in the source (EQ can only amplify what's there),
// but it can make missing bass or dulled highs perceptible by adding
// harmonics in a range the source (or the playback device) already
// reproduces.
//
// Bass mode isolates lows with a low-pass, drives them through a tanh
// waveshaper (odd-order harmonics only), then high-passes the wet path
// so only the generated harmonics above the band are mixed back in —
// this is the MaxxBass-style trick that makes low end audible on small
// speakers. Treble mode isolates highs with a high-pass instead; the
// same post-filter keeps the wet path from just duplicating the dry
// band, which the (unused, unwired) HarmonicExciter in multiband.go
// does not do.
type Exciter struct {
	BaseProcessor
	Drive     float64 // 0-1
	Mix       float64 // 0-1 (dry/wet)
	Frequency float64 // band split, Hz

	mode exciterMode
	band *BiquadFilter // bass: low-pass @ Frequency, treble: high-pass @ Frequency
	post *BiquadFilter // high-pass @ Frequency on the wet path, both modes
}

// NewBassExciter creates a harmonic exciter tuned to generate harmonics
// from low-frequency content. Starts disabled: like harmonic excitement
// in general, it's a creative addition rather than a corrective one.
func NewBassExciter(sampleRate float64) *Exciter {
	return newExciter("Bass Exciter", exciterBass, 120, sampleRate)
}

// NewTrebleExciter creates a harmonic exciter tuned to generate
// harmonics from high-frequency content. Starts disabled.
func NewTrebleExciter(sampleRate float64) *Exciter {
	return newExciter("Treble Exciter", exciterTreble, 5000, sampleRate)
}

func newExciter(name string, mode exciterMode, freq, sampleRate float64) *Exciter {
	bandType := BiquadLowPass
	if mode == exciterTreble {
		bandType = BiquadHighPass
	}
	return &Exciter{
		BaseProcessor: BaseProcessor{ProcessorName: name, IsEnabled: false},
		Drive:         0.3,
		Mix:           0.2,
		Frequency:     freq,
		mode:          mode,
		band:          NewBiquadFilter(bandType, freq, 0.707, 0, sampleRate, 2),
		post:          NewBiquadFilter(BiquadHighPass, freq, 0.707, 0, sampleRate, 2),
	}
}

func (ex *Exciter) Process(buf *AudioBuffer) error {
	if !ex.IsEnabled {
		return nil
	}

	ex.band.EnsureChannels(buf.Channels())
	ex.post.EnsureChannels(buf.Channels())

	for ch := 0; ch < buf.Channels(); ch++ {
		for i := range buf.Samples[ch] {
			dry := buf.Samples[ch][i]

			// Isolate the band this exciter targets.
			isolated := ex.band.ProcessSample(dry, ch)

			// Soft saturation (tanh waveshaping) generates harmonics.
			saturated := math.Tanh(isolated * (1 + ex.Drive*10))

			// Keep only the generated harmonics above the band before
			// mixing back in, so the wet path adds new content instead
			// of duplicating the dry band.
			wet := ex.post.ProcessSample(saturated, ch)

			buf.Samples[ch][i] = dry + wet*ex.Mix
		}
	}

	return nil
}

func (ex *Exciter) SetParam(name string, value float64) error {
	switch name {
	case "drive":
		ex.Drive = math.Max(0, math.Min(1, value))
	case "mix":
		ex.Mix = math.Max(0, math.Min(1, value))
	case "frequency":
		ex.Frequency = math.Max(20, math.Min(20000, value))
		ex.band.SetFrequency(ex.Frequency)
		ex.post.SetFrequency(ex.Frequency)
	case "enabled":
		ex.IsEnabled = value > 0.5
	default:
		return fmt.Errorf("unknown exciter param: %s", name)
	}
	return nil
}

func (ex *Exciter) GetParam(name string) (float64, error) {
	switch name {
	case "drive":
		return ex.Drive, nil
	case "mix":
		return ex.Mix, nil
	case "frequency":
		return ex.Frequency, nil
	case "enabled":
		if ex.IsEnabled {
			return 1, nil
		}
		return 0, nil
	default:
		return 0, fmt.Errorf("unknown exciter param: %s", name)
	}
}

func (ex *Exciter) GetParams() map[string]float64 {
	enabled := 0.0
	if ex.IsEnabled {
		enabled = 1.0
	}
	return map[string]float64{
		"drive":     ex.Drive,
		"mix":       ex.Mix,
		"frequency": ex.Frequency,
		"enabled":   enabled,
	}
}

// SetSampleRate updates the sample rate and recomputes both filters.
func (ex *Exciter) SetSampleRate(sampleRate float64) {
	ex.band.SampleRate = sampleRate
	ex.band.SetFrequency(ex.Frequency)
	ex.post.SampleRate = sampleRate
	ex.post.SetFrequency(ex.Frequency)
}

func (ex *Exciter) Reset() {
	ex.band.Reset()
	ex.post.Reset()
}
