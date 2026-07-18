import React, { useEffect } from 'react';
import { Box, Paper, Typography, Button, Chip, Alert, CircularProgress, Tooltip } from '@mui/material';
import HeadphonesIcon from '@mui/icons-material/Headphones';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import MonitorIcon from '@mui/icons-material/Monitor';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import BluetoothIcon from '@mui/icons-material/Bluetooth';
import TuneIcon from '@mui/icons-material/Tune';
import CheckIcon from '@mui/icons-material/Check';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { TARGET_LABELS } from '../../store/constants';

const TARGET_ICONS: Record<string, React.ReactNode> = {
  neutral: <TuneIcon sx={{ fontSize: 18 }} />,
  headphones: <HeadphonesIcon sx={{ fontSize: 18 }} />,
  car: <DirectionsCarIcon sx={{ fontSize: 18 }} />,
  studio: <MonitorIcon sx={{ fontSize: 18 }} />,
  phone: <PhoneAndroidIcon sx={{ fontSize: 18 }} />,
  bluetooth: <BluetoothIcon sx={{ fontSize: 18 }} />,
};

export const AnalysisPanel: React.FC = () => {
  const { applyRecommendations, processAudio, fetchRecommendation } = useAudioEngine();
  const analysis = useStore((s) => s.analysis);
  const processedAnalysis = useStore((s) => s.processedAnalysis);
  const isAnalyzing = useStore((s) => s.isAnalyzing);
  const isProcessing = useStore((s) => s.isProcessing);
  const recommendation = useStore((s) => s.recommendation);
  const recommendationScope = useStore((s) => s.recommendationScope);
  const isAlbum = useStore((s) => s.tracks.length > 1);
  const allTracksAnalyzed = useStore((s) => s.tracks.length > 1 && s.tracks.every((t) => t.analysis !== null));
  const selectedTarget = useStore((s) => s.selectedTarget);
  const appliedTarget = useStore((s) => s.appliedTarget);
  const paramsEdited = useStore((s) => s.paramsEdited);
  const setSelectedTarget = useStore((s) => s.setSelectedTarget);

  // Keep the recommendation in sync with the selected target: whenever an
  // analysis exists but the recommendation is missing, belongs to another
  // target, or should upgrade from track- to album-scoped (once every
  // track's analysis has arrived), refetch.
  useEffect(() => {
    const stale = !recommendation
      || recommendation.target !== selectedTarget
      || (allTracksAnalyzed && recommendationScope === 'track');
    if (analysis && stale) {
      fetchRecommendation(selectedTarget);
    }
  }, [selectedTarget, analysis, recommendation, allTracksAnalyzed, recommendationScope]);

  const handleApplyRec = async () => {
    await applyRecommendations(selectedTarget);
    await processAudio();
  };

  // The recommendation on screen is only actionable if it belongs to the
  // currently selected target.
  const recReady = !!recommendation && recommendation.target === selectedTarget;
  // Applied and still pristine vs. applied but edited since (re-apply snaps back).
  const isApplied = appliedTarget !== null && appliedTarget === selectedTarget && !paramsEdited;
  const isAppliedButEdited = appliedTarget !== null && appliedTarget === selectedTarget && paramsEdited;

  const scopeNote = isAlbum
    ? ' Settings are shared by every track of the album.'
    : '';
  const targetPhrase = selectedTarget === 'neutral'
    ? 'corrective adjustments from the analysis (no device compensation)'
    : `adjustments for ${TARGET_LABELS[selectedTarget]}`;
  const applyTooltip = !analysis
    ? 'Waiting for audio analysis…'
    : isApplied
      ? `${TARGET_LABELS[selectedTarget]} recommendations are applied.${scopeNote}`
      : isAppliedButEdited
        ? `Settings were edited since applying; re-apply to restore the ${TARGET_LABELS[selectedTarget]} recommendations.${scopeNote}`
        : isAlbum
          ? `Apply ${targetPhrase} to the shared chain, based on the whole album's analysis, then reprocess.${scopeNote}`
          : `Apply ${targetPhrase} on top of the current settings, then reprocess`;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ fontSize: '0.9rem', mb: 2 }}>
        Analysis & Recommendations
      </Typography>

      {/* Target selector */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {Object.entries(TARGET_LABELS).map(([key, label]) => (
          <Chip
            key={key}
            icon={appliedTarget === key ? <CheckIcon sx={{ fontSize: 16 }} /> : (TARGET_ICONS[key] as any)}
            label={appliedTarget === key ? `${label} ✓` : label}
            onClick={() => setSelectedTarget(key)}
            variant={selectedTarget === key ? 'filled' : 'outlined'}
            color={appliedTarget === key ? 'success' : selectedTarget === key ? 'primary' : 'default'}
            size="small"
            sx={{ fontSize: '0.7rem' }}
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        <Tooltip title={applyTooltip}>
          <span>
            <Button
              variant="contained"
              size="small"
              color={isApplied ? 'success' : 'primary'}
              onClick={handleApplyRec}
              disabled={!recReady || isApplied || isAnalyzing || isProcessing}
              startIcon={isApplied ? <CheckIcon sx={{ fontSize: 16 }} /> : undefined}
              sx={{ fontSize: '0.75rem' }}
            >
              {isApplied
                ? (isAlbum ? 'Applied to Album' : 'Applied')
                : isAppliedButEdited
                  ? 'Re-apply'
                  : (isAlbum ? 'Apply to Album' : 'Apply Recommendations')}
            </Button>
          </span>
        </Tooltip>
        {isAnalyzing && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <CircularProgress size={12} />
            <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              Analyzing audio…
            </Typography>
          </Box>
        )}
      </Box>

      {!isAnalyzing && (
        <Typography variant="body2" sx={{ fontSize: '0.7rem', color: 'text.secondary', mb: 1 }}>
          Presets on the left set a starting point; apply adjustments for a
          listening target on top of them. Suggestions are based on the
          original audio, which is analyzed automatically.
        </Typography>
      )}

      {/* Analysis summary: original, and processed once available */}
      {analysis && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1 }}>
            Audio Characteristics
            {processedAnalysis && (
              <Typography component="span" sx={{ fontSize: '0.65rem', color: 'text.secondary', ml: 1 }}>
                original → processed
              </Typography>
            )}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <InfoChip
              label="Balance"
              value={analysis.spectrum?.spectral_balance || 'N/A'}
              processed={processedAnalysis?.spectrum?.spectral_balance}
            />
            <InfoChip
              label="Peak"
              value={`${analysis.dynamics?.peak_db.toFixed(1)} dB`}
              processed={processedAnalysis && `${processedAnalysis.dynamics?.peak_db.toFixed(1)} dB`}
            />
            <InfoChip
              label="LUFS"
              value={`${analysis.loudness?.integrated_lufs.toFixed(1)}`}
              processed={processedAnalysis && `${processedAnalysis.loudness?.integrated_lufs.toFixed(1)}`}
            />
            <InfoChip
              label="DR"
              value={`${analysis.dynamics?.dynamic_range_db.toFixed(1)} dB`}
              processed={processedAnalysis && `${processedAnalysis.dynamics?.dynamic_range_db.toFixed(1)} dB`}
            />
            {analysis.stereo_field && (
              <InfoChip
                label="Width"
                value={`${(analysis.stereo_field.width * 100).toFixed(0)}%`}
                processed={processedAnalysis?.stereo_field && `${(processedAnalysis.stereo_field.width * 100).toFixed(0)}%`}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Recommendations */}
      {recReady && recommendation!.suggestions.length > 0 && (
        <Box>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 1 }}>
            Suggestions for {TARGET_LABELS[recommendation!.target] || recommendation!.target}
            {recommendationScope === 'album' && (
              <Typography component="span" sx={{ fontSize: '0.65rem', color: 'text.secondary', ml: 0.75 }}>
                based on the whole album
              </Typography>
            )}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {recommendation!.suggestions.map((s, i) => (
              <Alert
                key={i}
                severity={s.priority === 'high' ? 'warning' : s.priority === 'medium' ? 'info' : 'success'}
                sx={{
                  py: 0, px: 1.5,
                  '& .MuiAlert-message': { fontSize: '0.7rem', py: 0.5 },
                  '& .MuiAlert-icon': { fontSize: 16, mr: 1, py: 0.75 },
                }}
              >
                <strong>{s.category}:</strong> {s.description}
              </Alert>
            ))}
          </Box>
        </Box>
      )}
    </Paper>
  );
};

const InfoChip: React.FC<{
  label: string;
  value: string;
  processed?: string | null | false;
}> = ({ label, value, processed }) => (
  <Box sx={{
    px: 1.5, py: 0.5, borderRadius: 1,
    bgcolor: 'rgba(108,99,255,0.08)',
    border: 1, borderColor: 'rgba(108,99,255,0.15)',
  }}>
    <Typography variant="body2" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>{label}</Typography>
    <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
      {processed && processed !== value ? (
        <>
          <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{value}</Typography>
          {' → '}{processed}
        </>
      ) : value}
    </Typography>
  </Box>
);
