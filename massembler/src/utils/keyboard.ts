const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A command-key shortcut as this platform writes it: ⌘S, ⇧⌘Z, Ctrl+S, Ctrl+Shift+Z. */
export function shortcutLabel(key: string, shift = false): string {
  return IS_MAC ? `${shift ? '⇧' : ''}⌘${key}` : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
}

const NON_TEXT_INPUTS =['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'];

/** A field with its own text editing, which app shortcuts must be left to. */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(target.type);
}
