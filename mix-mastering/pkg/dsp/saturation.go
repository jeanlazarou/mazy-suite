package dsp

import (
	"fmt"
	"math"
)

// saturationBias offsets the waveshaper's operating point so the curve is
// asymmetric: a symmetric tanh only makes odd harmonics, the bias adds the
// even ones (mostly the 2nd) that make tape and tube saturation sound warm
// rather than gritty.
const saturationBias = 0.2

// saturationTaps is the number of non-zero side taps per half of the 2x
// halfband oversampling filter (the kernel is 4*saturationTaps-1 long).
const saturationTaps = 10

// Saturation is gentle full-band waveshaping — analog-style warmth and
// glue, the "Warm" version's coloration. Unlike the exciters it doesn't
// isolate a band: the whole signal goes through an asymmetric tanh curve
// whose slope at zero is 1, so quiet passages pass almost untouched and
// loud moments are rounded off with low-order harmonics.
//
// Only the distortion (curve output minus input) is computed at 2x
// oversampling and added back to the untouched dry signal: the harmonics
// of high notes then don't fold back as inharmonic aliasing, and the
// oversampling filters can't color the original signal — they only shape
// the added harmonics. The filters are linear-phase and applied without
// delay over the whole buffer, so the stage adds no latency. The DC the
// asymmetry creates is removed from the distortion as well.
type Saturation struct {
	BaseProcessor
	Drive float64 // 0-1

	sampleRate float64
	residual   []float64 // per-call scratch, reused across channels
}

// halfband holds the odd taps h(1), h(3), ... of a 2x halfband low-pass
// kernel (h(0) = 0.5, the other even taps are 0), normalized for unity
// gain at DC.
var halfband = func() []float64 {
	// Kaiser window, beta 7 (~70 dB stopband).
	const beta = 7.0
	n := 2*saturationTaps - 1 // largest odd offset
	i0 := func(x float64) float64 {
		sum, term := 1.0, 1.0
		for k := 1; k < 30; k++ {
			term *= (x / 2) / float64(k)
			sum += term * term
		}
		return sum
	}
	taps := make([]float64, saturationTaps)
	var total float64
	for i := range taps {
		d := float64(2*i + 1)
		sinc := math.Sin(math.Pi*d/2) / (math.Pi * d / 2)
		r := d / float64(n+1)
		w := i0(beta*math.Sqrt(1-r*r)) / i0(beta)
		taps[i] = 0.5 * sinc * w
		total += taps[i]
	}
	// h(0) + 2*sum(odd taps) = 1
	for i := range taps {
		taps[i] *= 0.25 / total
	}
	return taps
}()

// NewSaturation creates the saturation stage. Starts disabled: like the
// exciters it adds color that isn't in the source, so the default chain
// stays transparent.
func NewSaturation(sampleRate float64) *Saturation {
	return &Saturation{
		BaseProcessor: BaseProcessor{ProcessorName: "Saturation", IsEnabled: false},
		Drive:         0.3,
		sampleRate:    sampleRate,
	}
}

// saturationCurve returns the waveshaper for a drive: an asymmetric tanh
// with zero output and unit slope at zero input.
func saturationCurve(drive float64) func(float64) float64 {
	k := drive * 3
	c := k * saturationBias
	t0 := math.Tanh(c)
	norm := k * (1 - t0*t0)
	return func(x float64) float64 { return (math.Tanh(k*x+c) - t0) / norm }
}

func (s *Saturation) Process(buf *AudioBuffer) error {
	if !s.IsEnabled || s.Drive < 1e-6 {
		return nil
	}
	curve := saturationCurve(s.Drive)
	dist := func(x float64) float64 { return curve(x) - x }

	// One-pole high-pass at 5 Hz on the distortion only.
	dcR := math.Exp(-2 * math.Pi * 5 / s.sampleRate)

	const ring = 32 // > 2*saturationTaps, power of two
	var odd [ring]float64
	for ch := 0; ch < buf.Channels(); ch++ {
		x := buf.Samples[ch]
		n := len(x)
		if cap(s.residual) < n {
			s.residual = make([]float64, n)
		}
		res := s.residual[:n]
		at := func(i int) float64 {
			if i < 0 || i >= n {
				return 0
			}
			return x[i]
		}

		// Distortion of the oversampled point between x[j] and x[j+1].
		oddDist := func(j int) float64 {
			if j < 0 || j >= n {
				return 0
			}
			var up float64
			if j >= saturationTaps-1 && j+saturationTaps < n {
				for i, h := range halfband {
					up += h * (x[j-i] + x[j+1+i])
				}
			} else {
				for i, h := range halfband {
					up += h * (at(j-i) + at(j+1+i))
				}
			}
			return dist(2 * up)
		}

		// The even oversampled points are the input samples themselves;
		// down-sampling filters the distortion at both and keeps the even
		// points: res[k] = 0.5*d(x[k]) + sum h(2i+1) * (odd[k-i-1] + odd[k+i]).
		next := -saturationTaps
		for k := 0; k < n; k++ {
			for ; next <= k+saturationTaps-1; next++ {
				odd[next&(ring-1)] = oddDist(next)
			}
			v := 0.5 * dist(x[k])
			for i, h := range halfband {
				v += h * (odd[(k-i-1)&(ring-1)] + odd[(k+i)&(ring-1)])
			}
			res[k] = v
		}

		var prevIn, prevOut float64
		for k := range x {
			out := res[k] - prevIn + dcR*prevOut
			prevIn, prevOut = res[k], out
			x[k] += out
		}
	}
	return nil
}

func (s *Saturation) SetParam(name string, value float64) error {
	switch name {
	case "drive":
		s.Drive = math.Max(0, math.Min(1, value))
	case "enabled":
		s.IsEnabled = value > 0.5
	default:
		return fmt.Errorf("unknown saturation param: %s", name)
	}
	return nil
}

func (s *Saturation) GetParam(name string) (float64, error) {
	switch name {
	case "drive":
		return s.Drive, nil
	case "enabled":
		if s.IsEnabled {
			return 1, nil
		}
		return 0, nil
	default:
		return 0, fmt.Errorf("unknown saturation param: %s", name)
	}
}

func (s *Saturation) GetParams() map[string]float64 {
	enabled := 0.0
	if s.IsEnabled {
		enabled = 1.0
	}
	return map[string]float64{"drive": s.Drive, "enabled": enabled}
}

// SetSampleRate updates the rate the DC filter is tuned for.
func (s *Saturation) SetSampleRate(sampleRate float64) {
	s.sampleRate = sampleRate
}

func (s *Saturation) Reset() {
	s.residual = nil
}
