import { ReactNode } from 'react';
import { StepType, TourProvider, useTour } from '@reactour/tour';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { shortcutLabel } from '../utils/keyboard';

/**
 * The guided tour, built like the player's (@reactour/tour). Steps anchor to
 * `data-tour` attributes, all of which exist in an empty project, so the tour
 * makes sense on a first visit - when it starts by itself (see App).
 */
const steps: StepType[] = [
  {
    selector: '[data-tour="project-actions"]',
    content: `Start here: this button uploads audio files. It also opens and saves projects (.mass files) and exports the mix as a WAV. ${shortcutLabel('O')} opens, ${shortcutLabel('S')} saves.`,
  },
  {
    selector: '[data-tour="clip-source"]',
    content:
      'Pick an uploaded file here, select a region on its waveform and name it to make a clip. Open Waveform Editor zooms in and lets you listen to the selection first.',
  },
  {
    selector: '[data-tour="clip-list"]',
    content:
      'Your clips. Drag one onto a track to place it. Edit renames it, Duplicate starts a variation.',
  },
  {
    selector: '[data-tour="timeline"]',
    content: (
      <div>
        The timeline. Drag a clip along its track or onto another, and drag its edges to trim
        it. Click a clip to give it
        <ul className="list-disc ml-5 my-1">
          <li>an effect,</li>
          <li>fades and repeats,</li>
          <li>or a link to other clips, so they move together.</li>
        </ul>
      </div>
    ),
  },
  {
    selector: '[data-tour="track-controls"]',
    content:
      'Each track has solo (S), mute, a volume knob and delete. Changes are heard at once, even while playing.',
  },
  {
    selector: '[data-tour="add-track"]',
    content: 'Add as many tracks as you need.',
  },
  {
    selector: '[data-tour="snap"]',
    content:
      "With Snap on, a clip edge brought near another clip's edge or the playhead lands exactly on it, so clips butt together without a gap.",
  },
  {
    selector: '[data-tour="ruler"]',
    content: 'Click or drag on the ruler to move the playhead.',
  },
  {
    selector: '[data-tour="play"]',
    content: 'Play and pause - the space bar does it too.',
  },
  {
    selector: '[data-tour="undo"]',
    content: `Every change can be undone (${shortcutLabel('Z')}) and redone (${shortcutLabel('Z', true)}).`,
  },
  {
    selector: '[data-tour="tour-button"]',
    content:
      'Your work is kept in this browser as you go, and offered back on your next visit; save a .mass file for a copy of your own. This button replays the tour.',
  },
];

export function AppTour({ children }: { children: ReactNode }) {
  return (
    <TourProvider
      steps={steps}
      styles={{
        popover: (base) => ({
          ...base,
          backgroundColor: '#1f2937',
          color: '#e5e7eb',
          border: '1px solid #374151',
          borderRadius: 10,
          maxWidth: 440,
          padding: '44px 28px 20px',
        }),
        // keep the step number inside the bubble so viewport edges never clip it
        badge: (base) => ({ ...base, background: '#2563eb', top: 10, left: 12 }),
        dot: (base, state) => ({
          ...base,
          background: state?.current ? '#3b82f6' : undefined,
          borderColor: '#6b7280',
        }),
        arrow: (base, state) => ({ ...base, color: state?.disabled ? '#4b5563' : '#e5e7eb' }),
        close: (base) => ({ ...base, color: '#9ca3af' }),
      }}
    >
      {children}
    </TourProvider>
  );
}

export function TourButton() {
  const { setIsOpen, setCurrentStep } = useTour();

  return (
    <button
      onClick={() => {
        setCurrentStep(0);
        setIsOpen(true);
      }}
      className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
      title="Take the tour"
      data-tour="tour-button"
    >
      <HelpOutlineIcon fontSize="small" />
    </button>
  );
}
