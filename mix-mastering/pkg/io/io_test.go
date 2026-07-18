package io

import (
	"math"
	"os"
	"testing"

	"github.com/audiomaster/mastering/pkg/dsp"
)

func TestWAVRoundTrip(t *testing.T) {
	// Create a test buffer with a 1kHz sine
	sr := 44100
	length := 44100
	buf := dsp.NewAudioBuffer(2, length, sr)
	for ch := 0; ch < 2; ch++ {
		for i := 0; i < length; i++ {
			buf.Samples[ch][i] = 0.5 * math.Sin(2*math.Pi*1000*float64(i)/float64(sr))
		}
	}

	// Write WAV
	tmpFile := "/tmp/test_roundtrip.wav"
	defer os.Remove(tmpFile)

	for _, bitDepth := range []int{16, 24, 32} {
		t.Run("bitDepth", func(t *testing.T) {
			err := WriteAudio(tmpFile, buf, bitDepth)
			if err != nil {
				t.Fatalf("write WAV %d-bit: %v", bitDepth, err)
			}

			// Read back
			readBuf, meta, err := ReadAudio(tmpFile)
			if err != nil {
				t.Fatalf("read WAV %d-bit: %v", bitDepth, err)
			}

			if meta.SampleRate != sr {
				t.Errorf("sample rate: expected %d, got %d", sr, meta.SampleRate)
			}
			if meta.Channels != 2 {
				t.Errorf("channels: expected 2, got %d", meta.Channels)
			}
			if meta.BitDepth != bitDepth {
				t.Errorf("bit depth: expected %d, got %d", bitDepth, meta.BitDepth)
			}
			if readBuf.Length() != length {
				t.Errorf("length: expected %d, got %d", length, readBuf.Length())
			}

			// Check samples are close (quantization error depends on bit depth)
			maxErr := map[int]float64{16: 0.001, 24: 0.0001, 32: 0.00001}[bitDepth]
			for i := 100; i < 200; i++ {
				diff := math.Abs(buf.Samples[0][i] - readBuf.Samples[0][i])
				if diff > maxErr {
					t.Errorf("sample %d: diff %.6f exceeds max %.6f for %d-bit", i, diff, maxErr, bitDepth)
					break
				}
			}
		})
	}
}

func TestFormatFromPath(t *testing.T) {
	tests := []struct {
		path   string
		format AudioFormat
		err    bool
	}{
		{"test.wav", FormatWAV, false},
		{"test.flac", FormatFLAC, false},
		{"test.mp3", FormatMP3, false},
		{"test.ogg", FormatOGG, false},
		{"test.aiff", FormatAIFF, false},
		{"test.aac", FormatAAC, false},
		{"test.txt", 0, true},
	}

	for _, tt := range tests {
		f, err := FormatFromPath(tt.path)
		if tt.err && err == nil {
			t.Errorf("%s: expected error", tt.path)
		}
		if !tt.err && err != nil {
			t.Errorf("%s: unexpected error: %v", tt.path, err)
		}
		if !tt.err && f != tt.format {
			t.Errorf("%s: expected format %d, got %d", tt.path, tt.format, f)
		}
	}
}
