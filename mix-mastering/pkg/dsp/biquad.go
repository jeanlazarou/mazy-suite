package dsp

import (
	"fmt"
	"math"
)

// BiquadType defines the type of biquad filter.
type BiquadType int

const (
	BiquadLowPass BiquadType = iota
	BiquadHighPass
	BiquadBandPass
	BiquadNotch
	BiquadPeakEQ
	BiquadLowShelf
	BiquadHighShelf
	BiquadAllPass
)

// BiquadFilter implements a second-order IIR (biquad) filter.
// This is the building block for EQ bands, crossovers, and more.
type BiquadFilter struct {
	Type       BiquadType
	Frequency  float64
	Q          float64
	GainDB     float64
	SampleRate float64

	// Coefficients
	b0, b1, b2 float64
	a1, a2     float64

	// Per-channel state: x[n-1], x[n-2], y[n-1], y[n-2]
	states []biquadState
}

type biquadState struct {
	x1, x2 float64
	y1, y2 float64
}

// NewBiquadFilter creates a new biquad filter and computes its coefficients.
func NewBiquadFilter(filterType BiquadType, freq, q, gainDB, sampleRate float64, channels int) *BiquadFilter {
	f := &BiquadFilter{
		Type:       filterType,
		Frequency:  freq,
		Q:          q,
		GainDB:     gainDB,
		SampleRate: sampleRate,
		states:     make([]biquadState, channels),
	}
	f.computeCoefficients()
	return f
}

func (f *BiquadFilter) computeCoefficients() {
	w0 := 2.0 * math.Pi * f.Frequency / f.SampleRate
	cosW0 := math.Cos(w0)
	sinW0 := math.Sin(w0)
	alpha := sinW0 / (2.0 * f.Q)
	A := math.Pow(10, f.GainDB/40.0) // sqrt of linear gain

	var b0, b1, b2, a0, a1, a2 float64

	switch f.Type {
	case BiquadLowPass:
		b1 = 1 - cosW0
		b0 = b1 / 2
		b2 = b0
		a0 = 1 + alpha
		a1 = -2 * cosW0
		a2 = 1 - alpha

	case BiquadHighPass:
		b0 = (1 + cosW0) / 2
		b1 = -(1 + cosW0)
		b2 = b0
		a0 = 1 + alpha
		a1 = -2 * cosW0
		a2 = 1 - alpha

	case BiquadBandPass:
		b0 = alpha
		b1 = 0
		b2 = -alpha
		a0 = 1 + alpha
		a1 = -2 * cosW0
		a2 = 1 - alpha

	case BiquadNotch:
		b0 = 1
		b1 = -2 * cosW0
		b2 = 1
		a0 = 1 + alpha
		a1 = -2 * cosW0
		a2 = 1 - alpha

	case BiquadPeakEQ:
		b0 = 1 + alpha*A
		b1 = -2 * cosW0
		b2 = 1 - alpha*A
		a0 = 1 + alpha/A
		a1 = -2 * cosW0
		a2 = 1 - alpha/A

	case BiquadLowShelf:
		sqrtA := math.Sqrt(A)
		b0 = A * ((A + 1) - (A-1)*cosW0 + 2*sqrtA*alpha)
		b1 = 2 * A * ((A - 1) - (A+1)*cosW0)
		b2 = A * ((A + 1) - (A-1)*cosW0 - 2*sqrtA*alpha)
		a0 = (A + 1) + (A-1)*cosW0 + 2*sqrtA*alpha
		a1 = -2 * ((A - 1) + (A+1)*cosW0)
		a2 = (A + 1) + (A-1)*cosW0 - 2*sqrtA*alpha

	case BiquadHighShelf:
		sqrtA := math.Sqrt(A)
		b0 = A * ((A + 1) + (A-1)*cosW0 + 2*sqrtA*alpha)
		b1 = -2 * A * ((A - 1) + (A+1)*cosW0)
		b2 = A * ((A + 1) + (A-1)*cosW0 - 2*sqrtA*alpha)
		a0 = (A + 1) - (A-1)*cosW0 + 2*sqrtA*alpha
		a1 = 2 * ((A - 1) - (A+1)*cosW0)
		a2 = (A + 1) - (A-1)*cosW0 - 2*sqrtA*alpha

	case BiquadAllPass:
		b0 = 1 - alpha
		b1 = -2 * cosW0
		b2 = 1 + alpha
		a0 = 1 + alpha
		a1 = -2 * cosW0
		a2 = 1 - alpha
	}

	// Normalize
	f.b0 = b0 / a0
	f.b1 = b1 / a0
	f.b2 = b2 / a0
	f.a1 = a1 / a0
	f.a2 = a2 / a0
}

// ProcessSample processes a single sample for the given channel.
func (f *BiquadFilter) ProcessSample(sample float64, channel int) float64 {
	s := &f.states[channel]
	out := f.b0*sample + f.b1*s.x1 + f.b2*s.x2 - f.a1*s.y1 - f.a2*s.y2
	s.x2 = s.x1
	s.x1 = sample
	s.y2 = s.y1
	s.y1 = out
	return out
}

// Reset clears the filter state.
func (f *BiquadFilter) Reset() {
	for i := range f.states {
		f.states[i] = biquadState{}
	}
}

// SetFrequency updates the frequency and recomputes coefficients.
func (f *BiquadFilter) SetFrequency(freq float64) {
	f.Frequency = freq
	f.computeCoefficients()
}

// SetQ updates the Q and recomputes coefficients.
func (f *BiquadFilter) SetQ(q float64) {
	f.Q = q
	f.computeCoefficients()
}

// SetGain updates the gain and recomputes coefficients.
func (f *BiquadFilter) SetGain(gainDB float64) {
	f.GainDB = gainDB
	f.computeCoefficients()
}

// EnsureChannels ensures the filter has state for the given number of channels.
func (f *BiquadFilter) EnsureChannels(channels int) {
	if len(f.states) < channels {
		newStates := make([]biquadState, channels)
		copy(newStates, f.states)
		f.states = newStates
	}
}

// String returns a description of the filter.
func (f *BiquadFilter) String() string {
	return fmt.Sprintf("Biquad{type=%d, freq=%.1f, Q=%.2f, gain=%.1fdB}", f.Type, f.Frequency, f.Q, f.GainDB)
}
