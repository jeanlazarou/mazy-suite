// Package recipe builds complete mastering-chain settings from three
// independent choices that each own a different part of the sound:
//
//   - Style ("what is it?", optional): the musical character — a tonal
//     curve and how the compressor moves (attack/release/knee).
//   - Destination ("where will it be heard?"): delivery — loudness
//     target, true-peak ceiling, compression density, stereo width,
//     device compensation and harmonic excitement.
//   - Fix (on/off): corrections derived from the analysis of the source
//     (too dark/bright/muddy, too dynamic or already squashed).
//
// The choices combine instead of overwriting each other: EQ bands have
// fixed roles and every layer adds dB to them; the compressor's character
// comes from the style and its amount from the destination. A recipe
// always carries every parameter of every processor in the full chain, so
// applying one never leaves values behind from an earlier choice.
package recipe

import (
	"fmt"
	"math"
	"strings"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/engine"
)

// Tone is a tonal adjustment in dB on the EQ's four shaping bands.
type Tone struct {
	Low      float64 // low shelf, 100 Hz
	Mud      float64 // peak, 400 Hz (low-mids)
	Presence float64 // peak, 3 kHz
	Air      float64 // high shelf, 10 kHz
}

func (t Tone) add(o Tone) Tone {
	return Tone{t.Low + o.Low, t.Mud + o.Mud, t.Presence + o.Presence, t.Air + o.Air}
}

// Style is the musical character of the material.
type Style struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Tone        Tone    `json:"-"`
	HighPassHz  float64 `json:"-"` // 0 = no high-pass
	Attack      float64 `json:"-"` // compressor attack, ms
	Release     float64 `json:"-"` // compressor release, ms
	Knee        float64 `json:"-"` // dB
	RatioAdd    float64 `json:"-"` // added to the destination's ratio
	ThreshAdd   float64 `json:"-"` // added to the destination's threshold, dB
}

// Destination is where the master will be heard.
type Destination struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Group        string  `json:"group"` // "release" or "device"
	Description  string  `json:"description"`
	TargetLUFS   float64 `json:"target_lufs"`
	CeilingDBTP  float64 `json:"ceiling_dbtp"`
	Density      float64 `json:"-"` // 0-1, how much to compress
	Width        float64 `json:"-"` // stereo width multiplier
	Tone         Tone    `json:"-"` // device compensation
	HighPassHz   float64 `json:"-"`
	BassExcite   float64 `json:"-"` // 0-1
	TrebleExcite float64 `json:"-"` // 0-1
}

// neutralStyle is used when no style is chosen: no tonal shaping, a
// middle-of-the-road compressor motion.
var neutralStyle = Style{ID: "", Name: "No style", Attack: 15, Release: 100, Knee: 6}

var styles = []Style{
	{ID: "rock", Name: "Rock", Description: "Solid lows, cleaner low-mids, a bit of bite and air; punchy compression.",
		Tone: Tone{Low: 1.5, Mud: -1, Presence: 1, Air: 1.5}, Attack: 10, Release: 100, Knee: 6, RatioAdd: 1, ThreshAdd: -2},
	{ID: "pop", Name: "Pop", Description: "Bright and polished: forward vocals, extra air, smooth compression.",
		Tone: Tone{Low: 1, Presence: 1.5, Air: 2}, Attack: 5, Release: 80, Knee: 8, RatioAdd: 0.5, ThreshAdd: -1},
	{ID: "electronic", Name: "Electronic", Description: "Big low end, scooped low-mids, crisp top; tight, dense compression.",
		Tone: Tone{Low: 2, Mud: -1.5, Air: 2}, Attack: 3, Release: 50, Knee: 4, RatioAdd: 1.5, ThreshAdd: -3},
	{ID: "hiphop", Name: "Hip-hop", Description: "Heavy lows, clear vocals; firm compression that keeps the kick punching.",
		Tone: Tone{Low: 2.5, Mud: -1, Presence: 1, Air: 1}, Attack: 10, Release: 80, Knee: 6, RatioAdd: 1, ThreshAdd: -2},
	{ID: "jazz", Name: "Jazz", Description: "Warm and natural; gentle, slow compression that keeps the dynamics.",
		Tone: Tone{Low: 0.5, Presence: -0.5, Air: 1}, Attack: 25, Release: 200, Knee: 10, RatioAdd: -0.5, ThreshAdd: 2},
	{ID: "acoustic", Name: "Acoustic / folk", Description: "Open and natural, slightly less boxy; light compression.",
		Tone: Tone{Mud: -0.5, Presence: 0.5, Air: 1}, Attack: 20, Release: 150, Knee: 10, RatioAdd: -0.5, ThreshAdd: 2},
	{ID: "classical", Name: "Classical", Description: "Almost untouched: a touch of air, very light compression to keep the full dynamic range.",
		Tone: Tone{Presence: 0.5, Air: 1}, Attack: 30, Release: 300, Knee: 12, RatioAdd: -1, ThreshAdd: 4},
	{ID: "voice", Name: "Voice / speech", Description: "Spoken word: rumble cut, less boom, more intelligibility, softer sibilance; even levels.",
		Tone: Tone{Low: -2, Mud: -1.5, Presence: 2, Air: -1}, HighPassHz: 80, Attack: 5, Release: 80, Knee: 6, RatioAdd: 1, ThreshAdd: -2},
}

