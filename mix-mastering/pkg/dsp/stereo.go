package dsp

import (
	"fmt"
	"math"
)

// StereoWidener adjusts the stereo width of audio.
type StereoWidener struct {
	BaseProcessor
	Width float64 // 0 = mono, 1 = normal, 2 = extra wide
}

// NewStereoWidener creates a stereo widener.
func NewStereoWidener() *StereoWidener {
	return &StereoWidener{
		BaseProcessor: BaseProcessor{ProcessorName: "Stereo Widener", IsEnabled: true},
		Width:         1.0,
	}
}

func (sw *StereoWidener) Process(buf *AudioBuffer) error {
	if !sw.IsEnabled || buf.Channels() < 2 {
		return nil
	}

	for i := 0; i < buf.Length(); i++ {
		left := buf.Samples[0][i]
		right := buf.Samples[1][i]

		mid := (left + right) * 0.5
		side := (left - right) * 0.5

		side *= sw.Width

		buf.Samples[0][i] = mid + side
		buf.Samples[1][i] = mid - side
	}

	return nil
}

func (sw *StereoWidener) SetParam(name string, value float64) error {
	switch name {
	case "width":
		sw.Width = math.Max(0, math.Min(3, value))
	default:
		return fmt.Errorf("unknown stereo param: %s", name)
	}
	return nil
}

func (sw *StereoWidener) GetParam(name string) (float64, error) {
	switch name {
	case "width":
		return sw.Width, nil
	default:
		return 0, fmt.Errorf("unknown stereo param: %s", name)
	}
}

func (sw *StereoWidener) GetParams() map[string]float64 {
	return map[string]float64{"width": sw.Width}
}

func (sw *StereoWidener) Reset() {}

// MidSideProcessor enables independent gain control of mid and side channels.
type MidSideProcessor struct {
	BaseProcessor
	MidGain  float64 // dB
	SideGain float64 // dB
}

// NewMidSideProcessor creates a mid/side processor.
func NewMidSideProcessor(sampleRate float64) *MidSideProcessor {
	return &MidSideProcessor{
		BaseProcessor: BaseProcessor{ProcessorName: "Mid/Side Processor", IsEnabled: true},
		MidGain:       0,
		SideGain:      0,
	}
}

func (ms *MidSideProcessor) Process(buf *AudioBuffer) error {
	if !ms.IsEnabled || buf.Channels() < 2 {
		return nil
	}

	midGainLin := dbToLinear(ms.MidGain)
	sideGainLin := dbToLinear(ms.SideGain)

	for i := 0; i < buf.Length(); i++ {
		left := buf.Samples[0][i]
		right := buf.Samples[1][i]

		mid := (left + right) * 0.5
		side := (left - right) * 0.5

		mid *= midGainLin
		side *= sideGainLin

		buf.Samples[0][i] = mid + side
		buf.Samples[1][i] = mid - side
	}

	return nil
}

func (ms *MidSideProcessor) SetParam(name string, value float64) error {
	switch name {
	case "mid_gain":
		ms.MidGain = value
	case "side_gain":
		ms.SideGain = value
	default:
		return fmt.Errorf("unknown mid/side param: %s", name)
	}
	return nil
}

func (ms *MidSideProcessor) GetParam(name string) (float64, error) {
	switch name {
	case "mid_gain":
		return ms.MidGain, nil
	case "side_gain":
		return ms.SideGain, nil
	default:
		return 0, fmt.Errorf("unknown mid/side param: %s", name)
	}
}

func (ms *MidSideProcessor) GetParams() map[string]float64 {
	return map[string]float64{
		"mid_gain":  ms.MidGain,
		"side_gain": ms.SideGain,
	}
}

func (ms *MidSideProcessor) Reset() {}
