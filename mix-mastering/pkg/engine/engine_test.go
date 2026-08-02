package engine

import (
	"math"
	"os"
	"testing"

	"github.com/audiomaster/mastering/pkg/dsp"
	audioio "github.com/audiomaster/mastering/pkg/io"
)

func generateSine(freq, sampleRate float64, channels, length int) *dsp.AudioBuffer {
	buf := dsp.NewAudioBuffer(channels, length, int(sampleRate))
	for ch := 0; ch < channels; ch++ {
		for i := 0; i < length; i++ {
			buf.Samples[ch][i] = 0.5 * math.Sin(2*math.Pi*freq*float64(i)/sampleRate)
		}
	}
	return buf
}

func TestEngineProcess(t *testing.T) {
	eng := NewWithDefaults(44100, 2)
	buf := generateSine(1000, 44100, 2, 44100)

	if err := eng.Process(buf); err != nil {
		t.Fatalf("engine process: %v", err)
	}

	// Output should not be all zeros
	var sum float64
	for _, s := range buf.Samples[0] {
		sum += math.Abs(s)
	}
	if sum == 0 {
		t.Error("output is all zeros")
	}
}

func TestEngineProcessFile(t *testing.T) {
	// Create a test WAV
	buf := generateSine(440, 44100, 2, 44100)
	inputPath := "/tmp/test_engine_input.wav"
	outputPath := "/tmp/test_engine_output.wav"
	defer os.Remove(inputPath)
	defer os.Remove(outputPath)

	if err := audioio.WriteAudio(inputPath, buf, 16); err != nil {
		t.Fatalf("write test input: %v", err)
	}

	eng := NewWithDefaults(44100, 2)
	if err := eng.ProcessFile(inputPath, outputPath, 16); err != nil {
		t.Fatalf("process file: %v", err)
	}

	// Verify output exists and is readable
	outBuf, meta, err := audioio.ReadAudio(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if meta.Channels != 2 || meta.SampleRate != 44100 {
		t.Errorf("unexpected output metadata: %+v", meta)
	}
	if outBuf.Length() != 44100 {
		t.Errorf("unexpected output length: %d", outBuf.Length())
	}
}

func TestEngineProcessorManagement(t *testing.T) {
	eng := New(44100, 2)

	eq := dsp.NewParametricEQ(44100, 2)
	eng.AddProcessor(eq)

	if len(eng.Processors()) != 1 {
		t.Errorf("expected 1 processor, got %d", len(eng.Processors()))
	}

	p, idx, err := eng.GetProcessorByName("Parametric EQ")
	if err != nil {
		t.Fatal(err)
	}
	if idx != 0 || p.Name() != "Parametric EQ" {
		t.Error("processor lookup failed")
	}

	comp := dsp.NewCompressor(44100)
	eng.InsertProcessor(0, comp)

	if eng.Processors()[0].Name() != "Compressor" {
		t.Error("insert at index 0 failed")
	}

	eng.RemoveProcessor(0)
	if eng.Processors()[0].Name() != "Parametric EQ" {
		t.Error("remove at index 0 failed")
	}
}

func TestEngineSetParam(t *testing.T) {
	eng := NewWithDefaults(44100, 2)

	if err := eng.SetParam("Compressor", "threshold", -24); err != nil {
		t.Fatal(err)
	}

	p, _, _ := eng.GetProcessorByName("Compressor")
	val, _ := p.GetParam("threshold")
	if val != -24 {
		t.Errorf("expected -24, got %f", val)
	}

	// Unknown processor
	if err := eng.SetParam("Unknown", "x", 0); err == nil {
		t.Error("expected error for unknown processor")
	}
}

func TestEngineDisabledProcessor(t *testing.T) {
	eng := NewWithDefaults(44100, 2)
	buf := generateSine(1000, 44100, 2, 44100)

	// Save original
	original := make([]float64, len(buf.Samples[0]))
	copy(original, buf.Samples[0])

	// Disable all processors
	for _, p := range eng.Processors() {
		p.SetEnabled(false)
	}

	eng.Process(buf)

	// Output should be identical to input
	for i := 0; i < 100; i++ {
		if buf.Samples[0][i] != original[i] {
			t.Errorf("disabled processors still modified signal at sample %d", i)
			break
		}
	}
}

func TestEngineProcessWithTaps(t *testing.T) {
	eng := NewWithDefaults(44100, 2)
	comp, _, err := eng.GetProcessorByName("Compressor")
	if err != nil {
		t.Fatalf("get compressor: %v", err)
	}
	comp.SetEnabled(false)

	buf := generateSine(1000, 44100, 2, 4410)
	var stages []string
	if err := eng.ProcessWithTaps(buf, func(stage string, b *dsp.AudioBuffer) {
		if b != buf {
			t.Errorf("tap %q received a different buffer", stage)
		}
		stages = append(stages, stage)
	}); err != nil {
		t.Fatalf("process with taps: %v", err)
	}

	want := []string{"Input", "Parametric EQ", "Limiter"}
	if len(stages) != len(want) {
		t.Fatalf("stages = %v, want %v", stages, want)
	}
	for i := range want {
		if stages[i] != want[i] {
			t.Errorf("stage[%d] = %q, want %q", i, stages[i], want[i])
		}
	}
}

// TestFullChainOrder locks in the chain order as a real assertion, not
// just a doc comment: the limiter must stay last, and the exciters sit
// where they were designed to (bass before widening so synthesized lows
// stay centered, treble after compression to restore what gain
// reduction dulls).
func TestFullChainOrder(t *testing.T) {
	eng := NewFullChain(44100, 2)

	want := []string{
		"Parametric EQ", "Bass Exciter", "Stereo Widener", "Compressor",
		"Treble Exciter", "Loudness Normalizer", "Gain", "Limiter",
	}
	got := make([]string, len(eng.Processors()))
	for i, p := range eng.Processors() {
		got[i] = p.Name()
	}
	if len(got) != len(want) {
		t.Fatalf("chain = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("chain[%d] = %q, want %q (full chain: %v)", i, got[i], want[i], got)
		}
	}
}

// TestFullChainDefaultTransparent verifies the chain-level analogue of
// TestDefaultEQTransparent (pkg/dsp/conformance_test.go): a freshly
// constructed NewFullChain, with the normalizer and both exciters
// disabled by default, must not audibly alter the signal. The signal is
// kept quiet (well under the compressor's -18dB threshold and the
// limiter's ceiling) so this test isolates the exciter/normalizer
// defaults rather than exercising dynamics processing, which is
// expected to engage at normal mastering levels.
func TestFullChainDefaultTransparent(t *testing.T) {
	eng := NewFullChain(44100, 2)
	buf := generateSine(50, 44100, 2, 44100)
	for ch := range buf.Samples {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.02 // quiet: ~-34dBFS peak
		}
	}

	var rmsBefore float64
	for _, s := range buf.Samples[0] {
		rmsBefore += s * s
	}
	rmsBefore = math.Sqrt(rmsBefore / float64(len(buf.Samples[0])))

	if err := eng.Process(buf); err != nil {
		t.Fatalf("engine process: %v", err)
	}

	var rmsAfter float64
	for _, s := range buf.Samples[0] {
		rmsAfter += s * s
	}
	rmsAfter = math.Sqrt(rmsAfter / float64(len(buf.Samples[0])))

	deltaDB := 20 * math.Log10(rmsAfter/rmsBefore)
	if math.Abs(deltaDB) > 0.2 {
		t.Errorf("default full chain should be transparent, got %.3fdB RMS change", deltaDB)
	}
}
