package analysis

import (
	"testing"
)

func TestAggregate(t *testing.T) {
	mk := func(balance string, lufs, dr float64) *AnalysisResult {
		return &AnalysisResult{
			Spectrum: &SpectrumAnalysis{SpectralBalance: balance},
			Dynamics: &DynamicsAnalysis{DynamicRange: dr, CrestFactor: 12, PeakDB: -1, RMSDB: -18},
			Loudness: &LoudnessAnalysis{IntegratedLUFS: lufs, TruePeak: -1},
			Duration: 60,
		}
	}

	agg := Aggregate([]*AnalysisResult{
		mk("dark", -10, 8),
		mk("dark", -12, 10),
		mk("bright", -20, 14),
	})

	if agg.Spectrum.SpectralBalance != "dark" {
		t.Errorf("expected majority balance 'dark', got %q", agg.Spectrum.SpectralBalance)
	}
	if agg.Dynamics.DynamicRange != 10 {
		t.Errorf("expected median DR 10, got %.1f", agg.Dynamics.DynamicRange)
	}
	// Power-mean loudness is pulled toward the louder tracks: between the
	// loudest track and the arithmetic mean.
	if agg.Loudness.IntegratedLUFS < -14 || agg.Loudness.IntegratedLUFS > -10 {
		t.Errorf("aggregate loudness out of range: %.2f", agg.Loudness.IntegratedLUFS)
	}
	if agg.Duration != 180 {
		t.Errorf("expected summed duration 180, got %.0f", agg.Duration)
	}

	// Aggregating one result returns it unchanged.
	one := mk("balanced", -14, 9)
	if Aggregate([]*AnalysisResult{one}) != one {
		t.Error("single-result aggregate should be identity")
	}
	if Aggregate(nil) != nil {
		t.Error("empty aggregate should be nil")
	}
}
