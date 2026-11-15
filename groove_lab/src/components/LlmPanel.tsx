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

/** The section a request was made for, with its pattern at that moment. */
export interface LlmTarget {
  songId: string;
  sectionId: string;
  sectionName: string;
  pattern: Pattern;
}

interface LlmPanelProps {
  target: LlmTarget;
  /** The target section's pattern now, or null if its song/section is gone. */
  getLivePattern: (target: LlmTarget) => Pattern | null;
  onApply: (target: LlmTarget, pattern: Pattern) => void;
}

export function LlmPanel({ target, getLivePattern, onApply }: LlmPanelProps) {
  const [models, setModels] = useState<string[] | null>(null); // null = unreachable
  const [model, setModel] = useState(
    () => localStorage.getItem(MODEL_KEY) ?? "",
  );
  const [prompt, setPrompt] = useState(PRESETS[0]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // A result whose section was edited while the model was thinking.
  const [pending, setPending] = useState<{
    request: LlmTarget;
    result: Pattern;
  } | null>(null);

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
    const request = target;
    const section = `section ${request.sectionName}`;
    setBusy(true);
    setPending(null);
    setStatus(`thinking about ${section}…`);
    const result = await generateVariation(request.pattern, prompt, model);
    setBusy(false);
    if (!result) {
      setStatus("the model returned nothing usable — see console, try again");
      return;
    }
    const live = getLivePattern(request);
    if (live === null) {
      setStatus(`${section} is no longer open — result dropped`);
    } else if (live !== request.pattern) {
      setPending({ request, result });
      setStatus(`${section} changed while the model was thinking.`);
    } else {
      onApply(request, result);
      setStatus(`done — applied to ${section}; Undo brings the old one back`);
    }
  };

  const applyPending = () => {
    if (!pending) return;
    if (getLivePattern(pending.request) === null) {
      setStatus(`section ${pending.request.sectionName} is no longer open — result dropped`);
    } else {
      onApply(pending.request, pending.result);
      setStatus(
        `applied to section ${pending.request.sectionName}; Undo brings your edits back`,
      );
    }
    setPending(null);
  };

  if (models === null) {
    return (
      <div className="llm-bar">
        <span className="song-label">AI</span>
        <span className="llm-status">
          Ollama not reachable at {OLLAMA_URL}. Start it with{" "}
          <code>OLLAMA_ORIGINS={window.location.origin} ollama serve</code> and
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
      {pending && (
        <>
          <button
            className="tool-button llm-apply"
            onClick={applyPending}
            title="Replace the section with the model's result, discarding your edits since the request (Undo brings them back)"
          >
            Apply anyway
          </button>
          <button
            className="tool-button llm-discard"
            onClick={() => {
              setPending(null);
              setStatus("result discarded");
            }}
          >
            Discard
          </button>
        </>
      )}
    </div>
  );
}
