package io

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"

	"github.com/audiomaster/mastering/pkg/dsp"
)

func init() {
	RegisterReader(FormatAIFF, readAIFF)
}

func readAIFF(path string) (*dsp.AudioBuffer, *AudioMetadata, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open AIFF: %w", err)
	}
	defer f.Close()

	// Parse FORM header
	var formID [4]byte
	var fileSize uint32
	var aiffID [4]byte
	binary.Read(f, binary.BigEndian, &formID)
	binary.Read(f, binary.BigEndian, &fileSize)
	binary.Read(f, binary.BigEndian, &aiffID)

	if string(formID[:]) != "FORM" {
		return nil, nil, fmt.Errorf("not an AIFF file: missing FORM header")
	}
	aiffType := string(aiffID[:])
	if aiffType != "AIFF" && aiffType != "AIFC" {
		return nil, nil, fmt.Errorf("not an AIFF file: missing AIFF/AIFC identifier")
	}

	var (
		numChannels     int16
		numSampleFrames uint32
		bitsPerSample   int16
		sampleRate      float64
		dataFound       bool
		commFound       bool
		dataBytes       []byte
	)

	for {
		var chunkID [4]byte
		var chunkSize uint32
		if err := binary.Read(f, binary.BigEndian, &chunkID); err != nil {
			break
		}
		if err := binary.Read(f, binary.BigEndian, &chunkSize); err != nil {
			break
		}

		switch string(chunkID[:]) {
		case "COMM":
			binary.Read(f, binary.BigEndian, &numChannels)
			binary.Read(f, binary.BigEndian, &numSampleFrames)
			binary.Read(f, binary.BigEndian, &bitsPerSample)
			// Sample rate is 80-bit extended float
			var srBytes [10]byte
			f.Read(srBytes[:])
			sampleRate = extendedToFloat64(srBytes)
			// Skip rest of COMM chunk
			remaining := int64(chunkSize) - 18
			if remaining > 0 {
				f.Seek(remaining, io.SeekCurrent)
			}
			commFound = true

		case "SSND":
			var offset uint32
			var blockSize uint32
			binary.Read(f, binary.BigEndian, &offset)
			binary.Read(f, binary.BigEndian, &blockSize)
			if offset > 0 {
				f.Seek(int64(offset), io.SeekCurrent)
			}
			dataLen := chunkSize - 8 - offset
			dataBytes = make([]byte, dataLen)
			io.ReadFull(f, dataBytes)
			dataFound = true

		default:
			padded := int64(chunkSize)
			if padded%2 != 0 {
				padded++
			}
			f.Seek(padded, io.SeekCurrent)
		}
	}

	if !commFound {
		return nil, nil, fmt.Errorf("AIFF missing COMM chunk")
	}
	if !dataFound {
		return nil, nil, fmt.Errorf("AIFF missing SSND chunk")
	}

	channels := int(numChannels)
	samples := int(numSampleFrames)
	bitDepth := int(bitsPerSample)
	bytesPerSample := bitDepth / 8

	buf := dsp.NewAudioBuffer(channels, samples, int(sampleRate))

	offset := 0
	for i := 0; i < samples; i++ {
		for ch := 0; ch < channels; ch++ {
			if offset+bytesPerSample > len(dataBytes) {
				break
			}
			var sample float64
			switch bitDepth {
			case 16:
				val := int16(binary.BigEndian.Uint16(dataBytes[offset : offset+2]))
				sample = float64(val) / 32768.0
			case 24:
				b := dataBytes[offset : offset+3]
				val := int32(b[0])<<16 | int32(b[1])<<8 | int32(b[2])
				if val&0x800000 != 0 {
					val |= ^0xFFFFFF
				}
				sample = float64(val) / 8388608.0
			case 32:
				val := int32(binary.BigEndian.Uint32(dataBytes[offset : offset+4]))
				sample = float64(val) / 2147483648.0
			}
			buf.Samples[ch][i] = sample
			offset += bytesPerSample
		}
	}

	meta := &AudioMetadata{
		Format:     FormatAIFF,
		SampleRate: int(sampleRate),
		BitDepth:   bitDepth,
		Channels:   channels,
		Duration:   float64(samples) / sampleRate,
		Samples:    samples,
	}

	return buf, meta, nil
}

// extendedToFloat64 converts an 80-bit IEEE 754 extended precision float to float64.
func extendedToFloat64(b [10]byte) float64 {
	sign := int(b[0]) >> 7
	exponent := int(b[0]&0x7F)<<8 | int(b[1])
	var mantissa uint64
	for i := 2; i < 10; i++ {
		mantissa = mantissa<<8 | uint64(b[i])
	}

	if exponent == 0 && mantissa == 0 {
		return 0
	}

	f := float64(mantissa) / (1 << 63)
	f *= math.Pow(2, float64(exponent-16383))

	if sign == 1 {
		f = -f
	}
	return f
}
