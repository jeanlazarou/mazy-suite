package dsp

import (
	"math"
	"testing"
)

func TestGainProcessor(t *testing.T) {
	buf := generateSine(1000, 44100, 2, 4410)
	for ch := 0; ch < 2; ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= 0.25
		}
	}
	rmsBefore := rms(buf.Samples[0])

	g := NewGain()
	g.SetParam("gain_db", 6)
	if err := g.Process(buf); err != nil {
		t.Fatal(err)
	}

	gainDB := 20 * math.Log10(rms(buf.Samples[0])/rmsBefore)
	if math.Abs(gainDB-6) > 0.01 {
		t.Errorf("expected +6dB, got %+.2fdB", gainDB)
	}
}

// TestAlbumGatedLoudness verifies measuring several tracks as one program:
// concatenated gating blocks integrate like BS.1770 over the whole album,
// and one shared offset preserves the level difference between tracks.
func TestAlbumGatedLoudness(t *testing.T) {
	sr := 44100.0
	makeTone := func(amp float64) *AudioBuffer {
		buf := generateSine(1000, sr, 2, 44100*2)
		for ch := 0; ch < 2; ch++ {
			for i := range buf.Samples[ch] {
				buf.Samples[ch][i] *= amp
			}
		}
		return buf
	}

	loud := makeTone(0.5)
	quiet := makeTone(0.25) // 6 dB below

	meter := NewLUFSMeter(sr, 2)
	loudLUFS := meter.MeasureIntegrated(loud)
	quietLUFS := meter.MeasureIntegrated(quiet)

	blocks := append(meter.MeasureMomentary(loud), meter.MeasureMomentary(quiet)...)
	albumLUFS := GatedLoudness(blocks)

	// Album loudness must sit between the tracks' own loudness values.
	if albumLUFS < quietLUFS || albumLUFS > loudLUFS {
		t.Errorf("album loudness %.2f outside track range [%.2f, %.2f]", albumLUFS, quietLUFS, loudLUFS)
	}

	// A single shared offset preserves the inter-track difference.
	offset := -14 - albumLUFS
	g := NewGain()
	g.SetParam("gain_db", offset)
	g.Process(loud)
	g.Process(quiet)

	newDiff := meter.MeasureIntegrated(loud) - meter.MeasureIntegrated(quiet)
	if math.Abs(newDiff-(loudLUFS-quietLUFS)) > 0.1 {
		t.Errorf("shared offset changed relative levels: was %.2f dB, now %.2f dB", loudLUFS-quietLUFS, newDiff)
	}

	// Sanity: integrating a single track's own blocks matches MeasureIntegrated.
	single := GatedLoudness(meter.MeasureMomentary(makeTone(0.5)))
	if math.Abs(single-loudLUFS) > 0.2 {
		t.Errorf("block-based integration diverges: %.2f vs %.2f", single, loudLUFS)
	}
}
