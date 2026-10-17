package dsp

import "math"

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

// TimelineBuckets is the number of time slices a DynamicsTimeline divides
// a processed buffer into (fewer for buffers shorter than that).
const TimelineBuckets = 600

// DynamicsTimeline shows where in the buffer a dynamics processor worked:
// per time slice, the highest level it detected (dBFS) and the most gain
// reduction it applied (dB, positive). The UI draws these against the
// processor's settings, e.g. the ceiling line over the limiter's input.
type DynamicsTimeline struct {
	InputDB         []float64
	GainReductionDB []float64
}

// DynamicsTimelineMeter is implemented by processors that record a
// DynamicsTimeline during Process.
type DynamicsTimelineMeter interface {
	Timeline() DynamicsTimeline
}

// timelineRecorder accumulates a DynamicsTimeline sample by sample.
type timelineRecorder struct {
	length  int
	maxIn   []float64 // linear
	minGain []float64 // linear
}

func (r *timelineRecorder) start(length int) {
	n := TimelineBuckets
	if length < n {
		n = length
	}
	r.length = length
	r.maxIn = make([]float64, n)
	r.minGain = make([]float64, n)
	for i := range r.minGain {
		r.minGain[i] = 1
	}
}

func (r *timelineRecorder) bucket(i int) int {
	return i * len(r.maxIn) / r.length
}

func (r *timelineRecorder) input(i int, level float64) {
	if b := r.bucket(i); level > r.maxIn[b] {
		r.maxIn[b] = level
	}
}

func (r *timelineRecorder) gain(i int, g float64) {
	if b := r.bucket(i); g < r.minGain[b] {
		r.minGain[b] = g
	}
}

func (r *timelineRecorder) timeline() DynamicsTimeline {
	t := DynamicsTimeline{
		InputDB:         make([]float64, len(r.maxIn)),
		GainReductionDB: make([]float64, len(r.minGain)),
	}
	for i := range r.maxIn {
		t.InputDB[i] = math.Max(-120, linearToDb(r.maxIn[i]))
		t.GainReductionDB[i] = -linearToDb(r.minGain[i])
	}
	return t
}

// BaseProcessor provides common fields for all processors.
type BaseProcessor struct {
	ProcessorName string
	IsEnabled     bool
}

func (b *BaseProcessor) Name() string      { return b.ProcessorName }
func (b *BaseProcessor) Enabled() bool     { return b.IsEnabled }
func (b *BaseProcessor) SetEnabled(e bool) { b.IsEnabled = e }
