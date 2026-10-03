package wasm

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
)

func sineInterleaved(freq float64, sampleRate, channels, frames int, amp float64) []float32 {
	out := make([]float32, frames*channels)
	for i := 0; i < frames; i++ {
		v := float32(amp * math.Sin(2*math.Pi*freq*float64(i)/float64(sampleRate)))
		for ch := 0; ch < channels; ch++ {
			out[i*channels+ch] = v
		}
	}
	return out
}

func TestProcessBufferStages(t *testing.T) {
	const (
		sampleRate = 44100
		channels   = 2
		frames     = 44100
		buckets    = 200
	)
	input := sineInterleaved(1000, sampleRate, channels, frames, 0.5)

	// Same input through both paths on identical fresh engines must give
	// identical output.
	plain := NewBridge()
	plainOut := plain.ProcessBuffer(append([]float32(nil), input...), channels, sampleRate)

	staged := NewBridge()
	output, stagesJSON := staged.ProcessBufferStages(append([]float32(nil), input...), channels, sampleRate, buckets, 0)

	if len(output) != len(plainOut) {
		t.Fatalf("output length = %d, want %d", len(output), len(plainOut))
	}
	for i := range output {
		if output[i] != plainOut[i] {
			t.Fatalf("output[%d] = %v, differs from ProcessBuffer %v", i, output[i], plainOut[i])
		}
	}

	var stages []StageSummary
	if err := json.Unmarshal([]byte(stagesJSON), &stages); err != nil {
		t.Fatalf("stages JSON: %v", err)
	}
	if len(stages) < 2 {
		t.Fatalf("expected at least Input + one processor stage, got %d", len(stages))
	}
	if stages[0].Name != "Input" {
		t.Errorf("first stage = %q, want Input", stages[0].Name)
	}
	if stages[len(stages)-1].Name != "Limiter" {
		t.Errorf("last stage = %q, want Limiter", stages[len(stages)-1].Name)
	}

	for _, s := range stages {
		if len(s.Mins) != buckets || len(s.Maxs) != buckets || len(s.RMS) != buckets {
			t.Fatalf("stage %q envelope sizes %d/%d/%d, want %d",
				s.Name, len(s.Mins), len(s.Maxs), len(s.RMS), buckets)
		}
	}

	// Input stage must describe the untouched signal: 0.5 sine peaks at
	// about -6 dBFS.
	in := stages[0]
	if math.Abs(in.PeakDB-20*math.Log10(0.5)) > 0.1 {
		t.Errorf("Input peak = %.2f dB, want ~%.2f dB", in.PeakDB, 20*math.Log10(0.5))
	}
	for bkt := 0; bkt < buckets; bkt++ {
		if in.Maxs[bkt] > 0.51 || in.Mins[bkt] < -0.51 {
			t.Fatalf("Input bucket %d envelope [%v, %v] exceeds source amplitude",
				bkt, in.Mins[bkt], in.Maxs[bkt])
		}
	}
}

func TestSummarizeStageEmptyAndTiny(t *testing.T) {
	// Fewer frames than buckets must clamp, not panic.
	staged := NewBridge()
	out, stagesJSON := staged.ProcessBufferStages(sineInterleaved(1000, 44100, 2, 10, 0.5), 2, 44100, 800, 0)
	if len(out) != 20 {
		t.Fatalf("output length = %d, want 20", len(out))
	}
	var stages []StageSummary
	if err := json.Unmarshal([]byte(stagesJSON), &stages); err != nil {
		t.Fatalf("stages JSON: %v", err)
	}
	for _, s := range stages {
		if len(s.Mins) != 10 {
			t.Errorf("stage %q buckets = %d, want clamped to 10", s.Name, len(s.Mins))
		}
	}
}

func TestProcessBufferStagesSpectrogram(t *testing.T) {
	const (
		sampleRate = 44100
		channels   = 2
		frames     = 44100
		specCols   = 40
	)
	input := sineInterleaved(1000, sampleRate, channels, frames, 0.5)
	staged := NewBridge()
	_, stagesJSON := staged.ProcessBufferStages(input, channels, sampleRate, 100, specCols)

	var stages []StageSummary
	if err := json.Unmarshal([]byte(stagesJSON), &stages); err != nil {
		t.Fatalf("stages JSON: %v", err)
	}
	in := stages[0]
	if len(in.SpecDB) != specCols {
		t.Fatalf("spec columns = %d, want %d", len(in.SpecDB), specCols)
	}
	if len(in.SpecFreqs) != len(in.SpecDB[0]) {
		t.Fatalf("spec freqs = %d bins, columns have %d", len(in.SpecFreqs), len(in.SpecDB[0]))
	}

	// The middle column must peak in the band containing 1 kHz, at about
	// -6 dBFS (0.5 amplitude sine).
	col := in.SpecDB[specCols/2]
	best, bestDB := -1, -1000.0
	for b, db := range col {
		if db > bestDB {
			best, bestDB = b, db
		}
	}
	f := in.SpecFreqs[best]
	if f < 800 || f > 1250 {
		t.Errorf("spectral peak at %.0f Hz, want ~1000 Hz", f)
	}
	if math.Abs(bestDB-(-6.0)) > 1.5 {
		t.Errorf("spectral peak level = %.1f dB, want ~-6 dB", bestDB)
	}
}

func TestBuildRecipeJSON(t *testing.T) {
	b := NewBridge()
	out := b.BuildRecipe(`{"style":"rock","destination":"podcast","fix":true}`,
		`[{"spectrum":{"spectral_balance":"dark"},"dynamics":{"dynamic_range_db":10,"crest_factor_db":8}},`+
			`{"spectrum":{"spectral_balance":"dark"},"dynamics":{"dynamic_range_db":12,"crest_factor_db":9}}]`)
	var r struct {
		Summary    string                        `json:"summary"`
		Fixes      int                           `json:"fixes"`
		Processors map[string]map[string]float64 `json:"processors"`
		Error      string                        `json:"error"`
	}
	if err := json.Unmarshal([]byte(out), &r); err != nil || r.Error != "" {
		t.Fatalf("bad recipe JSON %q: %v", out, err)
	}
	if r.Processors["Loudness Normalizer"]["target_lufs"] != -16 {
		t.Errorf("target = %v, want -16", r.Processors["Loudness Normalizer"]["target_lufs"])
	}
	if r.Fixes != 1 {
		t.Errorf("album aggregate should yield the dark fix, got %d fixes (%s)", r.Fixes, r.Summary)
	}
	if bad := b.BuildRecipe(`{"style":"polka"}`, `[]`); !strings.Contains(bad, "error") {
		t.Errorf("expected error for unknown style, got %s", bad)
	}
}
