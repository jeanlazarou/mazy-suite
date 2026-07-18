package dsp

import "fmt"

// Gain applies a fixed gain. Used by album mastering to apply one shared
// loudness offset to every track (before the limiter) so relative track
// levels are preserved.
type Gain struct {
	BaseProcessor
	GainDB float64
}

// NewGain creates a unity-gain processor.
func NewGain() *Gain {
	return &Gain{
		BaseProcessor: BaseProcessor{ProcessorName: "Gain", IsEnabled: true},
	}
}

func (g *Gain) Process(buf *AudioBuffer) error {
	if !g.IsEnabled || g.GainDB == 0 {
		return nil
	}
	gainLin := dbToLinear(g.GainDB)
	for ch := 0; ch < buf.Channels(); ch++ {
		for i := range buf.Samples[ch] {
			buf.Samples[ch][i] *= gainLin
		}
	}
	return nil
}

func (g *Gain) SetParam(name string, value float64) error {
	switch name {
	case "gain_db":
		g.GainDB = value
	default:
		return fmt.Errorf("unknown gain param: %s", name)
	}
	return nil
}

func (g *Gain) GetParam(name string) (float64, error) {
	switch name {
	case "gain_db":
		return g.GainDB, nil
	default:
		return 0, fmt.Errorf("unknown gain param: %s", name)
	}
}

func (g *Gain) GetParams() map[string]float64 {
	return map[string]float64{"gain_db": g.GainDB}
}

func (g *Gain) Reset() {}
