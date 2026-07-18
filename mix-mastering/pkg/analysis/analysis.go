package analysis

import (
	"math"
	"math/cmplx"

	"github.com/audiomaster/mastering/pkg/dsp"
)

// AnalysisResult contains the full analysis of an audio file.
type AnalysisResult struct {
	Spectrum    *SpectrumAnalysis `json:"spectrum"`
	Dynamics    *DynamicsAnalysis `json:"dynamics"`
	StereoField *StereoAnalysis   `json:"stereo_field"`
	Loudness    *LoudnessAnalysis `json:"loudness"`
	Duration    float64           `json:"duration"`
	SampleRate  int               `json:"sample_rate"`
	Channels    int               `json:"channels"`
}

// SpectrumAnalysis contains frequency spectrum data.
type SpectrumAnalysis struct {
	Frequencies     []float64 `json:"frequencies"`
	Magnitudes      []float64 `json:"magnitudes"` // dB
	PeakFreq        float64   `json:"peak_freq"`
	PeakMag         float64   `json:"peak_mag"`
	SpectralBalance string    `json:"spectral_balance"` // "bright", "dark", "balanced", "mid-heavy"
}

// DynamicsAnalysis contains dynamic range information.
type DynamicsAnalysis struct {
	PeakDB       float64   `json:"peak_db"`
	RMSDB        float64   `json:"rms_db"`
	DynamicRange float64   `json:"dynamic_range_db"`
	CrestFactor  float64   `json:"crest_factor_db"`
	Histogram    []float64 `json:"histogram"` // dB histogram bins
}

// StereoAnalysis contains stereo field information.
type StereoAnalysis struct {
	Correlation float64 `json:"correlation"` // -1 to 1
	Width       float64 `json:"width"`       // 0 to 1
	Balance     float64 `json:"balance"`     // -1 (left) to 1 (right)
	MidRMS      float64 `json:"mid_rms_db"`
	SideRMS     float64 `json:"side_rms_db"`
}

// LoudnessAnalysis contains loudness measurements.
type LoudnessAnalysis struct {
	IntegratedLUFS float64 `json:"integrated_lufs"`
	MomentaryMax   float64 `json:"momentary_max_lufs"`
	MomentaryMin   float64 `json:"momentary_min_lufs"`
	ShortTermMax   float64 `json:"short_term_max_lufs"`
	LoudnessRange  float64 `json:"loudness_range_lu"`
	TruePeak       float64 `json:"true_peak_dbtp"`
}

// Analyze performs a complete analysis of the audio buffer.
func Analyze(buf *dsp.AudioBuffer) *AnalysisResult {
	result := &AnalysisResult{
		Duration:   float64(buf.Length()) / float64(buf.SampleRate),
		SampleRate: buf.SampleRate,
		Channels:   buf.Channels(),
	}

	result.Spectrum = analyzeSpectrum(buf)
	result.Dynamics = analyzeDynamics(buf)
	result.Loudness = analyzeLoudness(buf)
	if buf.Channels() >= 2 {
		result.StereoField = analyzeStereo(buf)
	}

	return result
}

