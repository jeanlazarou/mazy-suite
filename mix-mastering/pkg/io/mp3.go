package io

import (
	"fmt"
	"io"
	"os"

	"github.com/audiomaster/mastering/pkg/dsp"
	mp3 "github.com/hajimehoshi/go-mp3"
)

func init() {
	// Reading only: there is no pure-Go MP3 encoder available, so no writer
	// is registered and WriteAudio reports the format as unsupported.
	RegisterReader(FormatMP3, readMP3)
}

func readMP3(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open MP3: %w", err)
	}
	defer f.Close()

	decoder, err := mp3.NewDecoder(f)
	if err != nil {
		return nil, nil, fmt.Errorf("decode MP3: %w", err)
	}

	sampleRate := decoder.SampleRate()
	// go-mp3 always decodes to stereo 16-bit PCM
	channels := 2
	bytesPerSample := 4 // 2 bytes * 2 channels

	// Read all decoded data
	totalLen := decoder.Length()
	rawData := make([]byte, totalLen)
	n, err := readFull(decoder, rawData)
	if err != nil {
		return nil, nil, fmt.Errorf("read MP3 data: %w", err)
	}
	rawData = rawData[:n]

	samplesPerChannel := n / bytesPerSample
	buf := dsp.NewAudioBuffer(channels, samplesPerChannel, sampleRate)

	for i := 0; i < samplesPerChannel; i++ {
		offset := i * 4
		if offset+3 >= len(rawData) {
			break
		}
		// Little-endian 16-bit signed
		left := int16(rawData[offset]) | int16(rawData[offset+1])<<8
		right := int16(rawData[offset+2]) | int16(rawData[offset+3])<<8
		buf.Samples[0][i] = float64(left) / 32768.0
		buf.Samples[1][i] = float64(right) / 32768.0
	}

	meta := &AudioMetadata{
		Format:     FormatMP3,
		SampleRate: sampleRate,
		BitDepth:   16,
		Channels:   channels,
		Duration:   float64(samplesPerChannel) / float64(sampleRate),
		Samples:    samplesPerChannel,
	}

	return buf, meta, nil
}

func readFull(r interface{ Read([]byte) (int, error) }, buf []byte) (int, error) {
	total := 0
	for total < len(buf) {
		n, err := r.Read(buf[total:])
		total += n
		if err == io.EOF {
			return total, nil
		}
		if err != nil {
			return total, err
		}
	}
	return total, nil
}
