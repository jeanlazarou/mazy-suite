package recipe

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
)

// Tone matching: a correction curve fitted to the song's long-term
// spectrum (dsp.ToneMatch applies it). Two things are corrected, both only
// in part:
//
//   - the broad shape, toward the average spectrum of commercial masters
//     (targetDB), by the style's Match share — less for styles that
//     spectrum doesn't describe (jazz, classical, voice);
//   - the fine shape: bumps and holes a third of an octave wide against
//     the song's own broad shape. Filling the holes is what brings out
//     parts hidden behind louder neighbours; levelling the bumps removes
//     the resonances that hide them.
const (
	matchFine    = 0.75 // share of the fine deviations corrected
	matchMaxDB   = 5.0  // most the curve moves a band
	matchMinDB   = 0.75 // a curve that never reaches this is left out
	matchLowHz   = 31.0 // bands below and above these are left alone
	matchHighHz  = 16500.0
	matchNoBoost = 40.0 // no boosts below (rumble)
)

// targetDB is the average spectrum of commercial masters as third-octave
// band energy, in dB relative to 1 kHz: falling 2 dB per octave from
// 50 Hz to 4 kHz and faster above, with a steep cut below 50 Hz (Pestana
// et al., "Spectral Characteristics of Popular Commercial Recordings
// 1950-2010", AES 2013: about 5 dB/octave per Hz, which is 2 dB/octave
// per band).
func targetDB(freq float64) float64 {
	oct := func(a, b float64) float64 { // octaves of [a, b] that lie below freq
		return math.Log2(math.Max(a, math.Min(b, freq)) / a)
	}
	db := -9*math.Log2(50/math.Min(freq, 50)) - // below 50 Hz
		2*oct(50, 4000) - 4*oct(4000, 10000) - 9*oct(10000, 1e6)
	return db + 2*math.Log2(1000.0/50) // 0 dB at 1 kHz
}

// bandLevels returns the song's third-octave band energies (dB, arbitrary
// reference) at the ToneMatch points, from the analysis' power spectrum.
// ok is false when the analysis carries no usable spectrum.
func bandLevels(s *analysis.SpectrumAnalysis) (levels []float64, ok bool) {
	if s == nil || len(s.Frequencies) < 64 || len(s.Magnitudes) != len(s.Frequencies) {
		return nil, false
	}
	df := s.Frequencies[1] - s.Frequencies[0]
	if df <= 0 {
		return nil, false
	}
	levels = make([]float64, dsp.ToneMatchBands)
	for i := range levels {
		fc := dsp.ToneMatchFreq(i)
		lo, hi := fc*math.Pow(2, -1.0/6), fc*math.Pow(2, 1.0/6)
		// Bin k stands for [(k-½)df, (k+½)df]; add each bin's share.
		var energy float64
		for k := int(lo/df + 0.5); k < len(s.Magnitudes); k++ {
			a, b := (float64(k)-0.5)*df, (float64(k)+0.5)*df
			if a >= hi {
				break
			}
			if k == 0 {
				continue // DC
			}
			share := (math.Min(b, hi) - math.Max(a, lo)) / df
			if share > 0 {
				energy += share * math.Pow(10, s.Magnitudes[k]/10)
			}
		}
		if energy <= 0 {
			levels[i] = -200
		} else {
			levels[i] = 10 * math.Log10(energy)
		}
	}
	return levels, true
}

// toneMatch fits the correction curve (dB per ToneMatch point) for a
// song. ok is false when there is no spectrum to fit or nothing worth
// correcting.
func toneMatch(a *analysis.AnalysisResult, style Style) (curve []float64, ok bool) {
	if a == nil {
		return nil, false
	}
	levels, ok := bandLevels(a.Spectrum)
	if !ok {
		return nil, false
	}
	n := dsp.ToneMatchBands
	freq := make([]float64, n)
	dev := make([]float64, n) // song minus target, level-matched
	var sum float64
	var count int
	for i := range dev {
		freq[i] = dsp.ToneMatchFreq(i)
		dev[i] = levels[i] - targetDB(freq[i])
		if freq[i] >= 100 && freq[i] <= 5000 {
			sum += dev[i]
			count++
		}
	}
	for i := range dev {
		dev[i] -= sum / float64(count)
	}

	// Broad shape: the deviation averaged over an octave each side.
	broad := make([]float64, n)
	for i := range broad {
		var acc, wsum float64
		for j := i - 3; j <= i+3; j++ {
			if j < 0 || j >= n || freq[j] < matchLowHz || freq[j] > matchHighHz {
				continue
			}
			w := 4 - math.Abs(float64(j-i))
			// A band with nothing in it says nothing about the shape.
			acc += w * math.Max(dev[j], -12)
			wsum += w
		}
		if wsum > 0 {
			broad[i] = acc / wsum
		}
	}

	curve = make([]float64, n)
	for i := range curve {
		if freq[i] < matchLowHz || freq[i] > matchHighHz {
			continue
		}
		fine := clamp(dev[i]-broad[i], -6, 6)
		if freq[i] < 80 {
			fine = 0 // the spectrum is too coarse down there
		}
		c := -(style.Match*broad[i] + matchFine*fine)
		if c > 0 {
			// Only what is there can be brought out: a band far below the
			// target (a low-passed file, no bass at all) is left alone.
			c *= clamp((dev[i]+12)/6, 0, 1)
			if freq[i] < matchNoBoost {
				c = 0
			}
			if freq[i] > 12000 {
				c = math.Min(c, 2)
			}
		}
		curve[i] = clamp(c, -matchMaxDB, matchMaxDB)
	}
	// Round the corners.
	smooth := make([]float64, n)
	worth := false
	for i := range curve {
		l, r := curve[max(i-1, 0)], curve[min(i+1, n-1)]
		smooth[i] = round1((l + 4*curve[i] + r) / 6)
		if math.Abs(smooth[i]) >= matchMinDB {
			worth = true
		}
	}
	return smooth, worth
}

// describeMatch names the curve's main moves ("+2.1 dB around 3 kHz").
func describeMatch(curve []float64) string {
	type move struct {
		db, freq float64
	}
	var moves []move
	for i := 1; i < len(curve)-1; i++ {
		c := curve[i]
		// Local extremes of at least 1 dB.
		if math.Abs(c) >= 1 && math.Abs(c) >= math.Abs(curve[i-1]) && math.Abs(c) > math.Abs(curve[i+1]) {
			moves = append(moves, move{c, dsp.ToneMatchFreq(i)})
		}
	}
	sort.Slice(moves, func(i, j int) bool { return math.Abs(moves[i].db) > math.Abs(moves[j].db) })
	if len(moves) > 3 {
		moves = moves[:3]
	}
	sort.Slice(moves, func(i, j int) bool { return moves[i].freq < moves[j].freq })
	parts := make([]string, len(moves))
	for i, m := range moves {
		hz := fmt.Sprintf("%.0f Hz", math.Round(m.freq/10)*10)
		if m.freq >= 1000 {
			hz = strings.TrimSuffix(fmt.Sprintf("%.1f", m.freq/1000), ".0") + " kHz"
		}
		parts[i] = fmt.Sprintf("%+.1f dB around %s", m.db, hz)
	}
	return strings.Join(parts, ", ")
}