var destinations = []Destination{
	{ID: "streaming", Name: "Streaming", Group: "release",
		Description: "Spotify, Apple Music, YouTube, Bandcamp. Platforms turn louder masters down, so this keeps dynamics.",
		TargetLUFS:  -14, CeilingDBTP: -1, Density: 0.3, Width: 1},
	{ID: "podcast", Name: "Podcast & video", Group: "release",
		Description: "Podcasts, YouTube voice-overs, video soundtracks: a bit quieter and more even, for earbuds and laptops.",
		TargetLUFS:  -16, CeilingDBTP: -1, Density: 0.45, Width: 0.9, Tone: Tone{Presence: 0.5}},
	{ID: "loud", Name: "Loud (CD / club)", Group: "release",
		Description: "As loud as reasonable: CDs, DJ sets, files played without loudness normalization.",
		TargetLUFS:  -9, CeilingDBTP: -0.3, Density: 0.7, Width: 1},
	{ID: "vinyl", Name: "Vinyl", Group: "release",
		Description: "Vinyl pre-master: sub-rumble cut, narrower lows, softer highs, moderate level.",
		TargetLUFS:  -13, CeilingDBTP: -1, Density: 0.35, Width: 0.8, HighPassHz: 30, Tone: Tone{Air: -0.5}},
	{ID: "headphones", Name: "Headphones", Group: "device",
		Description: "Tuned for headphones and earbuds: slightly less bass and top, a touch narrower.",
		TargetLUFS:  -14, CeilingDBTP: -1, Density: 0.3, Width: 0.9, Tone: Tone{Low: -1, Presence: 0.5, Air: -0.5}},
	{ID: "car", Name: "Car", Group: "device",
		Description: "Cuts through road noise: more lows and highs, denser, narrower, a little bass and treble harmonics.",
		TargetLUFS:  -12, CeilingDBTP: -0.3, Density: 0.7, Width: 0.7, Tone: Tone{Low: 3, Presence: 1, Air: 1.5},
		BassExcite: 0.15, TrebleExcite: 0.4},
	{ID: "phone", Name: "Phone speaker", Group: "device",
		Description: "Tiny speakers: real bass is replaced by harmonics you can hear, mids forward, dense and narrow.",
		TargetLUFS:  -12, CeilingDBTP: -0.5, Density: 0.8, Width: 0.5, Tone: Tone{Low: -3, Presence: 3, Air: 1},
		BassExcite: 0.7, TrebleExcite: 0.4},
	{ID: "bluetooth", Name: "Bluetooth speaker", Group: "device",
		Description: "Portable speakers: fuller lows plus bass harmonics, denser and narrower.",
		TargetLUFS:  -12, CeilingDBTP: -0.5, Density: 0.6, Width: 0.6, Tone: Tone{Low: 2, Presence: 1, Air: 0.5},
		BassExcite: 0.6, TrebleExcite: 0.3},
}

// DefaultDestination is used when none is given.
const DefaultDestination = "streaming"

// Options lists the available styles and destinations, in display order.
type Options struct {
	Styles       []Style       `json:"styles"`
	Destinations []Destination `json:"destinations"`
}

// ListOptions returns every style and destination.
func ListOptions() Options {
	return Options{Styles: styles, Destinations: destinations}
}

// Choice is what the user picked.
type Choice struct {
	Style       string `json:"style"`       // "" = no style
	Destination string `json:"destination"` // "" = DefaultDestination
	Fix         bool   `json:"fix"`
}

// Note explains one thing the recipe does, attributed to the layer that
// caused it ("style", "destination" or "fix").
type Note struct {
	Layer string `json:"layer"`
	Text  string `json:"text"`
}

