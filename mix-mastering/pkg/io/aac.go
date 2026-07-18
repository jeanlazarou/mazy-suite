package io

import (
	"fmt"

	"github.com/audiomaster/mastering/pkg/dsp"
)

func init() {
	RegisterReader(FormatAAC, readAAC)
}

func readAAC(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	// AAC decoding is complex; defer to external tools
	return nil, nil, fmt.Errorf("AAC reading requires ffmpeg; convert to WAV first")
}
