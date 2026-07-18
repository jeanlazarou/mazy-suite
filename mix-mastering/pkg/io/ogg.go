package io

import (
	"fmt"
	"os"

	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/jfreymuth/oggvorbis"
)

func init() {
	RegisterReader(FormatOGG, readOGG)
}

func readOGG(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open OGG: %w", err)
	}
	defer f.Close()

	reader, err := oggvorbis.NewReader(f)
	if err != nil {
		return nil, nil, fmt.Errorf("decode OGG: %w", err)
	}

	channels := reader.Channels()
	sampleRate := reader.SampleRate()

	// Read all samples
	var allSamples []float32
	tmpBuf := make([]float32, 8192)
	for {
		n, err := reader.Read(tmpBuf)
		if n > 0 {
			allSamples = append(allSamples, tmpBuf[:n]...)
		}
		if err != nil {
			break
		}
	}

	samplesPerChannel := len(allSamples) / channels
	buf := dsp.NewAudioBuffer(channels, samplesPerChannel, int(sampleRate))

	// Deinterleave
	for i := 0; i < samplesPerChannel; i++ {
		for ch := 0; ch < channels; ch++ {
			idx := i*channels + ch
			if idx < len(allSamples) {
				buf.Samples[ch][i] = float64(allSamples[idx])
			}
		}
	}

	meta := &AudioMetadata{
		Format:     FormatOGG,
		SampleRate: int(sampleRate),
		BitDepth:   32, // OGG Vorbis is float internally
		Channels:   channels,
		Duration:   float64(samplesPerChannel) / float64(sampleRate),
		Samples:    samplesPerChannel,
	}

	return buf, meta, nil
}