func analyzeSpectrum(buf *dsp.AudioBuffer) *SpectrumAnalysis {
	// Welch's method: average windowed power spectra over the whole track
	// and all channels, so the result represents the full program rather
	// than the first few milliseconds.
	length := buf.Length()
	channels := buf.Channels()
	n := 4096
	if length < n {
		n = length
	}
	hop := n / 2
	if hop < 1 {
		hop = 1
	}

	hann := make([]float64, n)
	for i := 0; i < n; i++ {
		hann[i] = 0.5 * (1 - math.Cos(2*math.Pi*float64(i)/float64(n-1)))
	}

	numBins := n / 2
	avgPower := make([]float64, numBins)
	windowed := make([]complex128, n)
	windows := 0

	for ch := 0; ch < channels; ch++ {
		samples := buf.Samples[ch]
		for start := 0; start+n <= length; start += hop {
			for i := 0; i < n; i++ {
				windowed[i] = complex(samples[start+i]*hann[i], 0)
			}
			fftResult := fft(windowed)
			for i := 0; i < numBins; i++ {
				mag := cmplx.Abs(fftResult[i]) / float64(n)
				avgPower[i] += mag * mag
			}
			windows++
		}
	}
	if windows == 0 {
		windows = 1
	}

	frequencies := make([]float64, numBins)
	magnitudes := make([]float64, numBins)
	freqRes := float64(buf.SampleRate) / float64(n)

	peakMag := math.Inf(-1)
	var peakFreq float64

	for i := 0; i < numBins; i++ {
		frequencies[i] = float64(i) * freqRes
		power := avgPower[i] / float64(windows)
		if power < 1e-40 {
			magnitudes[i] = -200
		} else {
			magnitudes[i] = 10 * math.Log10(power)
		}
		if magnitudes[i] > peakMag && i > 0 {
			peakMag = magnitudes[i]
			peakFreq = frequencies[i]
		}
	}

	// Determine spectral balance
	var lowEnergy, midEnergy, highEnergy float64
	for i := 1; i < numBins; i++ {
		freq := frequencies[i]
		linMag := math.Pow(10, magnitudes[i]/20)
		energy := linMag * linMag
		if freq < 250 {
			lowEnergy += energy
		} else if freq < 4000 {
			midEnergy += energy
		} else {
			highEnergy += energy
		}
	}

	total := lowEnergy + midEnergy + highEnergy
	var balance string
	if total > 0 {
		lowRatio := lowEnergy / total
		highRatio := highEnergy / total
		if highRatio > 0.4 {
			balance = "bright"
		} else if lowRatio > 0.5 {
			balance = "dark"
		} else if midEnergy/total > 0.6 {
			balance = "mid-heavy"
		} else {
			balance = "balanced"
		}
	} else {
		balance = "silent"
	}

	return &SpectrumAnalysis{
		Frequencies:     frequencies,
		Magnitudes:      magnitudes,
		PeakFreq:        peakFreq,
		PeakMag:         peakMag,
		SpectralBalance: balance,
	}
}

func analyzeDynamics(buf *dsp.AudioBuffer) *DynamicsAnalysis {
	channels := buf.Channels()
	length := buf.Length()

	// Per-sample power averaged across channels; peak across all channels.
	var peak, sumSq float64
	power := make([]float64, length)
	for ch := 0; ch < channels; ch++ {
		for i, s := range buf.Samples[ch] {
			abs := math.Abs(s)
			if abs > peak {
				peak = abs
			}
			power[i] += s * s
		}
	}
	for i := range power {
		power[i] /= float64(channels)
		sumSq += power[i]
	}

	rmsLin := math.Sqrt(sumSq / float64(length))
	peakDB := linToDb(peak)
	rmsDB := linToDb(rmsLin)
	crestFactor := peakDB - rmsDB

	// Histogram: -60 to 0 dB in 1dB bins
	histBins := 60
	histogram := make([]float64, histBins)
	windowSize := 1024
	for start := 0; start+windowSize <= length; start += windowSize {
		var windowMS float64
		for i := start; i < start+windowSize; i++ {
			windowMS += power[i]
		}
		db := linToDb(math.Sqrt(windowMS / float64(windowSize)))
		bin := int(-db)
		if bin >= 0 && bin < histBins {
			histogram[bin]++
		}
	}

	// Dynamic range: difference between loudest and softest parts
	var maxWindowDB, minWindowDB float64
	minWindowDB = 0
	maxWindowDB = -200
	for start := 0; start+windowSize <= length; start += windowSize {
		var windowMS float64
		for i := start; i < start+windowSize; i++ {
			windowMS += power[i]
		}
		db := linToDb(math.Sqrt(windowMS / float64(windowSize)))
		if db > -100 { // ignore silence
			if db > maxWindowDB {
				maxWindowDB = db
			}
			if db < minWindowDB {
				minWindowDB = db
			}
		}
	}

	return &DynamicsAnalysis{
		PeakDB:       peakDB,
		RMSDB:        rmsDB,
		DynamicRange: maxWindowDB - minWindowDB,
		CrestFactor:  crestFactor,
		Histogram:    histogram,
	}
}

