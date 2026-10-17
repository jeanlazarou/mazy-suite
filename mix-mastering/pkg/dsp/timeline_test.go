package dsp

import "testing"

// A quiet first half and a loud second half: the timelines must show the
// processor working only in the second half.
func quietThenLoud(sampleRate float64, length int) *AudioBuffer {
	buf := generateSine(440, sampleRate, 2, length)
	for ch := range buf.Samples {
		for i := range buf.Samples[ch] {
			if i < length/2 {
				buf.Samples[ch][i] *= 0.05 // about -26 dBFS
			}
		}
	}
	return buf
}

func checkTimeline(t *testing.T, tl DynamicsTimeline, wantBuckets int) {
	t.Helper()
	if len(tl.InputDB) != wantBuckets || len(tl.GainReductionDB) != wantBuckets {
		t.Fatalf("buckets: in %d, gr %d, want %d", len(tl.InputDB), len(tl.GainReductionDB), wantBuckets)
	}
	n := wantBuckets
	// Skip the start (the detector's attack rising from silence) and the
	// slices around the step, where attack/release are moving.
	for i := 5; i < n/2-5; i++ {
		if tl.GainReductionDB[i] > 0.01 {
			t.Errorf("slice %d (quiet): gain reduction %.2f dB, want 0", i, tl.GainReductionDB[i])
			break
		}
		if tl.InputDB[i] > -20 || tl.InputDB[i] < -32 {
			t.Errorf("slice %d (quiet): input %.1f dB, want about -26", i, tl.InputDB[i])
			break
		}
	}
	for i := n/2 + 20; i < n; i++ {
		if tl.GainReductionDB[i] < 1 {
			t.Errorf("slice %d (loud): gain reduction %.2f dB, want > 1", i, tl.GainReductionDB[i])
			break
		}
		if tl.InputDB[i] < -3 {
			t.Errorf("slice %d (loud): input %.1f dB, want near 0", i, tl.InputDB[i])
			break
		}
	}
}

func TestCompressorTimeline(t *testing.T) {
	c := NewCompressor(44100)
	c.Threshold = -12
	buf := quietThenLoud(44100, 44100*4)
	if err := c.Process(buf); err != nil {
		t.Fatal(err)
	}
	checkTimeline(t, c.Timeline(), TimelineBuckets)
}

func TestLimiterTimeline(t *testing.T) {
	l := NewLimiter(44100)
	l.Ceiling = -6
	buf := quietThenLoud(44100, 44100*4)
	if err := l.Process(buf); err != nil {
		t.Fatal(err)
	}
	checkTimeline(t, l.Timeline(), TimelineBuckets)
}

func TestTimelineShortBuffer(t *testing.T) {
	c := NewCompressor(44100)
	buf := generateSine(440, 44100, 1, 100)
	if err := c.Process(buf); err != nil {
		t.Fatal(err)
	}
	if got := len(c.Timeline().InputDB); got != 100 {
		t.Fatalf("buckets for 100 samples: %d, want 100", got)
	}
}
