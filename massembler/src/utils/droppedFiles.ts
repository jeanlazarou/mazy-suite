/**
 * What a drop of files onto the window asks for: a `.mass` project to open,
 * or audio files to upload. A project wins - opening it replaces everything,
 * so audio dropped alongside would be lost anyway - and only one opens.
 */
export function sortDroppedFiles(files: File[]): {
  project: File | null;
  audio: File[];
  /** Files dropped with a project, which are left out. */
  ignored: number;
} {
  const projects = files.filter((f) => f.name.toLowerCase().endsWith('.mass'));
  const audio = files.filter((f) => !f.name.toLowerCase().endsWith('.mass'));

  if (projects.length > 0) {
    return { project: projects[0], audio: [], ignored: files.length - 1 };
  }
  return { project: null, audio, ignored: 0 };
}
