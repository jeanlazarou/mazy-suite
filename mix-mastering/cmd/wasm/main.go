//go:build js && wasm

package main

import (
	"fmt"
	"math"
	"syscall/js"

	wasmbridge "github.com/audiomaster/mastering/pkg/wasm"
)

var bridge *wasmbridge.Bridge

func main() {
	bridge = wasmbridge.NewBridge()

	// Register JS functions
	js.Global().Set("wasmInitEngine", js.FuncOf(initEngine))
	js.Global().Set("wasmProcessBuffer", js.FuncOf(processBuffer))
	js.Global().Set("wasmSetParam", js.FuncOf(setParam))
	js.Global().Set("wasmGetParams", js.FuncOf(getParams))
	js.Global().Set("wasmSetProcessorEnabled", js.FuncOf(setProcessorEnabled))
	js.Global().Set("wasmAnalyzeBuffer", js.FuncOf(analyzeBuffer))
	js.Global().Set("wasmInspectBuffer", js.FuncOf(inspectBuffer))
	js.Global().Set("wasmGetRecommendations", js.FuncOf(getRecommendations))
	js.Global().Set("wasmGetAlbumRecommendations", js.FuncOf(getAlbumRecommendations))
	js.Global().Set("wasmApplyRecommendations", js.FuncOf(applyRecommendations))
	js.Global().Set("wasmListPresets", js.FuncOf(listPresets))
	js.Global().Set("wasmApplyPreset", js.FuncOf(applyPreset))
	js.Global().Set("wasmListTargets", js.FuncOf(listTargets))
	js.Global().Set("wasmReset", js.FuncOf(resetEngine))
	js.Global().Set("wasmGetMeters", js.FuncOf(getMeters))
	js.Global().Set("wasmMeasureLoudness", js.FuncOf(measureLoudness))
	js.Global().Set("wasmMeasureBlocks", js.FuncOf(measureBlocks))
	js.Global().Set("wasmGatedLoudness", js.FuncOf(gatedLoudness))

	// Signal that WASM is ready
	js.Global().Call("dispatchEvent", js.Global().Get("CustomEvent").New("wasmReady"))

	// Block forever — keep Go runtime alive for JS callbacks.
	<-make(chan struct{})
}

// safeCall wraps a function with panic recovery so one bad call
// doesn't crash the entire Go WASM runtime.
func safeCall(fn func() interface{}) (result interface{}) {
	defer func() {
		if r := recover(); r != nil {
			result = fmt.Sprintf("WASM panic: %v", r)
		}
	}()
	return fn()
}

// copyFloat32Array copies a JS Float32Array (or view) into a Go slice,
// respecting byteOffset for buffer views.
func copyFloat32Array(jsArray js.Value) []float32 {
	length := jsArray.Get("length").Int()
	if length == 0 {
		return nil
	}
	byteOffset := jsArray.Get("byteOffset").Int()
	byteLen := length * 4
	jsBytes := js.Global().Get("Uint8Array").New(jsArray.Get("buffer"), byteOffset, byteLen)
	tmpBuf := make([]byte, byteLen)
	js.CopyBytesToGo(tmpBuf, jsBytes)

	input := make([]float32, length)
	for i := 0; i < length; i++ {
		bits := uint32(tmpBuf[i*4]) | uint32(tmpBuf[i*4+1])<<8 | uint32(tmpBuf[i*4+2])<<16 | uint32(tmpBuf[i*4+3])<<24
		input[i] = math.Float32frombits(bits)
	}
	return input
}

func initEngine(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		sampleRate := args[0].Int()
		channels := args[1].Int()
		bridge.InitEngine(sampleRate, channels)
		return nil
	})
}

func processBuffer(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		input := copyFloat32Array(args[0])
		if len(input) == 0 {
			return js.Global().Get("Float32Array").New(0)
		}
		channels := args[1].Int()
		sampleRate := args[2].Int()

		output := bridge.ProcessBuffer(input, channels, sampleRate)

		// Create output Float32Array
		jsOutput := js.Global().Get("Float32Array").New(len(output))
		outBytes := make([]byte, len(output)*4)
		for i, v := range output {
			bits := math.Float32bits(v)
			outBytes[i*4] = byte(bits)
			outBytes[i*4+1] = byte(bits >> 8)
			outBytes[i*4+2] = byte(bits >> 16)
			outBytes[i*4+3] = byte(bits >> 24)
		}
		jsOutUint8 := js.Global().Get("Uint8Array").New(jsOutput.Get("buffer"))
		js.CopyBytesToJS(jsOutUint8, outBytes)

		return jsOutput
	})
}

func setParam(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		processor := args[0].String()
		param := args[1].String()
		value := args[2].Float()
		if err := bridge.SetParam(processor, param, value); err != nil {
			return err.Error()
		}
		return nil
	})
}

func getParams(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		return bridge.GetParams()
	})
}

func setProcessorEnabled(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		name := args[0].String()
		enabled := args[1].Bool()
		bridge.SetProcessorEnabled(name, enabled)
		return nil
	})
}

func analyzeBuffer(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		input := copyFloat32Array(args[0])
		if len(input) == 0 {
			return "{}"
		}
		channels := args[1].Int()
		sampleRate := args[2].Int()

		return bridge.AnalyzeBuffer(input, channels, sampleRate)
	})
}

func measureBlocks(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		input := copyFloat32Array(args[0])
		if len(input) == 0 {
			return "[]"
		}
		channels := args[1].Int()
		sampleRate := args[2].Int()
		return bridge.MeasureBlocks(input, channels, sampleRate)
	})
}

func gatedLoudness(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		return bridge.GatedLoudnessJSON(args[0].String())
	})
}

func inspectBuffer(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		input := copyFloat32Array(args[0])
		if len(input) == 0 {
			return "{}"
		}
		channels := args[1].Int()
		sampleRate := args[2].Int()

		return bridge.InspectBuffer(input, channels, sampleRate)
	})
}

func getRecommendations(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		target := args[0].String()
		return bridge.GetRecommendations(target)
	})
}

func getAlbumRecommendations(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		analysesJSON := args[0].String()
		target := args[1].String()
		return bridge.GetAlbumRecommendations(analysesJSON, target)
	})
}

func applyRecommendations(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		target := args[0].String()
		if err := bridge.ApplyRecommendations(target); err != nil {
			return err.Error()
		}
		return nil
	})
}

func listPresets(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		return bridge.ListPresets()
	})
}

func applyPreset(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		name := args[0].String()
		if err := bridge.ApplyPreset(name); err != nil {
			return err.Error()
		}
		return nil
	})
}

func listTargets(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		return bridge.ListTargets()
	})
}

func resetEngine(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		bridge.Reset()
		return nil
	})
}

func getMeters(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		return bridge.GetMeters()
	})
}

func measureLoudness(this js.Value, args []js.Value) interface{} {
	return safeCall(func() interface{} {
		input := copyFloat32Array(args[0])
		if len(input) == 0 {
			return -200.0
		}
		channels := args[1].Int()
		sampleRate := args[2].Int()
		return bridge.MeasureLoudness(input, channels, sampleRate)
	})
}
