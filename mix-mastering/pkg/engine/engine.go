package engine

import (
	"fmt"
	"math"

	"github.com/audiomaster/mastering/pkg/dsp"
	audioio "github.com/audiomaster/mastering/pkg/io"
)

// MasteringEngine orchestrates the DSP processing chain.
type MasteringEngine struct {
	processors []dsp.Processor
	sampleRate int
	channels   int
}

// New creates a new MasteringEngine with default processors.
func New(sampleRate, channels int) *MasteringEngine {
	e := &MasteringEngine{
		sampleRate: sampleRate,
		channels:   channels,
	}
	return e
}

// NewWithDefaults creates an engine with a standard mastering chain.
func NewWithDefaults(sampleRate, channels int) *MasteringEngine {
	e := New(sampleRate, channels)
	e.AddProcessor(dsp.NewParametricEQ(float64(sampleRate), channels))
	e.AddProcessor(dsp.NewCompressor(float64(sampleRate)))
	e.AddProcessor(dsp.NewLimiter(float64(sampleRate)))
	return e
}

// NewFullChain creates an engine with the complete mastering chain. The
// limiter is last so its ceiling holds on the actual output: gain changes
// from widening, loudness normalization, and the album offset happen
// before it. The loudness normalizer starts disabled; enable it to
// normalize to a target LUFS. The Gain stage is unity by default and
// carries the shared album loudness offset in album mastering. The Bass
// and Treble Exciters start disabled — they're generative/creative
// additions (harmonics that weren't in the source), not corrective ones,
// so the default chain stays transparent; recommendations and presets
// switch them on via their "enabled" param when a target profile calls
// for them (e.g. phone/bluetooth). Bass excitement sits before the
// Stereo Widener so the synthesized low end stays centered; treble
// excitement sits after the Compressor to restore sparkle that gain
// reduction tends to dull. Saturation (the "Warm" version's analog-style
// color) also starts disabled; it follows the EQ, so the tone is shaped
// before it's driven, and comes before the Compressor, which then glues
// the saturated sound.
func NewFullChain(sampleRate, channels int) *MasteringEngine {
	e := New(sampleRate, channels)
	e.AddProcessor(dsp.NewParametricEQ(float64(sampleRate), channels))
	e.AddProcessor(dsp.NewSaturation(float64(sampleRate)))
	bassExciter := dsp.NewBassExciter(float64(sampleRate))
	bassExciter.SetEnabled(false)
	e.AddProcessor(bassExciter)
	e.AddProcessor(dsp.NewStereoWidener())
	e.AddProcessor(dsp.NewCompressor(float64(sampleRate)))
	trebleExciter := dsp.NewTrebleExciter(float64(sampleRate))
	trebleExciter.SetEnabled(false)
	e.AddProcessor(trebleExciter)
	normalizer := dsp.NewLoudnessNormalizer(float64(sampleRate))
	normalizer.SetEnabled(false)
	e.AddProcessor(normalizer)
	e.AddProcessor(dsp.NewGain())
	e.AddProcessor(dsp.NewLimiter(float64(sampleRate)))
	return e
}

// AddProcessor appends a processor to the chain.
func (e *MasteringEngine) AddProcessor(p dsp.Processor) {
	e.processors = append(e.processors, p)
}

// InsertProcessor inserts a processor at the given index.
func (e *MasteringEngine) InsertProcessor(index int, p dsp.Processor) error {
	if index < 0 || index > len(e.processors) {
		return fmt.Errorf("index out of range: %d", index)
	}
	e.processors = append(e.processors, nil)
	copy(e.processors[index+1:], e.processors[index:])
	e.processors[index] = p
	return nil
}

// RemoveProcessor removes the processor at the given index.
func (e *MasteringEngine) RemoveProcessor(index int) error {
	if index < 0 || index >= len(e.processors) {
		return fmt.Errorf("index out of range: %d", index)
	}
	e.processors = append(e.processors[:index], e.processors[index+1:]...)
	return nil
}

// GetProcessor returns the processor at the given index.
func (e *MasteringEngine) GetProcessor(index int) (dsp.Processor, error) {
	if index < 0 || index >= len(e.processors) {
		return nil, fmt.Errorf("index out of range: %d", index)
	}
	return e.processors[index], nil
}

// GetProcessorByName returns the first processor matching the given name.
func (e *MasteringEngine) GetProcessorByName(name string) (dsp.Processor, int, error) {
	for i, p := range e.processors {
		if p.Name() == name {
			return p, i, nil
		}
	}
	return nil, -1, fmt.Errorf("processor not found: %s", name)
}

// Processors returns all processors in the chain.
func (e *MasteringEngine) Processors() []dsp.Processor {
	return e.processors
}

