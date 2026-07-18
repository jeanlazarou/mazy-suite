package dsp

// AudioBuffer holds multi-channel audio data in float64.
type AudioBuffer struct {
	Samples    [][]float64 // [channel][sample]
	SampleRate int
}

// NewAudioBuffer creates a buffer with the given channels, length, and sample rate.
func NewAudioBuffer(channels, length, sampleRate int) *AudioBuffer {
	samples := make([][]float64, channels)
	for i := range samples {
		samples[i] = make([]float64, length)
	}
	return &AudioBuffer{Samples: samples, SampleRate: sampleRate}
}

// Channels returns the number of channels.
func (b *AudioBuffer) Channels() int { return len(b.Samples) }

// Length returns the number of samples per channel.
func (b *AudioBuffer) Length() int {
	if len(b.Samples) == 0 {
		return 0
	}
	return len(b.Samples[0])
}

// Processor is the interface all DSP processors implement.
type Processor interface {
	// Process applies the effect to the buffer in-place.
	Process(buf *AudioBuffer) error
	// SetParam sets a named parameter.
	SetParam(name string, value float64) error
	// GetParam returns a named parameter's value.
	GetParam(name string) (float64, error)
	// GetParams returns all parameters as a map.
	GetParams() map[string]float64
	// Name returns the processor's display name.
	Name() string
	// Reset clears internal state (e.g., filter memory).
	Reset()
	// Enabled returns whether the processor is active.
	Enabled() bool
	// SetEnabled toggles the processor on/off.
	SetEnabled(enabled bool)
}

// SampleRateAware is implemented by processors whose coefficients depend on
// the sample rate. Engines call SetSampleRate before processing audio at a
// rate different from the one the processor was constructed with.
type SampleRateAware interface {
	SetSampleRate(sampleRate float64)
}

// GainReductionMeter is implemented by dynamics processors that report how
// much gain reduction their most recent Process call applied. Values are in
// dB of reduction (positive numbers; 0 means no reduction).
type GainReductionMeter interface {
	GainReduction() (maxDB, avgDB float64)
}

// BaseProcessor provides common fields for all processors.
type BaseProcessor struct {
	ProcessorName string
	IsEnabled     bool
}

func (b *BaseProcessor) Name() string      { return b.ProcessorName }
func (b *BaseProcessor) Enabled() bool     { return b.IsEnabled }
func (b *BaseProcessor) SetEnabled(e bool) { b.IsEnabled = e }
