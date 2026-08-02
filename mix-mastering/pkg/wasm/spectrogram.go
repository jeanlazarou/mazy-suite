package wasm

import (
	"math"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
)

const (
	specWindow = 2048 // STFT window (samples), Hann
	specBins   = 48   // log-spaced frequency bands
	specFloor  = -90.0
	specFMin   = 30.0
)

// spectrogram reduces a buffer to cols time columns of specBins log-spaced
// band levels in dBFS (peak amplitude per band, so a full-scale sine reads
// ~0 dB). One window is analyzed per column, centered on the column's
// position — enough for display, far cheaper than full overlap-add.
// Returns the [col][bin] levels and the band center frequencies.
func spectrogram(buf *dsp.AudioBuffer, cols, sampleRate int) ([][]float64, []float64) {
	n := 0
	if len(buf.Samples) > 0 {
		n = len(buf.Samples[0])
	}
	if n == 0 || cols < 1 {
		return nil, nil
	}

	w := specWindow
	for w > n {
		w >>= 1
	}
	if w < 64 {
		return nil, nil
	}

	fMax := math.Min(20000, float64(sampleRate)/2*0.95)
	// Band edges: fMin * (fMax/fMin)^(i/bins), i = 0..bins.
	ratio := fMax / specFMin
	freqs := make([]float64, specBins)
	for i := 0; i < specBins; i++ {
		freqs[i] = round4(specFMin * math.Pow(ratio, (float64(i)+0.5)/specBins))
	}

	hann := make([]float64, w)
	for i := range hann {
		hann[i] = 0.5 * (1 - math.Cos(2*math.Pi*float64(i)/float64(w-1)))
	}
	// Amplitude normalization: 2/N for one-sided spectrum, /0.5 for the
	// Hann window's coherent gain.
	norm := 4.0 / float64(w)
	binHz := float64(sampleRate) / float64(w)

	spec := make([][]float64, cols)
	x := make([]complex128, w)
	channels := float64(len(buf.Samples))
	for col := 0; col < cols; col++ {
		center := (float64(col) + 0.5) * float64(n) / float64(cols)
		start := int(center) - w/2
		if start < 0 {
			start = 0
		}
		if start > n-w {
			start = n - w
		}

		for i := 0; i < w; i++ {
			var mono float64
			for _, ch := range buf.Samples {
				mono += ch[start+i]
			}
			x[i] = complex(mono/channels*hann[i], 0)
		}
		X := analysis.FFT(x)

		bands := make([]float64, specBins)
		for b := range bands {
			bands[b] = specFloor
		}
		// Peak amplitude per band; bands narrower than one FFT bin sample
		// their center bin so low bands aren't left empty.
		for b := 0; b < specBins; b++ {
			f0 := specFMin * math.Pow(ratio, float64(b)/specBins)
			f1 := specFMin * math.Pow(ratio, float64(b+1)/specBins)
			k0 := int(math.Ceil(f0 / binHz))
			k1 := int(math.Floor(f1 / binHz))
			if k1 < k0 {
				k0 = int(math.Round((f0 + f1) / 2 / binHz))
				k1 = k0
			}
			if k0 < 1 {
				k0 = 1
			}
			if k1 > w/2 {
				k1 = w / 2
			}
			peak := 0.0
			for k := k0; k <= k1; k++ {
				mag := cmplxAbs(X[k]) * norm
				if mag > peak {
					peak = mag
				}
			}
			if db := toDB(peak); db > specFloor {
				bands[b] = math.Round(db*10) / 10
			}
		}
		spec[col] = bands
	}
	return spec, freqs
}

func cmplxAbs(c complex128) float64 {
	return math.Hypot(real(c), imag(c))
}
