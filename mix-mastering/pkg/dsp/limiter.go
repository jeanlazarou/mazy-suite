package dsp

import (
	"fmt"
	"math"
)

// Limiter implements a lookahead brickwall limiter.
//
// The gain envelope is computed in three stages over the whole buffer:
//  1. per-sample target gain (ceiling / peak),
//  2. sliding-window minimum over the lookahead window, so gain reduction
//     begins before a peak arrives,
//  3. release smoothing followed by a moving average the width of the
//     lookahead window, which ramps the attack smoothly.
//
// Because the minimum is taken over the full lookahead window before
// averaging, the averaged gain at a peak can never exceed the gain that
// peak requires — the ceiling is a hard guarantee. Processing adds no
// latency and output stays aligned with input.
type Limiter struct {
	BaseProcessor
	Ceiling    float64 // dB (output ceiling)
	Release    float64 // milliseconds
	Lookahead  float64 // milliseconds
	sampleRate float64

	// Gain reduction stats from the most recent Process call (linear gains).
	minGain     float64
	sumGain     float64
	gainSamples int
}

// NewLimiter creates a limiter with sensible defaults.
func NewLimiter(sampleRate float64) *Limiter {
	return &Limiter{
		BaseProcessor: BaseProcessor{ProcessorName: "Limiter", IsEnabled: true},
		Ceiling:       -0.3,
		Release:       50,
		Lookahead:     5,
		sampleRate:    sampleRate,
	}
}

// Process applies limiting to the audio buffer.
func (l *Limiter) Process(buf *AudioBuffer) error {
	if !l.IsEnabled {
		return nil
	}

	channels := buf.Channels()
	length := buf.Length()
	if channels == 0 || length == 0 {
		return nil
	}

	ceilingLin := dbToLinear(l.Ceiling)
	releaseCoeff := math.Exp(-1.0 / (l.Release * 0.001 * l.sampleRate))
	window := int(l.Lookahead * 0.001 * l.sampleRate)
	if window < 1 {
		window = 1
	}

	// Stage 1: per-sample target gain from the cross-channel peak.
	target := make([]float64, length)
	for i := 0; i < length; i++ {
		var peak float64
		for ch := 0; ch < channels; ch++ {
			abs := math.Abs(buf.Samples[ch][i])
			if abs > peak {
				peak = abs
			}
		}
		if peak > ceilingLin {
			target[i] = ceilingLin / peak
		} else {
			target[i] = 1.0
		}
	}

	// Stage 2: sliding minimum over [i, i+window) via monotonic deque.
	minGain := make([]float64, length)
	dq := make([]int, 0, window+1)
	for j := 0; j < length+window-1; j++ {
		if j < length {
			for len(dq) > 0 && target[dq[len(dq)-1]] >= target[j] {
				dq = dq[:len(dq)-1]
			}
			dq = append(dq, j)
		}
		i := j - window + 1
		if i >= 0 && i < length {
			for dq[0] < i {
				dq = dq[1:]
			}
			minGain[i] = target[dq[0]]
		}
	}

	// Stage 3a: release smoothing (gain recovers toward 1.0 exponentially,
	// but never above the lookahead minimum).
	smoothed := minGain
	prev := 1.0
	for i := 0; i < length; i++ {
		g := releaseCoeff*prev + (1 - releaseCoeff)
		if smoothed[i] < g {
			g = smoothed[i]
		}
		smoothed[i] = g
		prev = g
	}

	// Stage 3b: moving average of width `window` ending at each sample,
	// ramping the attack over the lookahead time. Every point in the
	// averaging window lies within the lookahead minimum of any peak at
	// the current sample, so the average never exceeds the required gain.
	var sum float64
	gain := make([]float64, length)
	for i := 0; i < length; i++ {
		sum += smoothed[i]
		if i >= window {
			sum -= smoothed[i-window]
			gain[i] = sum / float64(window)
		} else {
			// Window not yet full: pad with unity gain before the buffer,
			// but never rise above the current smoothed minimum.
			g := (sum + float64(window-i-1)) / float64(window)
			if g > smoothed[i] {
				g = smoothed[i]
			}
			gain[i] = g
		}
	}

	l.minGain = 1.0
	l.sumGain = 0
	l.gainSamples = length
	for _, g := range gain {
		if g < l.minGain {
			l.minGain = g
		}
		l.sumGain += g
	}

	for ch := 0; ch < channels; ch++ {
		for i := 0; i < length; i++ {
			buf.Samples[ch][i] *= gain[i]
		}
	}

	return nil
}

// GainReduction reports the max and average gain reduction (dB, positive)
// applied by the most recent Process call.
func (l *Limiter) GainReduction() (maxDB, avgDB float64) {
	if l.gainSamples == 0 {
		return 0, 0
	}
	return -linearToDb(l.minGain), -linearToDb(l.sumGain / float64(l.gainSamples))
}

func (l *Limiter) SetParam(name string, value float64) error {
	switch name {
	case "ceiling":
		l.Ceiling = math.Min(0, value)
	case "release":
		l.Release = math.Max(1, value)
	case "lookahead":
		l.Lookahead = math.Max(0.1, value)
	default:
		return fmt.Errorf("unknown limiter param: %s", name)
	}
	return nil
}

func (l *Limiter) GetParam(name string) (float64, error) {
	switch name {
	case "ceiling":
		return l.Ceiling, nil
	case "release":
		return l.Release, nil
	case "lookahead":
		return l.Lookahead, nil
	default:
		return 0, fmt.Errorf("unknown limiter param: %s", name)
	}
}

func (l *Limiter) GetParams() map[string]float64 {
	return map[string]float64{
		"ceiling":   l.Ceiling,
		"release":   l.Release,
		"lookahead": l.Lookahead,
	}
}

// SetSampleRate updates the sample rate used for time-based coefficients.
func (l *Limiter) SetSampleRate(sampleRate float64) {
	l.sampleRate = sampleRate
}

func (l *Limiter) Reset() {}
