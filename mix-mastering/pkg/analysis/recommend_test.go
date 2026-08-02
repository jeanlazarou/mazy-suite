package analysis

import "testing"

// TestRecommendExciterBlocks locks in that Recommend always emits both
// exciter blocks (never omits them), with "enabled" reflecting the
// target profile's excitement amount. This matters because it's what
// lets re-targeting turn a previously-enabled exciter back off: phone
// enables it, studio must explicitly disable it again.
func TestRecommendExciterBlocks(t *testing.T) {
	result := &AnalysisResult{}

	phoneRec, err := Recommend(result, "phone")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Bass Exciter", "Treble Exciter"} {
		params, ok := phoneRec.Processors[name]
		if !ok {
			t.Fatalf("phone: expected a %q block", name)
		}
		if params["enabled"] != 1 {
			t.Errorf("phone: expected %q enabled, got %v", name, params["enabled"])
		}
		if params["drive"] <= 0 {
			t.Errorf("phone: expected %q drive > 0, got %v", name, params["drive"])
		}
		if params["mix"] <= 0 {
			t.Errorf("phone: expected %q mix > 0, got %v", name, params["mix"])
		}
	}

	studioRec, err := Recommend(result, "studio")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Bass Exciter", "Treble Exciter"} {
		params, ok := studioRec.Processors[name]
		if !ok {
			t.Fatalf("studio: expected a %q block", name)
		}
		if params["enabled"] != 0 {
			t.Errorf("studio: expected %q disabled, got %v", name, params["enabled"])
		}
	}
}
