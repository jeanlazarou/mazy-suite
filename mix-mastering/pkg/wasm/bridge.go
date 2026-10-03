package wasm

import (
	"encoding/json"
	"math"

	"github.com/audiomaster/mastering/pkg/analysis"
	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/audiomaster/mastering/pkg/engine"
	"github.com/audiomaster/mastering/pkg/recipe"
)

// Bridge provides the Go-side API for WASM <-> JS communication.
type Bridge struct {
	Engine     *engine.MasteringEngine
	sampleRate int
	channels   int
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

// StageSummary describes the signal at one stage of the chain in a form
// small enough to ship across the WASM boundary: a min/max/RMS envelope
// bucketed for direct waveform drawing, plus overall peak and RMS levels.
type StageSummary struct {
	Name   string    `json:"name"`
	Mins   []float64 `json:"mins"`
	Maxs   []float64 `json:"maxs"`
	RMS    []float64 `json:"rms"`
	PeakDB float64   `json:"peak_db"`
	RMSDB  float64   `json:"rms_db"`
	// Optional spectrogram: [time column][band] peak level in dBFS over
	// log-spaced bands (SpecFreqs holds the band centers in Hz).
	SpecDB    [][]float64 `json:"spec_db,omitempty"`
	SpecFreqs []float64   `json:"spec_freqs,omitempty"`
}

// ProcessBufferStages processes like ProcessBuffer but also captures a
// StageSummary of the signal at every stage of the chain ("Input" plus
// each enabled processor), returned as a JSON array. buckets is the
// envelope resolution (typically the display width in pixels). specCols
// > 0 additionally computes a spectrogram with that many time columns
// per stage.
func (b *Bridge) ProcessBufferStages(input []float32, channels, sampleRate, buckets, specCols int) ([]float32, string) {
	if b.Engine == nil {
		b.InitEngine(sampleRate, channels)
	} else if sampleRate != b.sampleRate {
		b.sampleRate = sampleRate
		b.channels = channels
		b.Engine.SetSampleRate(sampleRate)
	}

	length := len(input) / channels
	buf := dsp.NewAudioBuffer(channels, length, sampleRate)
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			buf.Samples[ch][i] = float64(input[i*channels+ch])
		}
	}

	var stages []StageSummary
	b.Engine.Reset()
	b.Engine.ProcessWithTaps(buf, func(stage string, tapped *dsp.AudioBuffer) {
		s := summarizeStage(stage, tapped, buckets)
		if specCols > 0 {
			s.SpecDB, s.SpecFreqs = spectrogram(tapped, specCols, sampleRate)
		}
		stages = append(stages, s)
	})

	output := make([]float32, len(input))
	for i := 0; i < length; i++ {
		for ch := 0; ch < channels; ch++ {
			output[i*channels+ch] = float32(buf.Samples[ch][i])
		}
	}

	data, _ := json.Marshal(stages)
	return output, string(data)
}

// summarizeStage reduces a buffer to a bucketed min/max/RMS envelope over
// all channels plus overall peak/RMS in dBFS.
func summarizeStage(name string, buf *dsp.AudioBuffer, buckets int) StageSummary {
	n := 0
	if len(buf.Samples) > 0 {
		n = len(buf.Samples[0])
	}
	if buckets < 1 {
		buckets = 1
	}
	if n > 0 && buckets > n {
		buckets = n
	}

	s := StageSummary{
		Name: name,
		Mins: make([]float64, buckets),
		Maxs: make([]float64, buckets),
		RMS:  make([]float64, buckets),
	}
	if n == 0 {
		s.PeakDB, s.RMSDB = -120, -120
		return s
	}

	per := (n + buckets - 1) / buckets
	peak, sumSq, count := 0.0, 0.0, 0
	for bkt := 0; bkt < buckets; bkt++ {
		start := bkt * per
		end := start + per
		if end > n {
			end = n
		}
		mn, mx, ss, c := 0.0, 0.0, 0.0, 0
		for _, ch := range buf.Samples {
			for i := start; i < end; i++ {
				v := ch[i]
				if v < mn {
					mn = v
				}
				if v > mx {
					mx = v
				}
				ss += v * v
				c++
			}
		}
		if c > 0 {
			s.RMS[bkt] = round4(math.Sqrt(ss / float64(c)))
		}
		s.Mins[bkt] = round4(mn)
		s.Maxs[bkt] = round4(mx)
		if -mn > peak {
			peak = -mn
		}
		if mx > peak {
			peak = mx
		}
		sumSq += ss
		count += c
	}
	s.PeakDB = round4(toDB(peak))
	if count > 0 {
		s.RMSDB = round4(toDB(math.Sqrt(sumSq / float64(count))))
	} else {
		s.RMSDB = -120
	}
	return s
}

func toDB(v float64) float64 {
	if v <= 1e-6 {
		return -120
	}
	return 20 * math.Log10(v)
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
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

// GetProcessorNames returns the chain's processor names in processing
// order as a JSON array, e.g. ["Parametric EQ", "Bass Exciter", ...].
// Go's JSON map serialization is alphabetical, so GetParams can't convey
// chain order — the web UI's studio strip needs this to render the real
// signal flow instead of a hand-maintained list. Lazily initializes the
// engine so the strip can render before any audio has been processed.
func (b *Bridge) GetProcessorNames() string {
	if b.Engine == nil {
		b.InitEngine(b.sampleRate, b.channels)
	}
	names := make([]string, 0, len(b.Engine.Processors()))
	for _, p := range b.Engine.Processors() {
		names = append(names, p.Name())
	}
	data, _ := json.Marshal(names)
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

// AnalyzeBuffer analyzes audio and returns JSON results. The UI calls it
// for the original audio (InspectBuffer for processed audio); both are
// stateless — recipes get their analyses passed in explicitly.
func (b *Bridge) AnalyzeBuffer(input []float32, channels, sampleRate int) string {
	return b.InspectBuffer(input, channels, sampleRate)
}

// InspectBuffer analyzes audio and returns JSON results.
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

// RecipeOptions returns the styles and destinations the UI offers, as JSON.
func (b *Bridge) RecipeOptions() string {
	data, _ := json.Marshal(recipe.ListOptions())
	return string(data)
}

// BuildRecipe returns the complete chain settings for a choice (JSON
// recipe.Choice) as JSON. analysesJSON is a JSON array of the analyses
// the fixes derive from: one for a single track, every track for an
// album (aggregated, so the settings suit the record as a whole). It does
// not touch the engine — the UI replays the recipe's params and bypass
// state like any other settings change.
func (b *Bridge) BuildRecipe(choiceJSON, analysesJSON string) string {
	var c recipe.Choice
	if err := json.Unmarshal([]byte(choiceJSON), &c); err != nil {
		return `{"error": "invalid choice"}`
	}
	var results []*analysis.AnalysisResult
	json.Unmarshal([]byte(analysesJSON), &results)
	r, err := recipe.Build(c, analysis.Aggregate(results))
	if err != nil {
		data, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(data)
	}
	data, _ := json.Marshal(r)
	return string(data)
}

// Reset resets the engine state.
func (b *Bridge) Reset() {
	if b.Engine != nil {
		b.Engine.Reset()
	}
}
