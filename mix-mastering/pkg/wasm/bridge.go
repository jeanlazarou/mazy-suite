package wasm

import (
	"encoding/json"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/audiomaster/mastering/pkg/engine"
	"github.com/audiomaster/mastering/pkg/preset"
)

// Bridge provides the Go-side API for WASM <-> JS communication.
type Bridge struct {
	Engine       *engine.MasteringEngine
	PresetMgr    *preset.Manager
	LastAnalysis *analysis.AnalysisResult
	sampleRate   int
	channels     int
}

// NewBridge creates a new WASM bridge.
func NewBridge() *Bridge {
	return &Bridge{
		sampleRate: 44100,
		channels:   2,
	}
}

// InitEngine initializes the mastering engine with the full chain
// (limiter last). The loudness normalizer is active in the web UI.
func (b *Bridge) InitEngine(sampleRate, channels int) {
	b.sampleRate = sampleRate
	b.channels = channels

	b.Engine = engine.NewFullChain(sampleRate, channels)
	if p, _, err := b.Engine.GetProcessorByName("Loudness Normalizer"); err == nil {
		p.SetEnabled(true)
	}
}

// ProcessBuffer processes Float32 audio data from JS.
// Input: interleaved float32 samples [L,R,L,R,...]
// Output: interleaved float32 samples
func (b *Bridge) ProcessBuffer(input []float32, channels, sampleRate int) []float32 {
	if b.Engine == nil {
		b.InitEngine(sampleRate, channels)
	} else if sampleRate != b.sampleRate {
		// Keep time/frequency coefficients correct for the new rate.
		b.sampleRate = sampleRate
		b.channels = channels
		b.Engine.SetSampleRate(sampleRate)
	}

	length := len(input) / channels
	buf := dsp.NewAudioBuffer(channels, length, sampleRate)

	// Deinterleave float32 -> float64
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] = float64(input[i*channels+ch])
		}
	}

	// Each call processes a complete file, so start from clean state.
	b.Engine.Reset()
	b.Engine.Process(buf)

	// Interleave float64 -> float32
	output := make([]float32, len(input))
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			output[i*channels+ch] = float32(buf.Samples[ch][i])
		}
	}

	return output
}

// SetParam sets a parameter on a processor.
func (b *Bridge) SetParam(processorName, paramName string, value float64) error {
	if b.Engine == nil {
		return nil
	}
	return b.Engine.SetParam(processorName, paramName, value)
}

// GetParams returns all parameters as JSON.
func (b *Bridge) GetParams() string {
	if b.Engine == nil {
		return "{}"
	}
	params := make(map[string]map[string]float64)
	for _, p := range b.Engine.Processors() {
		params[p.Name()] = p.GetParams()
	}
	data, _ := json.Marshal(params)
	return string(data)
}

// GetMeters returns gain-reduction metering from the last ProcessBuffer
// call as JSON: processor name -> {"max_gr_db": x, "avg_gr_db": y}.
func (b *Bridge) GetMeters() string {
	if b.Engine == nil {
		return "{}"
	}
	meters := make(map[string]map[string]float64)
	for _, p := range b.Engine.Processors() {
		if m, ok := p.(dsp.GainReductionMeter); ok {
			maxDB, avgDB := m.GainReduction()
			meters[p.Name()] = map[string]float64{
				"max_gr_db": maxDB,
				"avg_gr_db": avgDB,
			}
		}
	}
	data, _ := json.Marshal(meters)
	return string(data)
}

// MeasureLoudness returns the gated integrated loudness (LUFS) of the given
// interleaved buffer. Used by the UI for loudness-matched A/B playback.
func (b *Bridge) MeasureLoudness(input []float32, channels, sampleRate int) float64 {
	length := len(input) / channels
	buf := dsp.NewAudioBuffer(channels, length, sampleRate)
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] = float64(input[i*channels+ch])
		}
	}
	meter := dsp.NewLUFSMeter(float64(sampleRate), channels)
	return meter.MeasureIntegrated(buf)
}

// MeasureBlocks returns the 400ms BS.1770 gating blocks (momentary
// loudness values) of a buffer as a JSON array. Blocks from several tracks
// can be concatenated and fed to GatedLoudnessJSON to integrate an album
// as one program.
func (b *Bridge) MeasureBlocks(input []float32, channels, sampleRate int) string {
	length := len(input) / channels
	buf := dsp.NewAudioBuffer(channels, length, sampleRate)
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] = float64(input[i*channels+ch])
		}
	}
	meter := dsp.NewLUFSMeter(float64(sampleRate), channels)
	blocks := meter.MeasureMomentary(buf)
	data, _ := json.Marshal(blocks)
	return string(data)
}

