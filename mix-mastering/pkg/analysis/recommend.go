package analysis

import (
	"fmt"
	"math"
)

// TargetProfile represents a target listening environment.
type TargetProfile struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	// Frequency response adjustments to compensate for the target
	LowBoost    float64 `json:"low_boost_db"`
	MidAdjust   float64 `json:"mid_adjust_db"`
	HighBoost   float64 `json:"high_boost_db"`
	TargetLUFS  float64 `json:"target_lufs"`
	MaxTruePeak float64 `json:"max_true_peak_dbtp"`
	StereoWidth float64 `json:"stereo_width"` // 0-1 multiplier
	Compression float64 `json:"compression"`  // 0-1, how much to compress
}

// Recommendation contains suggested mastering settings.
type Recommendation struct {
	Target      string                        `json:"target"`
	Suggestions []Suggestion                  `json:"suggestions"`
	PresetName  string                        `json:"preset_name,omitempty"`
	Processors  map[string]map[string]float64 `json:"processors"`
}

// Suggestion is a single recommendation item.
type Suggestion struct {
	Category    string `json:"category"`
	Description string `json:"description"`
	Priority    string `json:"priority"` // "high", "medium", "low"
	AutoApply   bool   `json:"auto_apply"`
}

var targetProfiles = map[string]*TargetProfile{
	"neutral": {
		Name:        "Neutral",
		Description: "No device compensation — corrective suggestions from the analysis only",
		LowBoost:    0,
		MidAdjust:   0,
		HighBoost:   0,
		TargetLUFS:  -14,
		MaxTruePeak: -1,
		StereoWidth: 1.0,
		Compression: 0.3,
	},
	"headphones": {
		Name:        "Headphones",
		Description: "Optimized for headphone listening",
		LowBoost:    -1,
		MidAdjust:   0.5,
		HighBoost:   -0.5,
		TargetLUFS:  -14,
		MaxTruePeak: -1,
		StereoWidth: 0.9,
		Compression: 0.3,
	},
	"car": {
		Name:        "Car Audio",
		Description: "Optimized for in-car listening with road noise",
		LowBoost:    3,
		MidAdjust:   1,
		HighBoost:   1.5,
		TargetLUFS:  -12,
		MaxTruePeak: -0.3,
		StereoWidth: 0.7,
		Compression: 0.7,
	},
	"studio": {
		Name:        "Studio Monitors",
		Description: "Neutral reference mastering",
		LowBoost:    0,
		MidAdjust:   0,
		HighBoost:   0.5,
		TargetLUFS:  -14,
		MaxTruePeak: -1,
		StereoWidth: 1.0,
		Compression: 0.3,
	},
	"phone": {
		Name:        "Phone Speaker",
		Description: "Optimized for small phone speakers",
		LowBoost:    -3,
		MidAdjust:   3,
		HighBoost:   1,
		TargetLUFS:  -12,
		MaxTruePeak: -0.5,
		StereoWidth: 0.5,
		Compression: 0.8,
	},
	"bluetooth": {
		Name:        "Bluetooth Speaker",
		Description: "Optimized for portable Bluetooth speakers",
		LowBoost:    2,
		MidAdjust:   1,
		HighBoost:   0.5,
		TargetLUFS:  -12,
		MaxTruePeak: -0.5,
		StereoWidth: 0.6,
		Compression: 0.6,
	},
}

// GetTargetProfile returns a target profile by name.
func GetTargetProfile(name string) (*TargetProfile, error) {
	p, ok := targetProfiles[name]
	if !ok {
		return nil, fmt.Errorf("unknown target: %s (available: neutral, headphones, car, studio, phone, bluetooth)", name)
	}
	return p, nil
}

// ListTargets returns all available target profiles.
func ListTargets() map[string]*TargetProfile {
	return targetProfiles
}

