package analysis

import (
	"math"
	"sort"
)

// Aggregate combines per-track analyses into one album-level analysis, so
// recommendations can target the record as a whole instead of a single
// track: majority spectral balance, median dynamics, power-averaged
// loudness, and median stereo width.
func Aggregate(results []*AnalysisResult) *AnalysisResult {
	if len(results) == 0 {
		return nil
	}
	if len(results) == 1 {
		return results[0]
	}

	agg := &AnalysisResult{
		SampleRate: results[0].SampleRate,
		Channels:   results[0].Channels,
	}

	// Spectral balance: majority vote
	counts := map[string]int{}
	for _, r := range results {
		agg.Duration += r.Duration
		if r.Spectrum != nil {
			counts[r.Spectrum.SpectralBalance]++
		}
	}
	balance := ""
	best := 0
	for b, n := range counts {
		if n > best {
			balance, best = b, n
		}
	}
	agg.Spectrum = &SpectrumAnalysis{SpectralBalance: balance}

	collect := func(get func(*AnalysisResult) (float64, bool)) []float64 {
		var vals []float64
		for _, r := range results {
			if v, ok := get(r); ok {
				vals = append(vals, v)
			}
		}
		return vals
	}

	agg.Dynamics = &DynamicsAnalysis{
		PeakDB: maxOf(collect(func(r *AnalysisResult) (float64, bool) {
			return safeDyn(r, func(d *DynamicsAnalysis) float64 { return d.PeakDB })
		})),
		RMSDB: median(collect(func(r *AnalysisResult) (float64, bool) {
			return safeDyn(r, func(d *DynamicsAnalysis) float64 { return d.RMSDB })
		})),
		DynamicRange: median(collect(func(r *AnalysisResult) (float64, bool) {
			return safeDyn(r, func(d *DynamicsAnalysis) float64 { return d.DynamicRange })
		})),
		CrestFactor: median(collect(func(r *AnalysisResult) (float64, bool) {
			return safeDyn(r, func(d *DynamicsAnalysis) float64 { return d.CrestFactor })
		})),
	}

	// Loudness: power-domain mean of integrated values (duration weighting
	// is ignored; exact album integration uses gating blocks instead).
	var powerSum float64
	var n int
	truePeak := math.Inf(-1)
	for _, r := range results {
		if r.Loudness == nil {
			continue
		}
		powerSum += math.Pow(10, (r.Loudness.IntegratedLUFS+0.691)/10)
		if r.Loudness.TruePeak > truePeak {
			truePeak = r.Loudness.TruePeak
		}
		n++
	}
	agg.Loudness = &LoudnessAnalysis{IntegratedLUFS: -200, TruePeak: truePeak}
	if n > 0 {
		agg.Loudness.IntegratedLUFS = -0.691 + 10*math.Log10(powerSum/float64(n))
	}

	widths := collect(func(r *AnalysisResult) (float64, bool) {
		if r.StereoField == nil {
			return 0, false
		}
		return r.StereoField.Width, true
	})
	if len(widths) > 0 {
		agg.StereoField = &StereoAnalysis{
			Width: median(widths),
			Correlation: median(collect(func(r *AnalysisResult) (float64, bool) {
				if r.StereoField == nil {
					return 0, false
				}
				return r.StereoField.Correlation, true
			})),
		}
	}

	return agg
}

func safeDyn(r *AnalysisResult, get func(*DynamicsAnalysis) float64) (float64, bool) {
	if r.Dynamics == nil {
		return 0, false
	}
	return get(r.Dynamics), true
}

func median(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sorted := append([]float64(nil), vals...)
	sort.Float64s(sorted)
	mid := len(sorted) / 2
	if len(sorted)%2 == 0 {
		return (sorted[mid-1] + sorted[mid]) / 2
	}
	return sorted[mid]
}

func maxOf(vals []float64) float64 {
	max := math.Inf(-1)
	for _, v := range vals {
		if v > max {
			max = v
		}
	}
	if math.IsInf(max, -1) {
		return 0
	}
	return max
}