// GatedLoudnessJSON integrates gating blocks (JSON array from
// MeasureBlocks, possibly concatenated across tracks) into LUFS.
func (b *Bridge) GatedLoudnessJSON(blocksJSON string) float64 {
	var blocks []float64
	if err := json.Unmarshal([]byte(blocksJSON), &blocks); err != nil || len(blocks) == 0 {
		return -200
	}
	return dsp.GatedLoudness(blocks)
}

// SetProcessorEnabled enables/disables a processor.
func (b *Bridge) SetProcessorEnabled(name string, enabled bool) {
	if b.Engine == nil {
		return
	}
	p, _, err := b.Engine.GetProcessorByName(name)
	if err == nil {
		p.SetEnabled(enabled)
	}
}

// AnalyzeBuffer analyzes audio and returns JSON results. The result is
// cached as the reference analysis that recommendations derive from, so
// this should only be called with the original (unprocessed) audio.
func (b *Bridge) AnalyzeBuffer(input []float32, channels, sampleRate int) string {
	result := b.analyze(input, channels, sampleRate)
	b.LastAnalysis = result
	data, _ := json.Marshal(result)
	return string(data)
}

// InspectBuffer analyzes audio without touching the cached reference
// analysis. Used to display the characteristics of processed audio.
func (b *Bridge) InspectBuffer(input []float32, channels, sampleRate int) string {
	result := b.analyze(input, channels, sampleRate)
	data, _ := json.Marshal(result)
	return string(data)
}

func (b *Bridge) analyze(input []float32, channels, sampleRate int) *analysis.AnalysisResult {
	length := len(input) / channels
	buf := dsp.NewAudioBuffer(channels, length, sampleRate)

	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] = float64(input[i*channels+ch])
		}
	}

	return analysis.Analyze(buf)
}

// GetRecommendations returns recommendations for a target.
func (b *Bridge) GetRecommendations(target string) string {
	if b.LastAnalysis == nil {
		return `{"error": "no analysis available"}`
	}
	rec, err := analysis.Recommend(b.LastAnalysis, target)
	if err != nil {
		return `{"error": "` + err.Error() + `"}`
	}
	data, _ := json.Marshal(rec)
	return string(data)
}

// GetAlbumRecommendations returns recommendations for a target based on an
// aggregate of per-track analyses (JSON array of AnalysisResult), so the
// suggestion suits the album as a whole rather than one track.
func (b *Bridge) GetAlbumRecommendations(analysesJSON, target string) string {
	var results []*analysis.AnalysisResult
	if err := json.Unmarshal([]byte(analysesJSON), &results); err != nil || len(results) == 0 {
		return `{"error": "no analyses provided"}`
	}
	agg := analysis.Aggregate(results)
	rec, err := analysis.Recommend(agg, target)
	if err != nil {
		return `{"error": "` + err.Error() + `"}`
	}
	data, _ := json.Marshal(rec)
	return string(data)
}

// ApplyRecommendations applies recommendation settings to the engine.
func (b *Bridge) ApplyRecommendations(target string) error {
	if b.LastAnalysis == nil || b.Engine == nil {
		return nil
	}
	rec, err := analysis.Recommend(b.LastAnalysis, target)
	if err != nil {
		return err
	}
	for procName, params := range rec.Processors {
		for paramName, value := range params {
			b.Engine.SetParam(procName, paramName, value)
		}
	}
	return nil
}

// ListPresets returns available presets as JSON.
func (b *Bridge) ListPresets() string {
	if b.PresetMgr == nil {
		b.PresetMgr = preset.NewManager("")
	}
	presets := b.PresetMgr.List()
	type presetInfo struct {
		Name        string   `json:"name"`
		Category    string   `json:"category"`
		Description string   `json:"description"`
		Tags        []string `json:"tags"`
	}
	var infos []presetInfo
	for _, p := range presets {
		infos = append(infos, presetInfo{
			Name:        p.Name,
			Category:    p.Category,
			Description: p.Description,
			Tags:        p.Tags,
		})
	}
	data, _ := json.Marshal(infos)
	return string(data)
}

// ApplyPreset applies a preset by name.
func (b *Bridge) ApplyPreset(name string) error {
	if b.PresetMgr == nil {
		b.PresetMgr = preset.NewManager("")
	}
	p, err := b.PresetMgr.Get(name)
	if err != nil {
		return err
	}
	for procName, params := range p.Processors {
		for paramName, value := range params {
			b.Engine.SetParam(procName, paramName, value)
		}
	}
	return nil
}

// ListTargets returns available target profiles.
func (b *Bridge) ListTargets() string {
	targets := analysis.ListTargets()
	data, _ := json.Marshal(targets)
	return string(data)
}

// Reset resets the engine state.
func (b *Bridge) Reset() {
	if b.Engine != nil {
		b.Engine.Reset()
	}
}
