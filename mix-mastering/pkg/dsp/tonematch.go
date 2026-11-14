package dsp

import (
	"fmt"
	"math"
	"math/cmplx"
	"strconv"
	"strings"
	"sync"
)

// ToneMatchBands is the number of points of a ToneMatch curve: third
// octaves from 20 Hz to 20 kHz.
const ToneMatchBands = 31

// ToneMatchFreq is the frequency of point i of a ToneMatch curve.
func ToneMatchFreq(i int) float64 { return 20 * math.Pow(2, float64(i)/3) }

// ToneMatchDB is the gain (dB) a curve gives a frequency: the points
// joined by straight lines over log frequency, flat beyond the ends. The
// web UI draws the curve with a TS copy (TonePanel.tsx) — keep in sync.
func ToneMatchDB(gains []float64, freq float64) float64 {
	if freq <= 0 {
		return gains[0]
	}
	pos := 3 * math.Log2(freq/20)
	switch {
	case pos <= 0:
		return gains[0]
	case pos >= float64(len(gains)-1):
		return gains[len(gains)-1]
	}
	i := int(pos)
	t := pos - float64(i)
	return gains[i]*(1-t) + gains[i+1]*t
}

// ToneMatch is a free-form corrective EQ: a gain curve given at third-
// octave points (see recipe.toneMatch, which fits it to the song's
// long-term spectrum), applied as a linear-phase FIR filter so the curve
// is followed exactly with no phase shift. Offline and latency-free: the
// output stays aligned with the input. Starts disabled.
type ToneMatch struct {
	BaseProcessor
	Gains      [ToneMatchBands]float64 // dB at ToneMatchFreq(i)
	Amount     float64                 // scales the whole curve, 0-2
	sampleRate float64
}

// NewToneMatch creates a flat, disabled ToneMatch.
func NewToneMatch(sampleRate float64) *ToneMatch {
	return &ToneMatch{
		BaseProcessor: BaseProcessor{ProcessorName: "Tone Match", IsEnabled: false},
		Amount:        1,
		sampleRate:    sampleRate,
	}
}

// kernel builds the filter's impulse response (length n, centred on n/2)
// by sampling the curve at the FFT bins.
func (t *ToneMatch) kernel() []float64 {
	n := 8192 // ~5 Hz bins: follows third octaves down to the lowest bands
	for float64(n) < t.sampleRate/6 {
		n *= 2
	}
	spec := make([]complex128, n)
	for k := 0; k <= n/2; k++ {
		freq := float64(k) * t.sampleRate / float64(n)
		mag := math.Pow(10, t.Amount*ToneMatchDB(t.Gains[:], freq)/20)
		spec[k] = complex(mag, 0)
		if k > 0 && k < n/2 {
			spec[n-k] = spec[k]
		}
	}
	fftInPlace(spec, true)
	h := make([]float64, n)
	for j := range h {
		w := 0.5 * (1 - math.Cos(2*math.Pi*float64(j)/float64(n)))
		h[j] = real(spec[(j+n/2)%n]) * w
	}
	return h
}

// Process applies the curve.
func (t *ToneMatch) Process(buf *AudioBuffer) error {
	if !t.IsEnabled || buf.Length() == 0 {
		return nil
	}
	flat := true
	for _, g := range t.Gains {
		if math.Abs(g*t.Amount) >= 0.01 {
			flat = false
			break
		}
	}
	if flat {
		return nil
	}

	h := t.kernel()
	n := len(h)
	m := 4 * n     // FFT size of the overlap-add convolution
	block := m - n // input samples per block
	kspec := make([]complex128, m)
	for j, v := range h {
		kspec[j] = complex(v, 0)
	}
	fftInPlace(kspec, false)

	length := buf.Length()
	work := make([]complex128, m)
	for ch := range buf.Samples {
		x := buf.Samples[ch]
		out := make([]float64, length+m)
		for pos := 0; pos < length; pos += block {
			end := pos + block
			if end > length {
				end = length
			}
			for j := range work {
				work[j] = 0
			}
			for j := pos; j < end; j++ {
				work[j-pos] = complex(x[j], 0)
			}
			fftInPlace(work, false)
			for j := range work {
				work[j] *= kspec[j]
			}
			fftInPlace(work, true)
			for j := 0; j < m; j++ {
				out[pos+j] += real(work[j])
			}
		}
		copy(x, out[n/2:n/2+length]) // the kernel is centred on n/2
	}
	return nil
}

func (t *ToneMatch) SetParam(name string, value float64) error {
	switch {
	case name == "amount":
		t.Amount = math.Max(0, math.Min(2, value))
	case name == "enabled":
		t.IsEnabled = value > 0.5
	case strings.HasPrefix(name, "g."):
		i, err := strconv.Atoi(name[2:])
		if err != nil || i < 0 || i >= ToneMatchBands {
			return fmt.Errorf("unknown tone match param: %s", name)
		}
		t.Gains[i] = math.Max(-12, math.Min(12, value))
	default:
		return fmt.Errorf("unknown tone match param: %s", name)
	}
	return nil
}

func (t *ToneMatch) GetParam(name string) (float64, error) {
	if v, ok := t.GetParams()[name]; ok {
		return v, nil
	}
	return 0, fmt.Errorf("unknown tone match param: %s", name)
}

func (t *ToneMatch) GetParams() map[string]float64 {
	enabled := 0.0
	if t.IsEnabled {
		enabled = 1
	}
	p := map[string]float64{"amount": t.Amount, "enabled": enabled}
	for i, g := range t.Gains {
		p["g."+strconv.Itoa(i)] = g
	}
	return p
}

// SetSampleRate updates the rate the filter is designed for.
func (t *ToneMatch) SetSampleRate(sampleRate float64) { t.sampleRate = sampleRate }

func (t *ToneMatch) Reset() {}

// fftInPlace is an iterative radix-2 FFT (len(x) a power of two); the
// inverse includes the 1/n scaling.
func fftInPlace(x []complex128, inverse bool) {
	n := len(x)
	for i, j := 1, 0; i < n; i++ {
		bit := n >> 1
		for ; j&bit != 0; bit >>= 1 {
			j ^= bit
		}
		j ^= bit
		if i < j {
			x[i], x[j] = x[j], x[i]
		}
	}
	roots := fftRoots(n)
	for size := 2; size <= n; size <<= 1 {
		half, stride := size/2, n/size
		for start := 0; start < n; start += size {
			for k := 0; k < half; k++ {
				w := roots[k*stride]
				if inverse {
					w = complex(real(w), -imag(w))
				}
				a, b := x[start+k], x[start+k+half]*w
				x[start+k], x[start+k+half] = a+b, a-b
			}
		}
	}
	if inverse {
		scale := complex(1/float64(n), 0)
		for i := range x {
			x[i] *= scale
		}
	}
}

var (
	fftRootsMu    sync.Mutex
	fftRootsCache = map[int][]complex128{}
)

// fftRoots returns e^(-2πik/n) for k < n/2, computed once per size.
func fftRoots(n int) []complex128 {
	fftRootsMu.Lock()
	defer fftRootsMu.Unlock()
	if r, ok := fftRootsCache[n]; ok {
		return r
	}
	r := make([]complex128, n/2)
	for k := range r {
		r[k] = cmplx.Rect(1, -2*math.Pi*float64(k)/float64(n))
	}
	fftRootsCache[n] = r
	return r
}
