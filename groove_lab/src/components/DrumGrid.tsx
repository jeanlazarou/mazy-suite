import { useCallback, useEffect, useRef, useState } from "react";
import type { DrumLane, Pattern } from "../types";
import { DRUM_LANES, totalSteps } from "../types";
import {
  DEFAULT_VELOCITY,
  cycleDrumStepVelocity,
  getDrumStep,
  setDrumStep,
} from "../pattern";

interface DrumGridProps {
  pattern: Pattern;
  currentStep: number;
  onChange: (pattern: Pattern) => void;
  onPreview: (lane: DrumLane, velocity: number) => void;
}

/**
 * Step-sequencer grid. Click toggles a hit (drag paints across cells);
 * right-click cycles an existing hit through ghost/normal/accent.
 */
export function DrumGrid({
  pattern,
  currentStep,
  onChange,
  onPreview,
}: DrumGridProps) {
  const steps = totalSteps(pattern);
  // While painting: the on/off value the drag applies (from the first cell).
  const paintValueRef = useRef<boolean | null>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;

  useEffect(() => {
    const end = () => {
      paintValueRef.current = null;
    };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, []);

  const applyCell = useCallback(
    (lane: DrumLane, step: number, on: boolean) => {
      onChange(setDrumStep(patternRef.current, lane, step, on));
      if (on) onPreview(lane, DEFAULT_VELOCITY);
    },
    [onChange, onPreview],
  );

  return (
    <div
      className="drum-grid"
      style={{ ["--steps" as string]: steps }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid-corner" />
      {Array.from({ length: steps }, (_, step) => (
        <div
          key={step}
          className={`step-header ${step % 4 === 0 ? "beat" : ""} ${
            step === currentStep ? "playing" : ""
          }`}
        >
          {step % 4 === 0 ? step / 4 + 1 : "·"}
        </div>
      ))}
      {DRUM_LANES.map((lane) => (
        <LaneRow
          key={lane.id}
          lane={lane.id}
          label={lane.label}
          pattern={pattern}
          steps={steps}
          currentStep={currentStep}
          paintValueRef={paintValueRef}
          applyCell={applyCell}
          onCycle={(step) => {
            onChange(cycleDrumStepVelocity(patternRef.current, lane.id, step));
          }}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
}

interface LaneRowProps {
  lane: DrumLane;
  label: string;
  pattern: Pattern;
  steps: number;
  currentStep: number;
  paintValueRef: React.RefObject<boolean | null>;
  applyCell: (lane: DrumLane, step: number, on: boolean) => void;
  onCycle: (step: number) => void;
  onPreview: (lane: DrumLane, velocity: number) => void;
}

function LaneRow({
  lane,
  label,
  pattern,
  steps,
  currentStep,
  paintValueRef,
  applyCell,
  onCycle,
  onPreview,
}: LaneRowProps) {
  const [hover, setHover] = useState(false);
  return (
    <>
      <button
        className={`lane-label ${hover ? "hover" : ""}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onPreview(lane, DEFAULT_VELOCITY)}
        title="Click to hear this drum"
      >
        {label}
      </button>
      {Array.from({ length: steps }, (_, step) => {
        const hit = getDrumStep(pattern, lane, step);
        return (
          <button
            key={step}
            className={`cell ${hit ? "on" : ""} ${
              step % 4 === 0 ? "beat" : ""
            } ${step === currentStep ? "playing" : ""}`}
            style={hit ? { ["--vel" as string]: hit.velocity } : undefined}
            onMouseDown={(e) => {
              if (e.button === 2) {
                onCycle(step);
                return;
              }
              const on = !hit;
              paintValueRef.current = on;
              applyCell(lane, step, on);
            }}
            onMouseEnter={() => {
              if (paintValueRef.current !== null) {
                applyCell(lane, step, paintValueRef.current);
              }
            }}
            title={
              hit
                ? `velocity ${hit.velocity.toFixed(2)} — right-click to cycle`
                : undefined
            }
          />
        );
      })}
    </>
  );
}
