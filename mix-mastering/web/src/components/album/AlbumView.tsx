import React from 'react';
import {
  Box, Paper, Typography, Switch, Button, Divider, Grid, IconButton, Tooltip, Chip, CircularProgress,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useStore, type AlbumStep } from '../../store/store';
import { pickAudioFiles, addAlbumFiles } from '../../audio/loadFiles';
import { stopPlayback } from '../../hooks/usePlayback';
import {
  Step, StyleChips, DestinationStep, FixList, ResultSummary, ResultChips, PresetsSection, Caption,
} from '../master/MasterPanel';
import { ProcessorPipeline } from '../processors/ProcessorPipeline';
import { Spectrum } from '../visualizers/Spectrum';
import { LUFSMeter } from '../visualizers/LUFSMeter';
import { getAnalyserNode } from '../../audio/context';
import { BalancePanel } from './BalancePanel';

// The album workflow, as mastering engineers work: choose the release
// (one destination for every track), get each track right on its own
// terms, then balance the album as a whole. Steps are advisory — every
// step stays reachable, and the balance step often sends you back to a
// track.
const STEPS: { id: AlbumStep; label: string }[] = [
  { id: 'release', label: 'The release' },
  { id: 'tracks', label: 'Each track' },
  { id: 'balance', label: 'Album balance' },
];

export const AlbumView: React.FC = () => {
  const step = useStore((s) => s.albumStep);
  const setStep = useStore((s) => s.setAlbumStep);
  const trackCount = useStore((s) => s.tracks.length);
  const reviewed = useStore((s) => s.tracks.filter((t) => t.settings.reviewed).length);
  const analyzed = useStore((s) => s.tracks.filter((t) => t.analysis && t.blocks).length);
  const calibrating = useStore((s) => s.albumCalibrating);

  const status = calibrating
    ?? (analyzed < trackCount ? `Analyzing tracks… (${analyzed}/${trackCount})` : null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper sx={{ px: 1.5, py: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {STEPS.map((st, i) => {
          const active = st.id === step;
          const extra = st.id === 'tracks' ? ` · ${reviewed}/${trackCount} checked` : '';
          return (
            <React.Fragment key={st.id}>
              {i > 0 && <ArrowForwardIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
              <Button
                size="small"
                onClick={() => setStep(st.id)}
                variant={active ? 'contained' : 'text'}
                aria-current={active ? 'step' : undefined}
                sx={{ fontSize: '0.75rem', textTransform: 'none', gap: 0.75 }}
              >
                <Box component="span" sx={{
                  width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700,
                  bgcolor: active ? 'rgba(255,255,255,0.25)' : 'rgba(108,99,255,0.2)',
                }}>
                  {i + 1}
                </Box>
                {st.label}{extra}
              </Button>
            </React.Fragment>
          );
        })}
        <Box sx={{ flex: 1 }} />
        {status && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={12} />
            <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{status}</Typography>
          </Box>
        )}
      </Paper>

      {step === 'release' && <ReleaseStep />}
      {step === 'tracks' && <TracksStep />}
      {step === 'balance' && <BalancePanel />}
    </Box>
  );
};

// Step 1: what the whole album shares.
const ReleaseStep: React.FC = () => {
  const options = useStore((s) => s.recipeOptions);
  const choice = useStore((s) => s.choice);
  const setChoice = useStore((s) => s.setChoice);
  const setStep = useStore((s) => s.setAlbumStep);
  const style = options?.styles.find((o) => o.id === choice.style);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.75, maxWidth: 760 }}>
      <Typography variant="h6" sx={{ fontSize: '0.9rem' }}>The release</Typography>
      <Caption>
        What every track of the album shares. Each track then gets its own
        corrections in the next step.
      </Caption>

      <Step n={1} title="What is the album?" hint="its usual character — a track can differ in step 2">
        <StyleChips selected={choice.style} onSelect={(id) => setChoice({ style: id })} />
        <Caption>{style?.description ?? 'No genre-specific shaping — only the destination and the fixes shape the sound.'}</Caption>
      </Step>

      <DestinationStep n={2} hint="one release: the same loudness and peak limit for every track" />

      <Step
        n={3}
        title="Fix problems found in each track"
        action={<Switch size="small" checked={choice.fix} onChange={(_, v) => setChoice({ fix: v })} />}
      >
        <Caption>
          {choice.fix
            ? 'Each track is analyzed and corrected on its own: a dark track gets more air, a squashed one gentler compression.'
            : 'Off — the analysis is not used to correct the tracks.'}
        </Caption>
      </Step>

      <Divider />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Caption sx={{ flex: 1 }}>
          Changing these rebuilds every track's settings; manual edits and saved presets
          loaded on tracks are replaced.
        </Caption>
        <Button variant="contained" size="small" endIcon={<ArrowForwardIcon />} onClick={() => setStep('tracks')}>
          Next: each track
        </Button>
      </Box>
    </Paper>
  );
};

