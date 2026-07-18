import { useEffect, useState } from "react";
import type { Pattern } from "../types";
import { OLLAMA_URL, fetchModels, generateVariation } from "../llm";

const PRESETS = [
  "Make a variation of this pattern",
  "Busier hi-hats",
  "Add a drum fill in the last bar",
  "Write a bass line that follows the kick",
];

const MODEL_KEY = "grooveLab.model.v1";

interface LlmPanelProps {
  pattern: Pattern;
  onChange: (pattern: Pattern) => void;
}

export function LlmPanel({ pattern, onChange }: LlmPanelProps) {
  const [models, setModels] = useState<string[] | null>(null); // null = unreachable
  const [model, setModel] = useState(
    () => localStorage.getItem(MODEL_KEY) ?? "",
  );
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void fetchModels().then((names) => {
      setModels(names);
      if (names && names.length > 0) {
        setModel((m) => (m && names.includes(m) ? m : names[0]));
      }
    });
  }, []);

  useEffect(() => {
    if (model) localStorage.setItem(MODEL_KEY, model);
  }, [model]);

  const run = async () => {
    if (!model || busy) return;
    setBusy(true);
    setStatus("thinking…");
    const result = await generateVariation(pattern, prompt, model);
    setBusy(false);
    if (result) {
      onChange(result);
      setStatus("done — Undo brings the old pattern back");
    } else {
      setStatus("the model returned nothing usable — see console, try again");
    }
  };

  if (models === null) {
    return (
      <div className="llm-bar">
        <span className="song-label">AI</span>
        <span className="llm-status">
          Ollama not reachable at {OLLAMA_URL}. Start it with{" "}
          <code>OLLAMA_ORIGINS=http://localhost:5173 ollama serve</code> and
          reload.
        </span>
      </div>
    );
  }

  return (
    <div className="llm-bar">
      <span className="song-label">AI</span>
      <select
        className="llm-model"
        value={model}
        onChange={(e) => setModel(e.target.value)}
        title="Ollama model"
      >
        {models.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        className="llm-preset"
        value={PRESETS.includes(prompt) ? prompt : ""}
        onChange={(e) => e.target.value && setPrompt(e.target.value)}
        title="Preset instructions"
      >
        {!PRESETS.includes(prompt) && <option value="">custom…</option>}
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <input
        className="llm-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="…or type your own instruction"
      />
      <button
        className="tool-button llm-go"
        onClick={() => void run()}
        disabled={busy || !model || prompt.trim() === ""}
      >
        {busy ? "…" : "Generate"}
      </button>
      <span className="llm-status">{status}</span>
    </div>
  );
}