// Process runs the entire chain on the given buffer.
func (e *MasteringEngine) Process(buf *dsp.AudioBuffer) error {
	return e.ProcessWithTaps(buf, nil)
}

// ProcessWithTaps runs the chain like Process, additionally invoking tap
// with the unprocessed input (stage "Input") and after each enabled
// processor, so callers can capture the signal at every stage of the
// chain. The buffer passed to tap is the live processing buffer — taps
// must only read it. A nil tap is allowed.
func (e *MasteringEngine) ProcessWithTaps(buf *dsp.AudioBuffer, tap func(stage string, buf *dsp.AudioBuffer)) error {
	if tap != nil {
		tap("Input", buf)
	}
	var normalizer *dsp.LoudnessNormalizer
	for _, p := range e.processors {
		if !p.Enabled() {
			continue
		}
		var err error
		if lim, ok := p.(*dsp.Limiter); ok && normalizer != nil {
			err = limitToTarget(buf, lim, normalizer.TargetLUFS)
		} else {
			err = p.Process(buf)
		}
		if err != nil {
			return fmt.Errorf("processor %q: %w", p.Name(), err)
		}
		if ln, ok := p.(*dsp.LoudnessNormalizer); ok {
			normalizer = ln
		}
		if tap != nil {
			tap(p.Name(), buf)
		}
	}
	return nil
}

// How close to the normalizer's target the limited result must land (LU),
// how many times more level is fed to the limiter to get there, and the
// most it may be fed in total (dB).
const (
	targetTolerance = 0.1
	targetPasses    = 3
	targetMaxMakeup = 3.0
)

// limitToTarget runs the limiter after a loudness normalizer. The
// normalizer reaches its target before the limiter, and the limiter then
// takes level off the peaks, so the result ends under the target; where
// it does, the limiter is run again on its input with that much more
// level.
func limitToTarget(buf *dsp.AudioBuffer, lim *dsp.Limiter, targetLUFS float64) error {
	input := make([][]float64, buf.Channels())
	for ch := range input {
		input[ch] = append([]float64(nil), buf.Samples[ch]...)
	}
	makeup := 0.0
	for pass := 0; ; pass++ {
		if err := lim.Process(buf); err != nil {
			return err
		}
		got := dsp.NewLUFSMeter(float64(buf.SampleRate), buf.Channels()).MeasureIntegrated(buf)
		short := targetLUFS - got
		if got < -100 || short < targetTolerance || pass == targetPasses || makeup >= targetMaxMakeup {
			return nil
		}
		makeup = math.Min(makeup+short, targetMaxMakeup)
		gain := math.Pow(10, makeup/20)
		for ch := range input {
			for i, v := range input[ch] {
				buf.Samples[ch][i] = v * gain
			}
		}
	}
}

// SetSampleRate updates the engine's sample rate and propagates it to all
// processors whose coefficients depend on it.
func (e *MasteringEngine) SetSampleRate(sampleRate int) {
	e.sampleRate = sampleRate
	for _, p := range e.processors {
		if sra, ok := p.(dsp.SampleRateAware); ok {
			sra.SetSampleRate(float64(sampleRate))
		}
	}
}

// ProcessFile reads an input file, processes it, and writes the output.
func (e *MasteringEngine) ProcessFile(inputPath, outputPath string, outputBitDepth int) error {
	buf, meta, err := audioio.ReadAudio(inputPath)
	if err != nil {
		return fmt.Errorf("read input: %w", err)
	}

	// Update engine settings from input
	if meta.SampleRate != e.sampleRate {
		e.SetSampleRate(meta.SampleRate)
	}
	e.channels = meta.Channels
	e.Reset()

	if err := e.Process(buf); err != nil {
		return fmt.Errorf("process: %w", err)
	}

	if outputBitDepth == 0 {
		outputBitDepth = meta.BitDepth
	}

	if err := audioio.WriteAudio(outputPath, buf, outputBitDepth); err != nil {
		return fmt.Errorf("write output: %w", err)
	}

	return nil
}

// Reset resets all processors' internal state.
func (e *MasteringEngine) Reset() {
	for _, p := range e.processors {
		p.Reset()
	}
}

// SetParam sets a parameter on a processor by name.
func (e *MasteringEngine) SetParam(processorName, paramName string, value float64) error {
	p, _, err := e.GetProcessorByName(processorName)
	if err != nil {
		return err
	}
	return p.SetParam(paramName, value)
}

// SampleRate returns the engine's sample rate.
func (e *MasteringEngine) SampleRate() int { return e.sampleRate }

// Channels returns the engine's channel count.
func (e *MasteringEngine) Channels() int { return e.channels }