// Recommend generates mastering recommendations based on analysis and target.
func Recommend(result *AnalysisResult, target string) (*Recommendation, error) {
	profile, err := GetTargetProfile(target)
	if err != nil {
		return nil, err
	}

	rec := &Recommendation{
		Target:     target,
		Processors: make(map[string]map[string]float64),
	}

	// EQ recommendations
	eqParams := make(map[string]float64)
	var eqSuggestions []Suggestion

	// Sub-bass / bass adjustment
	if profile.LowBoost != 0 {
		eqParams["band.1.freq"] = 100
		eqParams["band.1.gain"] = profile.LowBoost
		eqParams["band.1.q"] = 0.707
		if profile.LowBoost > 0 {
			eqSuggestions = append(eqSuggestions, Suggestion{
				Category:    "EQ",
				Description: fmt.Sprintf("Boost low frequencies by %.1fdB for %s", profile.LowBoost, profile.Name),
				Priority:    "medium",
				AutoApply:   true,
			})
		} else {
			eqSuggestions = append(eqSuggestions, Suggestion{
				Category:    "EQ",
				Description: fmt.Sprintf("Reduce low frequencies by %.1fdB for %s", -profile.LowBoost, profile.Name),
				Priority:    "medium",
				AutoApply:   true,
			})
		}
	}

	// Spectral balance correction
	if result.Spectrum != nil {
		switch result.Spectrum.SpectralBalance {
		case "dark":
			boost := 2.0 + profile.HighBoost
			eqParams["band.4.freq"] = 10000
			eqParams["band.4.gain"] = boost
			eqParams["band.4.q"] = 0.707
			eqSuggestions = append(eqSuggestions, Suggestion{
				Category:    "EQ",
				Description: fmt.Sprintf("Audio is dark; adding %.1fdB high shelf at 10kHz", boost),
				Priority:    "high",
				AutoApply:   true,
			})
		case "bright":
			cut := -1.5 + profile.HighBoost
			eqParams["band.4.freq"] = 10000
			eqParams["band.4.gain"] = cut
			eqParams["band.4.q"] = 0.707
			eqSuggestions = append(eqSuggestions, Suggestion{
				Category:    "EQ",
				Description: "Audio is bright; gentle high-frequency attenuation",
				Priority:    "medium",
				AutoApply:   true,
			})
		case "mid-heavy":
			eqParams["band.2.freq"] = 500
			eqParams["band.2.gain"] = -1.5
			eqParams["band.2.q"] = 0.8
			eqSuggestions = append(eqSuggestions, Suggestion{
				Category:    "EQ",
				Description: "Mid-range heavy; reducing 500Hz by 1.5dB",
				Priority:    "medium",
				AutoApply:   true,
			})
		}
	}

	if len(eqParams) > 0 {
		rec.Processors["Parametric EQ"] = eqParams
	}
	rec.Suggestions = append(rec.Suggestions, eqSuggestions...)

	// Compression recommendations
	compParams := make(map[string]float64)
	if result.Dynamics != nil {
		dynRange := result.Dynamics.DynamicRange
		crest := result.Dynamics.CrestFactor

		// More compression for larger dynamic range
		ratio := 2.0 + profile.Compression*4
		threshold := -12.0 - profile.Compression*8

		if dynRange > 20 {
			ratio += 1
			threshold -= 2
			rec.Suggestions = append(rec.Suggestions, Suggestion{
				Category:    "Dynamics",
				Description: fmt.Sprintf("Large dynamic range (%.1fdB); applying moderate compression", dynRange),
				Priority:    "high",
				AutoApply:   true,
			})
		} else if dynRange < 6 {
			ratio = math.Max(1.5, ratio-1)
			rec.Suggestions = append(rec.Suggestions, Suggestion{
				Category:    "Dynamics",
				Description: "Already well-compressed; using gentle compression",
				Priority:    "low",
				AutoApply:   true,
			})
		}

		if crest > 12 {
			compParams["attack"] = 5.0
			rec.Suggestions = append(rec.Suggestions, Suggestion{
				Category:    "Dynamics",
				Description: "High crest factor; using fast attack to tame peaks",
				Priority:    "medium",
				AutoApply:   true,
			})
		} else {
			compParams["attack"] = 15.0
		}

		compParams["threshold"] = threshold
		compParams["ratio"] = ratio
		compParams["release"] = 100
		compParams["knee"] = 6
		compParams["makeup"] = math.Max(0, -threshold/ratio)
	}
	rec.Processors["Compressor"] = compParams

	// Limiter recommendations
	limiterParams := map[string]float64{
		"ceiling": profile.MaxTruePeak,
		"release": 50,
	}
	rec.Processors["Limiter"] = limiterParams

	// Loudness normalization
	if result.Loudness != nil {
		diff := result.Loudness.IntegratedLUFS - profile.TargetLUFS
		if math.Abs(diff) > 1 {
			rec.Processors["Loudness Normalizer"] = map[string]float64{
				"target_lufs": profile.TargetLUFS,
			}
			rec.Suggestions = append(rec.Suggestions, Suggestion{
				Category:    "Loudness",
				Description: fmt.Sprintf("Current loudness %.1f LUFS; normalizing to %.1f LUFS for %s", result.Loudness.IntegratedLUFS, profile.TargetLUFS, profile.Name),
				Priority:    "high",
				AutoApply:   true,
			})
		}
	}

	// Stereo recommendations
	if result.StereoField != nil && profile.StereoWidth != 1.0 {
		rec.Processors["Stereo Widener"] = map[string]float64{
			"width": profile.StereoWidth,
		}
		rec.Suggestions = append(rec.Suggestions, Suggestion{
			Category:    "Stereo",
			Description: fmt.Sprintf("Adjusting stereo width to %.0f%% for %s", profile.StereoWidth*100, profile.Name),
			Priority:    "low",
			AutoApply:   true,
		})
	}

	return rec, nil
}