// Recipe is the complete chain configuration for a Choice.
type Recipe struct {
	Choice
	Summary     string                        `json:"summary"`
	Notes       []Note                        `json:"notes"`
	Fixes       int                           `json:"fixes"` // number of fix notes
	TargetLUFS  float64                       `json:"target_lufs"`
	CeilingDBTP float64                       `json:"ceiling_dbtp"`
	Processors  map[string]map[string]float64 `json:"processors"` // every param of every processor
	Enabled     map[string]bool               `json:"enabled"`    // bypass state of every processor
}

func findStyle(id string) (Style, error) {
	if id == "" || strings.EqualFold(id, "none") {
		return neutralStyle, nil
	}
	for _, s := range styles {
		if strings.EqualFold(s.ID, id) {
			return s, nil
		}
	}
	ids := make([]string, len(styles))
	for i, s := range styles {
		ids[i] = s.ID
	}
	return Style{}, fmt.Errorf("unknown style %q (available: %s)", id, strings.Join(ids, ", "))
}

func findDestination(id string) (Destination, error) {
	if id == "" {
		id = DefaultDestination
	}
	for _, d := range destinations {
		if strings.EqualFold(d.ID, id) {
			return d, nil
		}
	}
	ids := make([]string, len(destinations))
	for i, d := range destinations {
		ids[i] = d.ID
	}
	return Destination{}, fmt.Errorf("unknown destination %q (available: %s)", id, strings.Join(ids, ", "))
}

// Build computes the complete chain settings for a choice. a is the
// analysis of the source (for an album, analysis.Aggregate of all tracks);
// it may be nil, in which case no fixes are applied.
func Build(c Choice, a *analysis.AnalysisResult) (*Recipe, error) {
	style, err := findStyle(c.Style)
	if err != nil {
		return nil, err
	}
	dest, err := findDestination(c.Destination)
	if err != nil {
		return nil, err
	}
	c.Style, c.Destination = style.ID, dest.ID

	r := &Recipe{
		Choice:      c,
		TargetLUFS:  dest.TargetLUFS,
		CeilingDBTP: dest.CeilingDBTP,
		Processors:  defaults(),
		Enabled:     map[string]bool{},
	}
	for name := range r.Processors {
		r.Enabled[name] = true
	}
	note := func(layer, format string, args ...any) {
		r.Notes = append(r.Notes, Note{Layer: layer, Text: fmt.Sprintf(format, args...)})
	}

	// --- Style: character ---
	if style.ID != "" {
		note("style", "%s character: %s", style.Name, lowerFirst(style.Description))
	}

	// --- Destination: delivery ---
	if a != nil && a.Loudness != nil && a.Loudness.IntegratedLUFS > -100 {
		note("destination", "Loudness %.1f → %.0f LUFS, peaks at most %.1f dBTP",
			a.Loudness.IntegratedLUFS, dest.TargetLUFS, dest.CeilingDBTP)
	} else {
		note("destination", "Loudness %.0f LUFS, peaks at most %.1f dBTP", dest.TargetLUFS, dest.CeilingDBTP)
	}
	if t := describeTone(dest.Tone); t != "" {
		note("destination", "Tuned for %s: %s", strings.ToLower(dest.Name), t)
	}
	if dest.Width != 1 {
		note("destination", "Stereo width %.0f%%", dest.Width*100)
	}
	if dest.BassExcite > 0 || dest.TrebleExcite > 0 {
		note("destination", "Adds harmonics so the sound carries on %s", strings.ToLower(dest.Name))
	}

	// --- Fix: from the analysis ---
	var fixTone Tone
	ratioFix, threshFix, attackCap := 0.0, 0.0, 0.0
	if c.Fix && a != nil {
		if a.Spectrum != nil {
			switch a.Spectrum.SpectralBalance {
			case "dark":
				fixTone.Air = 2
				note("fix", "Sounds dark: +2 dB of air at 10 kHz")
			case "bright":
				fixTone.Air = -1.5
				note("fix", "Sounds bright: −1.5 dB at 10 kHz")
			case "mid-heavy":
				fixTone.Mud = -1.5
				note("fix", "Crowded low-mids: −1.5 dB around 400 Hz")
			}
		}
		// Dynamics are judged by the loudness range (EBU Tech 3342 LRA),
		// which ignores fades and silences — the dynamic-range figure
		// (loudest minus quietest moment) reads ~80 dB on any song with a
		// fade-out, so it can't tell a dynamic mix from a squashed one.
		// LRA 0 means unknown (no gated blocks), not "flat".
		if a.Loudness != nil && a.Loudness.LoudnessRange > 0 {
			switch lra := a.Loudness.LoudnessRange; {
			case lra > 15:
				ratioFix, threshFix = 1, -2
				note("fix", "Very wide dynamics (loudness range %.1f LU): a bit more compression", lra)
			case lra < 4:
				ratioFix = -1
				note("fix", "Already heavily compressed (loudness range %.1f LU): gentler compression", lra)
			}
		}
		if a.Dynamics != nil {
			if a.Dynamics.CrestFactor > 12 {
				attackCap = 5
				note("fix", "Sharp peaks: faster compressor attack")
			}
		}
	}
	for _, n := range r.Notes {
		if n.Layer == "fix" {
			r.Fixes++
		}
	}

	// --- EQ: fixed band roles, layers add up ---
	tone := style.Tone.add(dest.Tone).add(fixTone)
	eq := r.Processors["Parametric EQ"]
	setBand := func(i int, freq, gain, q float64) {
		eq[fmt.Sprintf("band.%d.freq", i)] = freq
		eq[fmt.Sprintf("band.%d.gain", i)] = clamp(gain, -6, 6)
		eq[fmt.Sprintf("band.%d.q", i)] = q
		eq[fmt.Sprintf("band.%d.enabled", i)] = 1
	}
	setBand(1, 100, tone.Low, 0.707)
	setBand(2, 400, tone.Mud, 1.0)
	setBand(3, 3000, tone.Presence, 1.0)
	setBand(4, 10000, tone.Air, 0.707)
	if hp := math.Max(style.HighPassHz, dest.HighPassHz); hp > 0 {
		eq["band.0.freq"] = hp
		eq["band.0.enabled"] = 1
	}

	// --- Compressor: character from style, amount from destination ---
	comp := r.Processors["Compressor"]
	ratio := clamp(1.5+dest.Density*3+style.RatioAdd+ratioFix, 1.2, 8)
	threshold := clamp(-10-dest.Density*10+style.ThreshAdd+threshFix, -40, -4)
	attack := style.Attack
	if attackCap > 0 {
		attack = math.Min(attack, attackCap)
	}
	comp["ratio"] = round1(ratio)
	comp["threshold"] = round1(threshold)
	comp["attack"] = attack
	comp["release"] = style.Release
	comp["knee"] = style.Knee
	comp["makeup"] = round1(math.Max(0, -threshold/ratio))
	comp["auto_makeup"] = 0

	// --- Delivery stages ---
	r.Processors["Stereo Widener"]["width"] = dest.Width
	r.Processors["Loudness Normalizer"]["target_lufs"] = dest.TargetLUFS
	r.Processors["Gain"]["gain_db"] = 0
	r.Processors["Limiter"]["ceiling"] = dest.CeilingDBTP
	r.Processors["Limiter"]["release"] = 50
	setExciter(r, "Bass Exciter", dest.BassExcite)
	setExciter(r, "Treble Exciter", dest.TrebleExcite)

	r.Summary = summary(style, dest, r.Fixes, c.Fix)
	return r, nil
}

