import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  OptimizationReport,
  analyzeProject,
  formatBytes,
  optimizeProject,
  relinkOriginal,
} from '../utils/projectOptimizer';
import { downloadBlob, saveProject } from '../utils/projectManager';

interface OptimizeDialogProps {
  onClose: () => void;
}

export function OptimizeDialog({ onClose }: OptimizeDialogProps) {
  const {
    tracks,
    clips,
    audioFiles,
    pixelsPerSecond,
    projectName,
    loadProjectState,
    showToast,
  } = useStore();

  const reports = useMemo(
    () => analyzeProject(audioFiles, clips, tracks),
    [audioFiles, clips, tracks]
  );

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(reports.filter((r) => r.worthwhile).map((r) => r.audioFileId))
  );
  const [isSaving, setIsSaving] = useState(false);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const relinkTargetRef = useRef<string | null>(null);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentTotal = reports.reduce((n, r) => n + r.currentBytes, 0);
  const projectedTotal = reports.reduce(
    (n, r) => n + (selected.has(r.audioFileId) ? r.optimizedBytes : r.currentBytes),
    0
  );
  const saving = currentTotal - projectedTotal;

  const handleSaveOptimized = async () => {
    setIsSaving(true);
    try {
      // Operates on a copy: the open project keeps its full quality audio.
      const optimized = optimizeProject(tracks, clips, audioFiles, selected);
      const blob = await saveProject(
        projectName,
        optimized.tracks,
        optimized.clips,
        optimized.audioFiles,
        pixelsPerSecond
      );
      downloadBlob(blob, `${projectName}-optimized.mass`);
      showToast(
        `Saved optimized copy - ${formatBytes(blob.size)} (${formatBytes(saving)} smaller)`,
        'success',
        6000
      );
      onClose();
    } catch (error) {
      showToast(
        `Optimize failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        0
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleRelinkClick = (audioFileId: string) => {
    relinkTargetRef.current = audioFileId;
    relinkInputRef.current?.click();
  };

  const handleRelinkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const audioFileId = relinkTargetRef.current;
    if (!file || !audioFileId) return;

    try {
      const context = new AudioContext();
      const blob = file.slice();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const target = audioFiles.find((a) => a.id === audioFileId);

      // A shorter file than the one optimized cannot contain the segments.
      if (target?.optimization && buffer.duration + 0.5 < target.optimization.originalDuration) {
        throw new Error(
          `"${file.name}" is ${buffer.duration.toFixed(1)}s but the original was ` +
            `${target.optimization.originalDuration.toFixed(1)}s`
        );
      }

      const restored = relinkOriginal(
        audioFileId,
        buffer,
        blob,
        file.name,
        tracks,
        clips,
        audioFiles
      );
      loadProjectState(
        restored.tracks,
        restored.clips,
        restored.audioFiles,
        pixelsPerSecond,
        projectName
      );
      showToast(`Relinked ${file.name}`, 'success');
    } catch (error) {
      showToast(
        `Relink failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        0
      );
    } finally {
      relinkTargetRef.current = null;
      if (relinkInputRef.current) relinkInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-6">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Optimize project</h2>
          <p className="text-sm text-gray-400 mt-1">
            Trims each audio file to the regions your clips use, plus a small margin.
            Saves a copy - the project you have open is not changed.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {reports.length === 0 ? (
            <p className="text-gray-400">No audio files in this project.</p>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="pb-2 w-8"></th>
                  <th className="pb-2">Audio file</th>
                  <th className="pb-2 text-right">Used</th>
                  <th className="pb-2 text-right">Now</th>
                  <th className="pb-2 text-right">After</th>
                  <th className="pb-2 text-right">Saved</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <Row
                    key={report.audioFileId}
                    report={report}
                    checked={selected.has(report.audioFileId)}
                    onToggle={() => toggle(report.audioFileId)}
                    optimized={
                      !!audioFiles.find((a) => a.id === report.audioFileId)?.optimization
                    }
                    onRelink={() => handleRelinkClick(report.audioFileId)}
                  />
                ))}
              </tbody>
            </table>
          )}

          <p className="text-xs text-gray-500 mt-4">
            Optimized clips can no longer be extended past what was kept, and unused
            files are dropped. Use <em>Relink</em> to point a file back at its original
            recording.
          </p>
        </div>

        <div className="p-4 border-t border-gray-700 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-300">
            Audio total{' '}
            <span className="text-white font-medium">{formatBytes(currentTotal)}</span>
            {' → '}
            <span className="text-white font-medium">{formatBytes(projectedTotal)}</span>{' '}
            <span className={saving > 0 ? 'text-green-400' : 'text-gray-500'}>
              ({saving >= 0 ? 'saves ' : 'costs '}
              {formatBytes(Math.abs(saving))})
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveOptimized}
              disabled={isSaving || selected.size === 0}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white"
            >
              {isSaving ? 'Saving…' : 'Save optimized copy'}
            </button>
          </div>
        </div>
      </div>

      <input
        ref={relinkInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleRelinkFile}
      />
    </div>
  );
}

interface RowProps {
  report: OptimizationReport;
  checked: boolean;
  optimized: boolean;
  onToggle: () => void;
  onRelink: () => void;
}

function Row({ report, checked, optimized, onToggle, onRelink }: RowProps) {
  const grows = report.savedBytes < 0;

  return (
    <tr className="border-b border-gray-700/50">
      <td className="py-2">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="py-2">
        <div className="text-white flex items-center gap-2">
          <span className="truncate">{report.name}</span>
          {report.unused && (
            <span className="px-1 rounded bg-yellow-600 text-[10px] uppercase">unused</span>
          )}
          {optimized && (
            <span className="px-1 rounded bg-purple-600 text-[10px] uppercase">optimized</span>
          )}
        </div>
        <div className="text-xs text-gray-500 truncate">
          {report.unused
            ? 'no clips reference this file'
            : `${report.clipNames.length} clip${report.clipNames.length === 1 ? '' : 's'}: ${report.clipNames.join(', ')}`}
        </div>
      </td>
      <td className="py-2 text-right text-gray-300 whitespace-nowrap">
        {report.usedSeconds.toFixed(1)}s / {report.totalSeconds.toFixed(1)}s
      </td>
      <td className="py-2 text-right text-gray-300 whitespace-nowrap">
        {formatBytes(report.currentBytes)}
      </td>
      <td className="py-2 text-right text-gray-300 whitespace-nowrap">
        {formatBytes(report.optimizedBytes)}
      </td>
      <td
        className={`py-2 text-right whitespace-nowrap ${
          grows ? 'text-red-400' : report.worthwhile ? 'text-green-400' : 'text-gray-400'
        }`}
        title={
          grows
            ? 'Trimmed audio is stored uncompressed, so this would be larger than the current compressed file'
            : undefined
        }
      >
        {grows ? '+' : ''}
        {formatBytes(Math.abs(report.savedBytes))}
      </td>
      <td className="py-2 text-right">
        {optimized && (
          <button
            onClick={onRelink}
            className="text-xs px-2 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400"
            title="Point this file back at its original recording"
          >
            Relink…
          </button>
        )}
      </td>
    </tr>
  );
}
