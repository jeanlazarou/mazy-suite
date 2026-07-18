import React, { useEffect, useRef } from 'react';
import { Box, Grid, CircularProgress, Typography, Alert, Paper } from '@mui/material';
import { Header } from './components/layout/Header';
import { FileDropZone } from './components/layout/FileDropZone';
import { TransportBar } from './components/layout/TransportBar';
import { ProcessorPipeline } from './components/processors/ProcessorPipeline';
import { Waveform } from './components/visualizers/Waveform';
import { Spectrum } from './components/visualizers/Spectrum';
import { StereoField } from './components/visualizers/StereoField';
import { LUFSMeter } from './components/visualizers/LUFSMeter';
import { DynamicsHistogram } from './components/visualizers/DynamicsHistogram';
import { PresetBrowser } from './components/presets/PresetBrowser';
import { AnalysisPanel } from './components/analysis/AnalysisPanel';
import { AlbumPanel } from './components/album/AlbumPanel';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useStore } from './store/store';
import { getAnalyserNode, audioBufferToFloat32Array } from './audio/context';
import { engine } from './wasm/engine';

const App: React.FC = () => {
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const originalBuffer = useStore((s) => s.originalBuffer);
  const wasmReady = useStore((s) => s.wasmReady);
  const setError = useStore((s) => s.setError);
  const { analyzeAudio, processAudio } = useAudioEngine();
  const analyser = getAnalyserNode();

  // Analysis depends only on the original audio, so run it automatically
  // once per loaded file. This effect lives here (single instance) rather
  // than in the hook, which is instantiated by many components.
  useEffect(() => {
    const { analysis, isAnalyzing } = useStore.getState();
    if (originalBuffer && wasmReady && !analysis && !isAnalyzing) {
      analyzeAudio();
    }
  }, [originalBuffer, wasmReady]);

  // When switching album tracks after settings were applied, process the
  // newly selected track automatically so A/B compares processed vs
  // original right away (a track switch clears the processed buffer).
  const activeTrackId = useStore((s) => s.activeTrackId);
  useEffect(() => {
    const { tracks, activePreset, appliedTarget, paramsEdited, isProcessing } = useStore.getState();
    if (!wasmReady || tracks.length < 2 || isProcessing) return;
    if (!(activePreset || appliedTarget || paramsEdited)) return;
    processAudio();
  }, [activeTrackId]);

  // Background album pipeline: analyze each track and collect its BS.1770
  // gating blocks, then integrate the album's loudness over all blocks as
  // one program. Sequential, in the worker, guarded against re-entry.
  const tracks = useStore((s) => s.tracks);
  const tracksAnalyzed = tracks.filter((t) => t.analysis && t.blocks).length;
  const albumAnalysisPending = tracks.length > 1 && tracksAnalyzed < tracks.length;
  const albumWorkRunning = useRef(false);
  useEffect(() => {
    if (!wasmReady || albumWorkRunning.current) return;
    if (!tracks.some((t) => !t.analysis || !t.blocks)) return;
    albumWorkRunning.current = true;
    (async () => {
      try {
        for (;;) {
          const next = useStore.getState().tracks.find((t) => !t.analysis || !t.blocks);
          if (!next) break;
          const { buffer } = next;
          const ch = buffer.numberOfChannels;
          const sr = buffer.sampleRate;
          const analysis = next.analysis
            ?? await engine.inspectBuffer(audioBufferToFloat32Array(buffer), ch, sr);
          const blocks = next.blocks
            ?? await engine.measureBlocks(audioBufferToFloat32Array(buffer), ch, sr);
          useStore.getState().updateTrack(next.id, { analysis, blocks });
        }
        const all = useStore.getState().tracks;
        if (all.length > 0 && all.every((t) => t.blocks)) {
          const blocks = all.flatMap((t) => t.blocks!);
          useStore.getState().setAlbumLufs(await engine.gatedLoudness(blocks));
        }
      } catch (err: any) {
        setError(`Album analysis failed: ${err.message}`);
      } finally {
        albumWorkRunning.current = false;
      }
    })();
  }, [tracks, wasmReady]);

  if (loading && !wasmReady) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2, bgcolor: 'background.default' }}>
        <CircularProgress />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Loading audio engine...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Header />

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}

      {!originalBuffer ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
          <FileDropZone />
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Transport bar */}
          <Box sx={{ px: 2, pt: 1.5 }}>
            <TransportBar />
          </Box>

          {/* Waveform */}
          <Box sx={{ px: 2, pt: 1 }}>
            <Waveform />
          </Box>

          {/* Album track list (multiple tracks loaded) */}
          {tracks.length > 1 && (
            <Box sx={{ px: 2, pt: 1 }}>
              <AlbumPanel />
            </Box>
          )}

          {/* Main content area */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <Grid container spacing={2}>
              {albumAnalysisPending ? (
                /* Album analysis gate: settings choices appear once every
                   track is analyzed, so recommendations are always based on
                   the whole album. */
                <Grid size={{ xs: 12, md: 8.5 }}>
                  <Paper sx={{ p: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={28} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      Analyzing album — {tracksAnalyzed} of {tracks.length} tracks
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center' }}>
                      Presets and target recommendations will appear once every
                      track is analyzed. You can already listen to the tracks below.
                    </Typography>
                  </Paper>
                </Grid>
              ) : (
                <>
                  {/* Left: Presets */}
                  <Grid size={{ xs: 12, md: 2.5 }}>
                    <PresetBrowser />
                  </Grid>

                  {/* Center: Processors */}
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <ProcessorPipeline />
                      <AnalysisPanel />
                    </Box>
                  </Grid>
                </>
              )}

              {/* Right: Visualizations */}
              <Grid size={{ xs: 12, md: 3.5 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Spectrum analyser={analyser} />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <StereoField analyser={analyser} />
                    <Box sx={{ flex: 1 }}>
                      <LUFSMeter />
                    </Box>
                  </Box>
                  <DynamicsHistogram />
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default App;
