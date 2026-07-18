package io

import (
	"math"
	"os"
	"testing"

	"github.com/audiomaster/mastering/pkg/dsp"
)

// TestGenerateTestWAV creates a test WAV file for CLI integration testing.
func TestGenerateTestWAV(t *testing.T) {
	if os.Getenv("GENERATE_TEST_WAV") == "" {
		t.Skip("set GENERATE_TEST_WAV=1 to generate")
	}

	sr := 44100
	duration := 3 // seconds
	length := sr * duration
	buf := dsp.NewAudioBuffer(2, length, sr)

	for i := 0; i < length; i++ {
		t := float64(i) / float64(sr)
		// Mix of frequencies
		l := 0.3*math.Sin(2*math.Pi*440*t) + 0.2*math.Sin(2*math.Pi*880*t) + 0.1*math.Sin(2*math.Pi*3000*t)
		r := 0.3*math.Sin(2*math.Pi*440*t+0.3) + 0.2*math.Sin(2*math.Pi*880*t+0.3) + 0.1*math.Sin(2*math.Pi*3000*t+0.3)
		buf.Samples[0][i] = l
		buf.Samples[1][i] = r
	}

	WriteAudio("/tmp/test_mastering.wav", buf, 24)
}
