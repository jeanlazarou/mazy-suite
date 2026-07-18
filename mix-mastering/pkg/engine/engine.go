package engine

import (
	"fmt"

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
// carries the shared album loudness offset in album mastering.
func NewFullChain(sampleRate, channels int) *MasteringEngine {
	e := New(sampleRate, channels)
	e.AddProcessor(dsp.NewParametricEQ(float64(sampleRate), channels))
	e.AddProcessor(dsp.NewStereoWidener())
	e.AddProcessor(dsp.NewCompressor(float64(sampleRate)))
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
	for _, p := range e.processors {
		if !p.Enabled() {
			continue
		}
		if err := p.Process(buf); err != nil {
			return fmt.Errorf("processor %q: %w", p.Name(), err)
		}
	}
	return nil
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