func analyzeStereo(buf *dsp.AudioBuffer) *StereoAnalysis {
	if buf.Channels() < 2 {
		return nil
	}

	left := buf.Samples[0]
	right := buf.Samples[1]
	length := buf.Length()

	var sumLR, sumL2, sumR2 float64
	var sumMid2, sumSide2 float64
	var sumL, sumR float64

	for i := 0; i < length; i++ {
		l := left[i]
		r := right[i]
		sumLR += l * r
		sumL2 += l * l
		sumR2 += r * r
		sumL += math.Abs(l)
		sumR += math.Abs(r)

		mid := (l + r) * 0.5
		side := (l - r) * 0.5
		sumMid2 += mid * mid
		sumSide2 += side * side
	}

	n := float64(length)
	correlation := sumLR / math.Sqrt(sumL2*sumR2+1e-20)

	// Width: ratio of side to total energy
	totalEnergy := sumMid2 + sumSide2
	width := 0.0
	if totalEnergy > 0 {
		width = sumSide2 / totalEnergy
	}

	// Balance: -1 to 1
	totalAbs := sumL + sumR
	balance := 0.0
	if totalAbs > 0 {
		balance = (sumR - sumL) / totalAbs
	}

	return &StereoAnalysis{
		Correlation: correlation,
		Width:       width,
		Balance:     balance,
		MidRMS:      linToDb(math.Sqrt(sumMid2 / n)),
		SideRMS:     linToDb(math.Sqrt(sumSide2 / n)),
	}
}

func analyzeLoudness(buf *dsp.AudioBuffer) *LoudnessAnalysis {
	meter := dsp.NewLUFSMeter(float64(buf.SampleRate), buf.Channels())
	integrated := meter.MeasureIntegrated(buf)
	momentary := meter.MeasureMomentary(buf)
	shortTerm := meter.MeasureShortTerm(buf)

	maxOf := func(values []float64) float64 {
		max := -200.0
		for _, v := range values {
			if v > max {
				max = v
			}
		}
		return max
	}

	var momMin float64 = 200
	for _, m := range momentary {
		if m > -100 && m < momMin {
			momMin = m
		}
	}
	if momMin == 200 {
		momMin = -200
	}

	return &LoudnessAnalysis{
		IntegratedLUFS: integrated,
		MomentaryMax:   maxOf(momentary),
		MomentaryMin:   momMin,
		ShortTermMax:   maxOf(shortTerm),
		LoudnessRange:  meter.LoudnessRange(buf),
		TruePeak:       meter.MeasureTruePeak(buf),
	}
}

func linToDb(v float64) float64 {
	if v < 1e-20 {
		return -200
	}
	return 20 * math.Log10(v)
}

// Simple Cooley-Tukey FFT
func fft(x []complex128) []complex128 {
	n := len(x)
	if n <= 1 {
		return x
	}

	// Pad to power of 2
	if n&(n-1) != 0 {
		newN := 1
		for newN < n {
			newN <<= 1
		}
		padded := make([]complex128, newN)
		copy(padded, x)
		x = padded
		n = newN
	}

	// Bit-reversal permutation
	result := make([]complex128, n)
	bits := 0
	for tmp := n; tmp > 1; tmp >>= 1 {
		bits++
	}
	for i := 0; i < n; i++ {
		j := reverseBits(i, bits)
		result[j] = x[i]
	}

	// Butterfly
	for size := 2; size <= n; size *= 2 {
		half := size / 2
		w := complex(math.Cos(-2*math.Pi/float64(size)), math.Sin(-2*math.Pi/float64(size)))
		for start := 0; start < n; start += size {
			wn := complex(1, 0)
			for j := 0; j < half; j++ {
				u := result[start+j]
				v := wn * result[start+j+half]
				result[start+j] = u + v
				result[start+j+half] = u - v
				wn *= w
			}
		}
	}

	return result
}

func reverseBits(x, bits int) int {
	result := 0
	for i := 0; i < bits; i++ {
		result = (result << 1) | (x & 1)
		x >>= 1
	}
	return result
}