// Step 2: get each track right — the active track's settings, with the
// track list to move between them.
const TracksStep: React.FC = () => {
  const analyser = getAnalyserNode();
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 3 }}>
        <TrackList />
      </Grid>
      <Grid size={{ xs: 12, md: 4.5 }}>
        <TrackPanel />
      </Grid>
      <Grid size={{ xs: 12, md: 4.5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ProcessorPipeline />
          <Spectrum analyser={analyser} />
          <LUFSMeter />
        </Box>
      </Grid>
    </Grid>
  );
};

const TrackList: React.FC = () => {
  const tracks = useStore((s) => s.tracks);
  const activeTrackId = useStore((s) => s.activeTrackId);
  const setActiveTrack = useStore((s) => s.setActiveTrack);
  const removeTrack = useStore((s) => s.removeTrack);
  const options = useStore((s) => s.recipeOptions);
  // Live fields of the active track (its tracks[] entry is stale).
  const liveCustomPreset = useStore((s) => s.customPreset);
  const liveParamsEdited = useStore((s) => s.paramsEdited);
  const liveRecipe = useStore((s) => s.recipe);

  const select = (id: string) => {
    if (id === activeTrackId) return;
    stopPlayback();
    setActiveTrack(id);
  };

  return (
    <Paper sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>Tracks</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => pickAudioFiles(true, addAlbumFiles)} sx={{ fontSize: '0.7rem' }}>
          Add
        </Button>
      </Box>
      {tracks.map((t, i) => {
        const active = t.id === activeTrackId;
        const st = active
          ? { ...t.settings, customPreset: liveCustomPreset, paramsEdited: liveParamsEdited, recipe: liveRecipe }
          : t.settings;
        const styleName = st.style === null ? null
          : st.style === '' ? 'no style' : options?.styles.find((o) => o.id === st.style)?.name ?? st.style;
        const fixes = st.recipe?.fixes ?? 0;
        return (
          <Box
            key={t.id}
            onClick={() => select(t.id)}
            role="button"
            aria-current={active ? 'true' : undefined}
            sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.6, borderRadius: 1, cursor: 'pointer',
              bgcolor: active ? 'rgba(108,99,255,0.15)' : 'transparent',
              '&:hover': { bgcolor: active ? 'rgba(108,99,255,0.18)' : 'rgba(255,255,255,0.04)' },
              '&:hover .remove': { opacity: 1 },
            }}
          >
            <Tooltip title={st.reviewed ? 'Checked: you listened to its preview' : 'Not checked yet'}>
              <Box sx={{ width: 16, display: 'flex', justifyContent: 'center' }}>
                {st.reviewed
                  ? <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                  : <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{i + 1}</Typography>}
              </Box>
            </Tooltip>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontSize: '0.75rem', fontWeight: active ? 600 : 400 }}>
                {t.name}
              </Typography>
              <Typography variant="body2" noWrap sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
                {!t.analysis ? 'analyzing…'
                  : st.customPreset !== null ? `preset “${st.customPreset}”`
                    : [
                      styleName && `style: ${styleName}`,
                      st.recipe && (fixes === 0 ? 'nothing to fix' : `${fixes} fix${fixes > 1 ? 'es' : ''}`),
                      st.paramsEdited && 'edited',
                    ].filter(Boolean).join(' · ') || '…'}
              </Typography>
            </Box>
            {tracks.length > 1 && (
              <Tooltip title="Remove from the album">
                <IconButton
                  className="remove"
                  size="small"
                  onClick={(e) => { e.stopPropagation(); stopPlayback(); removeTrack(t.id); }}
                  sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25 }}
                  aria-label={`Remove ${t.name}`}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      })}
      <Caption sx={{ mt: 1 }}>
        Click a track to work on it. Listen to each one with A/B — a check mark
        shows the ones you've heard.
      </Caption>
    </Paper>
  );
};

