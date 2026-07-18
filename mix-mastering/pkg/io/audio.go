package io

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/audiomaster/mastering/pkg/dsp"
)

// AudioFormat represents a supported audio format.
type AudioFormat int

const (
	FormatWAV AudioFormat = iota
	FormatFLAC
	FormatMP3
	FormatOGG
	FormatAIFF
	FormatAAC
)

// AudioMetadata contains information about an audio file.
type AudioMetadata struct {
	Format     AudioFormat
	SampleRate int
	BitDepth   int
	Channels   int
	Duration   float64 // seconds
	Samples    int
}

// AudioReader reads audio files into AudioBuffers.
type AudioReader interface {
	Read(path string) (*dsp.AudioBuffer, *AudioMetadata, error)
}

// AudioWriter writes AudioBuffers to audio files.
type AudioWriter interface {
	Write(path string, buf *dsp.AudioBuffer, bitDepth int) error
}

// FormatFromPath determines the audio format from a file extension.
func FormatFromPath(path string) (AudioFormat, error) {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".wav":
		return FormatWAV, nil
	case ".flac":
		return FormatFLAC, nil
	case ".mp3":
		return FormatMP3, nil
	case ".ogg":
		return FormatOGG, nil
	case ".aiff", ".aif":
		return FormatAIFF, nil
	case ".aac", ".m4a":
		return FormatAAC, nil
	default:
		return 0, fmt.Errorf("unsupported format: %s", ext)
	}
}

// Format reader/writer registries
var (
	readers = map[AudioFormat]func(string) (*dsp.AudioBuffer, *AudioMetadata, error){}
	writers = map[AudioFormat]func(string, *dsp.AudioBuffer, int) error{}
)

// RegisterReader registers a format reader.
func RegisterReader(format AudioFormat, fn func(string) (*dsp.AudioBuffer, *AudioMetadata, error)) {
	readers[format] = fn
}

// RegisterWriter registers a format writer.
func RegisterWriter(format AudioFormat, fn func(string, *dsp.AudioBuffer, int) error) {
	writers[format] = fn
}

// ReadAudio reads any supported audio file and returns an AudioBuffer.
func ReadAudio(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	format, err := FormatFromPath(path)
	if err != nil {
		return nil, nil, err
	}

	reader, ok := readers[format]
	if !ok {
		return nil, nil, fmt.Errorf("no reader registered for format: %s", filepath.Ext(path))
	}
	return reader(path)
}

// WriteAudio writes an AudioBuffer to the specified format.
func WriteAudio(path string, buf *dsp.AudioBuffer, bitDepth int) error {
	format, err := FormatFromPath(path)
	if err != nil {
		return err
	}

	writer, ok := writers[format]
	if !ok {
		return fmt.Errorf("no writer registered for format: %s (supported: wav, flac)", filepath.Ext(path))
	}
	return writer(path, buf, bitDepth)
}

// fileExists returns true if the given path exists.
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
