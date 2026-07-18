package io

import (
	"fmt"
	"os"
	"os/exec"

	"github.com/audiomaster/mastering/pkg/dsp"
	"github.com/mewkiz/flac"
)

func init() {
	RegisterReader(FormatFLAC, readFLAC)
	RegisterWriter(FormatFLAC, writeFLAC)
}

func readFLAC(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	stream, err := flac.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open FLAC: %w", err)
	}
	defer stream.Close()

	info := stream.Info
	channels := int(info.NChannels)
	sampleRate := int(info.SampleRate)
	bitDepth := int(info.BitsPerSample)
	totalSamples := int(info.NSamples)

	buf := dsp.NewAudioBuffer(channels, totalSamples, sampleRate)
	maxVal := float64(int64(1) << (bitDepth - 1))
	pos := 0

	for {
		frame, err := stream.ParseNext()
		if err != nil {
			break
		}
		for i := 0; i < int(frame.Subframes[0].NSamples); i++ {
			if pos >= totalSamples {
				break
			}
			for ch := 0; ch < channels; ch++ {
				buf.Samples[ch][pos] = float64(frame.Subframes[ch].Samples[i]) / maxVal
			}
			pos++
		}
	}

	meta := &AudioMetadata{
		Format:     FormatFLAC,
		SampleRate: sampleRate,
		BitDepth:   bitDepth,
		Channels:   channels,
		Duration:   float64(totalSamples) / float64(sampleRate),
		Samples:    totalSamples,
	}

	return buf, meta, nil
}

func writeFLAC(path string, buf *dsp.AudioBuffer, bitDepth int) error {
	if bitDepth == 0 {
		bitDepth = 24
	}

	// Write as WAV first, then convert with flac CLI
	tmpWav := path + ".tmp.wav"
	defer os.Remove(tmpWav)

	if err := writeWAV(tmpWav, buf, bitDepth); err != nil {
		return fmt.Errorf("write temp WAV: %w", err)
	}

	if _, err := exec.LookPath("flac"); err == nil {
		cmd := exec.Command("flac", "-f", "-o", path, tmpWav)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("flac encode: %s: %w", string(out), err)
		}
		return nil
	}

	return fmt.Errorf("FLAC encoding requires 'flac' command-line tool")
}
