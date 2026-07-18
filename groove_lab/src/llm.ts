import type { BassNote, DrumLane, Pattern, Step } from "./types";
import {
  BASS_PITCH_MAX,
  BASS_PITCH_MIN,
  DRUM_LANES,
  totalSteps,
} from "./types";
import { addBassNote, clearBass } from "./pattern";

// Browser → local Ollama, directly. Ollama must be started with
// OLLAMA_ORIGINS allowing the dev origin (see CLAUDE.md).
export const OLLAMA_URL: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_OLLAMA_URL ??
  "http://localhost:11434";

const REQUEST_TIMEOUT_MS = 180_000; // local 32b models are slow

/** Installed model names. `:latest` is noise, other tags (`:32b`) matter. */
export async function fetchModels(
  baseUrl: string = OLLAMA_URL,
): Promise<string[] | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name.replace(/:latest$/, ""));
  } catch (err) {
    console.warn("Ollama not reachable", err);
    return null;
  }
}

// JSON schema for the `format` field: drums + bass only. The LLM never
// controls bpm/bars/steps/swing — grid dimensions come from the base pattern.
function patternSchema() {
  const stepArray = {
    type: "array",
    items: {
      type: "object",
      properties: {
        step: { type: "integer" },
        velocity: { type: "number" },
      },
      required: ["step", "velocity"],
    },
  };
  return {
    type: "object",
    properties: {
      drums: {
        type: "object",
        properties: Object.fromEntries(
          DRUM_LANES.map((lane) => [lane.id, stepArray]),
        ),
        required: DRUM_LANES.map((lane) => lane.id),
      },
      bass: {
        type: "array",
        items: {
          type: "object",
          properties: {
            step: { type: "integer" },
            durationSteps: { type: "integer" },
            midiPitch: { type: "integer" },
            velocity: { type: "number" },
          },
          required: ["step", "durationSteps", "midiPitch", "velocity"],
        },
      },
    },
    required: ["drums", "bass"],
  };
}

function systemPrompt(pattern: Pattern): string {
  const total = totalSteps(pattern);
  return [
    `You edit drum machine patterns on a sixteenth-note grid.`,
    `This pattern has ${total} steps (0 to ${total - 1}), ${pattern.bars} bar(s) of ${pattern.stepsPerBar} steps; step 0 is beat 1.`,
    `Drum lanes: kick, snare, hhClosed, hhOpen, tomLow, tomMid, tomHigh, crash, ride.`,
    `velocity is 0.0-1.0 (about 0.9 accent, 0.75 normal, 0.4 ghost).`,
    `Bass notes have step, durationSteps (length in grid steps), midiPitch (${BASS_PITCH_MIN}-${BASS_PITCH_MAX}, E1-G3) and velocity. The bass is monophonic: notes must not overlap.`,
    `Apply the user's instruction to their pattern. Keep everything the instruction doesn't ask you to change. Return ONLY JSON matching the schema.`,
  ].join("\n");
}

/**
 * Ask the model to transform the pattern ("busier hats", "variation", …).
 * Returns a sanitized pattern, or null on any failure (logged, never thrown).
 */
export async function generateVariation(
  pattern: Pattern,
  instruction: string,
  model: string,
  baseUrl: string = OLLAMA_URL,
): Promise<Pattern | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        format: patternSchema(),
        options: { temperature: 0.7 },
        messages: [
          { role: "system", content: systemPrompt(pattern) },
          {
            role: "user",
            content:
              `Current pattern:\n` +
              JSON.stringify({ drums: pattern.drums, bass: pattern.bass }) +
              `\n\nInstruction: ${instruction}`,
          },
        ],
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    const content = String(data.message?.content ?? "");
    // format-constrained output shouldn't have fences, but models are models
    // (MIDI_EXPORT_NOTES.md §2) — strip them rather than die on them.
    const cleaned = content
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return sanitizePattern(pattern, JSON.parse(cleaned));
  } catch (err) {
    console.warn("LLM generation failed", err, { model, instruction });
    return null;
  }
}

/**
 * Trust nothing: clamp steps into the grid, normalize velocities (including
 * the classic 0-127 scale confusion), fold bass pitches into range by
 * octaves, and rebuild the bass through addBassNote so monophony holds.
 * Grid dimensions always come from `base`. Returns null only when `raw`
 * isn't even the right shape.
 */
export function sanitizePattern(base: Pattern, raw: unknown): Pattern | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { drums: rawDrums, bass: rawBass } = raw as {
    drums?: unknown;
    bass?: unknown;
  };
  if (typeof rawDrums !== "object" || rawDrums === null) return null;
  const total = totalSteps(base);

  const drums = {} as Record<DrumLane, Step[]>;
  for (const lane of DRUM_LANES) {
    const entries = (rawDrums as Record<string, unknown>)[lane.id];
    const seen = new Set<number>();
    const hits: Step[] = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const step = Math.round(Number((entry as Step)?.step));
      const velocity = normalizeVelocity((entry as Step)?.velocity);
      if (!Number.isFinite(step) || step < 0 || step >= total) continue;
      if (velocity === null || seen.has(step)) continue;
      seen.add(step);
      hits.push({ step, velocity });
    }
    drums[lane.id] = hits.sort((a, b) => a.step - b.step);
  }

  let result: Pattern = { ...clearBass(base), drums };
  for (const entry of Array.isArray(rawBass) ? rawBass : []) {
    const note = entry as BassNote;
    const step = Math.round(Number(note?.step));
    const durationSteps = Math.round(Number(note?.durationSteps));
    const velocity = normalizeVelocity(note?.velocity);
    let midiPitch = Math.round(Number(note?.midiPitch));
    if (!Number.isFinite(step) || step < 0 || step >= total) continue;
    if (velocity === null || !Number.isFinite(midiPitch)) continue;
    while (midiPitch < BASS_PITCH_MIN) midiPitch += 12;
    while (midiPitch > BASS_PITCH_MAX) midiPitch -= 12;
    result = addBassNote(result, {
      step,
      durationSteps: Math.max(1, Number.isFinite(durationSteps) ? durationSteps : 1),
      midiPitch,
      velocity,
    });
  }
  return result;
}

function normalizeVelocity(v: unknown): number | null {
  let n = Number(v);
  if (!Number.isFinite(n)) return null;
  // > 2 reads as the 0-127 MIDI scale; 1-2 reads as "over-enthusiastic 1.0".
  if (n > 2 && n <= 127) n /= 127;
  if (n <= 0) return null;
  return Math.min(1, Math.max(0.05, n));
}
