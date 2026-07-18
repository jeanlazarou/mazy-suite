package io

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"

	"github.com/audiomaster/mastering/pkg/dsp"
)

func init() {
	RegisterReader(FormatWAV, readWAV)
	RegisterWriter(FormatWAV, writeWAV)
}

// readWAV reads a WAV file and returns an AudioBuffer.
func readWAV(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open WAV: %w", err)
	}
	defer f.Close()

	// Parse RIFF header
	var riffID [4]byte
	var fileSize uint32
	var waveID [4]byte
	if err := binary.Read(f, binary.LittleEndian, &riffID); err != nil {
		return nil, nil, fmt.Errorf("read RIFF ID: %w", err)
	}
	if string(riffID[:]) != "RIFF" {
		return nil, nil, fmt.Errorf("not a WAV file: missing RIFF header")
	}
	binary.Read(f, binary.LittleEndian, &fileSize)
	binary.Read(f, binary.LittleEndian, &waveID)
	if string(waveID[:]) != "WAVE" {
		return nil, nil, fmt.Errorf("not a WAV file: missing WAVE identifier")
	}

	var (
		audioFormat   uint16
		numChannels   uint16
		sampleRate    uint32
		bitsPerSample uint16
		dataSize      uint32
		dataFound     bool
		fmtFound      bool
	)

	// Parse chunks
	for {
		var chunkID [4]byte
		var chunkSize uint32
		if err := binary.Read(f, binary.LittleEndian, &chunkID); err != nil {
			if err == io.EOF {
				break
			}
			return nil, nil, fmt.Errorf("read chunk ID: %w", err)
		}
		if err := binary.Read(f, binary.LittleEndian, &chunkSize); err != nil {
			return nil, nil, fmt.Errorf("read chunk size: %w", err)
		}

		switch string(chunkID[:]) {
		case "fmt ":
			binary.Read(f, binary.LittleEndian, &audioFormat)
			binary.Read(f, binary.LittleEndian, &numChannels)
			binary.Read(f, binary.LittleEndian, &sampleRate)
			var byteRate uint32
			var blockAlign uint16
			binary.Read(f, binary.LittleEndian, &byteRate)
			binary.Read(f, binary.LittleEndian, &blockAlign)
			binary.Read(f, binary.LittleEndian, &bitsPerSample)
			// Skip any extra fmt bytes
			remaining := int64(chunkSize) - 16
			if remaining > 0 {
				f.Seek(remaining, io.SeekCurrent)
			}
			fmtFound = true

		case "data":
			dataSize = chunkSize
			dataFound = true
			goto readData

		default:
			// Skip unknown chunks
			padded := int64(chunkSize)
			if padded%2 != 0 {
				padded++
			}
			f.Seek(padded, io.SeekCurrent)
		}
	}