// defaults returns every parameter of a fresh full chain.
func defaults() map[string]map[string]float64 {
	e := engine.NewFullChain(44100, 2)
	out := make(map[string]map[string]float64)
	for _, p := range e.Processors() {
		out[p.Name()] = p.GetParams()
	}
	return out
}

func setExciter(r *Recipe, name string, amount float64) {
	p := r.Processors[name]
	if amount <= 0 {
		p["enabled"] = 0
		r.Enabled[name] = false
		return
	}
	p["enabled"] = 1
	p["drive"] = amount
	p["mix"] = 0.1 + 0.3*amount
	r.Enabled[name] = true
}

func summary(s Style, d Destination, fixes int, fix bool) string {
	parts := []string{}
	if s.ID != "" {
		parts = append(parts, s.Name)
	}
	parts = append(parts, fmt.Sprintf("for %s (%.0f LUFS)", d.Name, d.TargetLUFS))
	switch {
	case !fix:
		parts = append(parts, "no fixes")
	case fixes == 1:
		parts = append(parts, "1 fix")
	case fixes > 1:
		parts = append(parts, fmt.Sprintf("%d fixes", fixes))
	}
	return strings.Join(parts, " · ")
}

func describeTone(t Tone) string {
	var parts []string
	add := func(v float64, what string) {
		if v > 0 {
			parts = append(parts, fmt.Sprintf("more %s", what))
		} else if v < 0 {
			parts = append(parts, fmt.Sprintf("less %s", what))
		}
	}
	add(t.Low, "bass")
	add(t.Mud, "low-mids")
	add(t.Presence, "presence")
	add(t.Air, "air")
	return strings.Join(parts, ", ")
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func round1(v float64) float64 { return math.Round(v*10) / 10 }
