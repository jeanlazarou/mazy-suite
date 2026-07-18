package dsp

import (
	"fmt"
	"math"
)

// Resample converts a buffer to the target sample rate using a Hann-windowed
// sinc interpolator. When downsampling, the kernel cutoff is scaled to the
// output Nyquist so aliasing content is filtered out.
func Resample(buf *AudioBuffer, targetRate int) (*AudioBuffer, error) {
	if targetRate <= 0 {
		return nil, fmt.Errorf("invalid target sample rate: %d", targetRate)
	}
	if buf.SampleRate == targetRate {
		return buf, nil
	}
	if buf.SampleRate <= 0 {
		return nil, fmt.Errorf("invalid source sample rate: %d", buf.SampleRate)
	}

	const width = 32 // one-sided kernel zero-crossings
	ratio := float64(targetRate) / float64(buf.SampleRate)

	// Cutoff relative to the source Nyquist: 1.0 when upsampling. When
	// downsampling the kernel doubles as the anti-alias filter; 0.95x the
	// output Nyquist keeps the transition band below it so super-Nyquist
	// content lands in the stopband.
	cutoff := 1.0
	kernelWidth := float64(width)
	if ratio < 1 {
		cutoff = 0.95 * ratio
		kernelWidth = float64(width) / cutoff
	}

	inLength := buf.Length()
	outLength := int(int64(inLength) * int64(targetRate) / int64(buf.SampleRate))
	out := NewAudioBuffer(buf.Channels(), outLength, targetRate)

	for ch := 0; ch < buf.Channels(); ch++ {
		in := buf.Samples[ch]
		for j := 0; j < outLength; j++ {
			// Position of this output sample on the input timeline.
			t := float64(j) / ratio
			center := int(math.Floor(t))

			lo := center - int(kernelWidth) + 1
			hi := center + int(kernelWidth)
			if lo < 0 {
				lo = 0
			}
			if hi >= inLength {
				hi = inLength - 1
			}

			var v float64
			for k := lo; k <= hi; k++ {
				x := (t - float64(k)) * cutoff
				window := 0.5 * (1 + math.Cos(math.Pi*(t-float64(k))/kernelWidth))
				sinc := 1.0
				if x != 0 {
					px := math.Pi * x
					sinc = math.Sin(px) / px
				}
				v += in[k] * cutoff * sinc * window
			}
			out.Samples[ch][j] = v
		}
	}

	return out, nil
}