readData:
	if !fmtFound {
		return nil, nil, fmt.Errorf("WAV file missing fmt chunk")
	}
	if !dataFound {
		return nil, nil, fmt.Errorf("WAV file missing data chunk")
	}
	if audioFormat != 1 && audioFormat != 3 {
		return nil, nil, fmt.Errorf("unsupported WAV format: %d (only PCM=1 and float=3 supported)", audioFormat)
	}

	bytesPerSample := int(bitsPerSample) / 8
	totalSamples := int(dataSize) / bytesPerSample
	samplesPerChannel := totalSamples / int(numChannels)

	buf := dsp.NewAudioBuffer(int(numChannels), samplesPerChannel, int(sampleRate))
	rawData := make([]byte, dataSize)
	if _, err := io.ReadFull(f, rawData); err != nil {
		return nil, nil, fmt.Errorf("read WAV data: %w", err)
	}

	offset := 0
	for i := 0; i < samplesPerChannel; i++ {
		for ch := 0; ch < int(numChannels); ch++ {
			var sample float64
			switch {
			case audioFormat == 3 && bitsPerSample == 32:
				bits := binary.LittleEndian.Uint32(rawData[offset : offset+4])
				sample = float64(math.Float32frombits(bits))
			case audioFormat == 3 && bitsPerSample == 64:
				bits := binary.LittleEndian.Uint64(rawData[offset : offset+8])
				sample = math.Float64frombits(bits)
			case audioFormat == 1 && bitsPerSample == 16:
				val := int16(binary.LittleEndian.Uint16(rawData[offset : offset+2]))
				sample = float64(val) / 32768.0
			case audioFormat == 1 && bitsPerSample == 24:
				b := rawData[offset : offset+3]
				val := int32(b[0]) | int32(b[1])<<8 | int32(b[2])<<16
				if val&0x800000 != 0 {
					val |= ^0xFFFFFF // sign extend
				}
				sample = float64(val) / 8388608.0
			case audioFormat == 1 && bitsPerSample == 32:
				val := int32(binary.LittleEndian.Uint32(rawData[offset : offset+4]))
				sample = float64(val) / 2147483648.0
			case audioFormat == 1 && bitsPerSample == 8:
				sample = (float64(rawData[offset]) - 128.0) / 128.0
			default:
				return nil, nil, fmt.Errorf("unsupported WAV bit depth: %d", bitsPerSample)
			}
			buf.Samples[ch][i] = sample
			offset += bytesPerSample
		}
	}

	meta := &AudioMetadata{
		Format:     FormatWAV,
		SampleRate: int(sampleRate),
		BitDepth:   int(bitsPerSample),
		Channels:   int(numChannels),
		Duration:   float64(samplesPerChannel) / float64(sampleRate),
		Samples:    samplesPerChannel,
	}

	return buf, meta, nil
}

// writeWAV writes an AudioBuffer to a WAV file.
func writeWAV(path string, buf *dsp.AudioBuffer, bitDepth int) error {
	if bitDepth == 0 {
		bitDepth = 24
	}

	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create WAV: %w", err)
	}
	defer f.Close()

	channels := buf.Channels()
	sampleRate := buf.SampleRate
	samplesPerChannel := buf.Length()
	bytesPerSample := bitDepth / 8
	dataSize := samplesPerChannel * channels * bytesPerSample

	audioFormat := uint16(1) // PCM

	// RIFF header
	f.Write([]byte("RIFF"))
	binary.Write(f, binary.LittleEndian, uint32(36+dataSize))
	f.Write([]byte("WAVE"))

	// fmt chunk
	f.Write([]byte("fmt "))
	binary.Write(f, binary.LittleEndian, uint32(16))
	binary.Write(f, binary.LittleEndian, audioFormat)
	binary.Write(f, binary.LittleEndian, uint16(channels))
	binary.Write(f, binary.LittleEndian, uint32(sampleRate))
	binary.Write(f, binary.LittleEndian, uint32(sampleRate*channels*bytesPerSample))
	binary.Write(f, binary.LittleEndian, uint16(channels*bytesPerSample))
	binary.Write(f, binary.LittleEndian, uint16(bitDepth))

	// data chunk
	f.Write([]byte("data"))
	binary.Write(f, binary.LittleEndian, uint32(dataSize))

	// Write interleaved samples
	rawData := make([]byte, dataSize)
	offset := 0
	for i := 0; i < samplesPerChannel; i++ {
		for ch := 0; ch < channels; ch++ {
			sample := buf.Samples[ch][i]
			// Clamp to [-1, 1]
			if sample > 1.0 {
				sample = 1.0
			} else if sample < -1.0 {
				sample = -1.0
			}

			switch bitDepth {
			case 16:
				// TPDF dither at 1 LSB decorrelates quantization error.
				scaled := sample*32767 + (rand.Float64() - rand.Float64())
				val := int16(math.Max(-32768, math.Min(32767, math.Round(scaled))))
				binary.LittleEndian.PutUint16(rawData[offset:offset+2], uint16(val))
			case 24:
				val := int32(sample * 8388607)
				rawData[offset] = byte(val)
				rawData[offset+1] = byte(val >> 8)
				rawData[offset+2] = byte(val >> 16)
			case 32:
				val := int32(sample * 2147483647)
				binary.LittleEndian.PutUint32(rawData[offset:offset+4], uint32(val))
			}
			offset += bytesPerSample
		}
	}

	if _, err := f.Write(rawData); err != nil {
		return fmt.Errorf("write WAV data: %w", err)
	}

	return nil
}
