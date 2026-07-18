import { useEffect } from 'react';
import { useMixStore } from '../state/store';
import { toggleHelp } from '../actions/toggle_help';

// Hotkeys & gestures reference, grouped by activity — the popup version of
// player_editor's HotkeysHelp. Opened with ? or the transport button.

const isMac = /Mac/.test(navigator.userAgent);
const CTRL = isMac ? '⌘' : 'Ctrl';
const SHIFT = isMac ? '⇧' : 'Shift';

const k = (command, ...keys) => ({ command, keys });
const g = (command, gesture) => ({ command, gesture });

const GROUPS = [
  {
    title: 'Level & pan line',
    items: [
      g('Add breakpoint', 'click the line'),
      g('Move breakpoint', 'drag it'),
      g('Select breakpoint', 'click / drag it'),
      g('Delete breakpoint', 'right-click it'),
      k('Nudge selection', '←', '→'),
      k('…in 0.1 s steps', SHIFT, '←/→'),
      k('Delete selection', 'Del'),
      k('Deselect', 'Esc'),
      g('Edit pan instead of gain', 'Pan toggle (top = right)'),
    ],
  },
  {
    title: 'Regions',
    items: [
      g('Create region', `${SHIFT} + drag on a track`),
      g('Select region', 'click it'),
      g('Resize region', 'drag its edge'),
      g('Delete region', 'right-click it'),
      k('Fade fast 50 ms linear', '1'),
      k('Fade medium 0.5 s smooth', '2'),
      k('Fade slow 2 s log', '3'),
      k('Type: mute / fade-in / fade-out', 'T'),
      k('Region on/off (audition)', 'E'),
    ],
  },
  {
    title: 'Transport',
    items: [
      k('Play / pause', 'Space'),
      k('Back to start', 'Home'),
      k('A/B bypass the mix', 'B'),
      g('Seek', 'click ruler or empty lane'),
    ],
  },
  {
    title: 'Tracks & groups',
    items: [
      k('Solo hovered track', 'S'),
      k('Mute hovered track', 'M'),
      g('Add tracks from files', '+ Track button'),
      g('Remove track', '× on the track header'),
      g('Replace stem', 'Load… on the track header'),
      g('Cycle group membership', 'click the track’s color dot'),
      g('Hide/show group members', '▾ on the group header'),
      g('Reset an EQ band', 'double-click its slider'),
    ],
  },
  {
    title: 'Mix files',
    items: [
      k('Save mix.json', CTRL, 'S'),
      k('Open stems / mix.json', CTRL, 'O'),
      k('Undo', CTRL, 'Z'),
      k('Redo', CTRL, 'Y'),
      g('Open from the suite', 'Suite… button'),
      g('Render for mix-mastering', 'Send to mastering'),
    ],
  },
  {
    title: 'View',
    items: [
      k('Zoom around pointer', CTRL, 'wheel'),
      g('Scroll when zoomed', `horizontal or ${SHIFT} + wheel`),
      g('Zoom / fit', '− + Fit buttons'),
      g('Markers + snapping on/off', 'Markers toggle'),
      k('This help', '?'),
    ],
  },
];

const Keys = ({ keys }) => keys.map((key, i) => (
  <span key={i}>
    {i > 0 && <span className="dim"> + </span>}
    <kbd>{key}</kbd>
  </span>
));

export default function HelpBox() {
  const open = useMixStore((s) => s.helpOpen);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && toggleHelp();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={toggleHelp}>
      <div className="modal help" onClick={(e) => e.stopPropagation()}>
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <table>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.command}>
                    <td>{item.command}</td>
                    <td>
                      {item.keys ? <Keys keys={item.keys} /> : <span className="dim">{item.gesture}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