// The active track's own settings: its style (the album's unless
// changed), the fixes from its own analysis, the result, saved presets.
const TrackPanel: React.FC = () => {
  const options = useStore((s) => s.recipeOptions);
  const albumStyle = useStore((s) => s.choice.style);
  const index = useStore((s) => s.tracks.findIndex((t) => t.id === s.activeTrackId));
  const track = useStore((s) => s.tracks.find((t) => t.id === s.activeTrackId));
  const count = useStore((s) => s.tracks.length);
  const fromChoice = useStore((s) => s.customPreset === null);
  const setActiveTrack = useStore((s) => s.setActiveTrack);
  const setStep = useStore((s) => s.setAlbumStep);
  if (!track) return null;

  const own = track.settings.style;
  const effective = own ?? albumStyle;
  const albumStyleName = albumStyle === '' ? 'none' : options?.styles.find((o) => o.id === albumStyle)?.name ?? albumStyle;
  const go = (i: number) => {
    const s = useStore.getState();
    const t = s.tracks[i];
    if (!t) return;
    stopPlayback();
    setActiveTrack(t.id);
  };
  const setStyle = (id: string) => {
    useStore.getState().setTrackSettings(track.id, {
      style: id === ALBUM_STYLE ? null : id,
      customPreset: null,
    });
  };

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box>
        <Typography variant="body2" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
          Track {index + 1} of {count}
        </Typography>
        <Typography variant="h6" noWrap sx={{ fontSize: '0.9rem' }}>{track.name}</Typography>
      </Box>

      <Step n={1} title="Style" hint={`the album's is ${albumStyleName}`}>
        <StyleChipsWithAlbum
          selected={fromChoice ? (own === null ? ALBUM_STYLE : own) : null}
          albumLabel={`Album's (${albumStyleName})`}
          onSelect={setStyle}
        />
        <Caption>
          {own === null
            ? 'Same character as the rest of the album.'
            : 'This track has its own character — e.g. a quiet acoustic song on a rock album.'}
        </Caption>
      </Step>

      <Step n={2} title="Problems found in this track">
        <FixList subject="track" expectStyle={effective} />
      </Step>

      <Divider />

      <ResultSummary
        expectStyle={effective}
        footer="Listen with A/B and fine-tune any stage of the chain. Its level against the other tracks is set in step 3."
      />
      <ResultChips />

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} disabled={index <= 0} onClick={() => go(index - 1)}>
          Previous
        </Button>
        <Box sx={{ flex: 1 }} />
        {index < count - 1 ? (
          <Button size="small" variant="outlined" endIcon={<ArrowForwardIcon />} onClick={() => go(index + 1)}>
            Next track
          </Button>
        ) : (
          <Button size="small" variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => setStep('balance')}>
            Next: album balance
          </Button>
        )}
      </Box>

      <Divider />
      <PresetsSection hint="Save this track's settings, or load a saved preset onto it." />
    </Paper>
  );
};

const ALBUM_STYLE = '__album';

const StyleChipsWithAlbum: React.FC<{
  selected: string | null;
  albumLabel: string;
  onSelect: (id: string) => void;
}> = ({ selected, albumLabel, onSelect }) => (
  <Box>
    <Box sx={{ mb: 0.5 }}>
      <Chip
        label={albumLabel}
        size="small"
        onClick={() => onSelect(ALBUM_STYLE)}
        variant={selected === ALBUM_STYLE ? 'filled' : 'outlined'}
        color={selected === ALBUM_STYLE ? 'primary' : 'default'}
        sx={{ fontSize: '0.7rem' }}
      />
    </Box>
    <StyleChips selected={selected} onSelect={onSelect} />
  </Box>
);

