import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Select,
    MenuItem,
    TextField,
    FormControl,
    InputLabel,
    Typography,
    Dialog,
    SelectChangeEvent,
    Divider
} from '@mui/material';
import { LyricDisplay } from './LyricDisplay';
import { PerformanceData, Track, Album, AnimationType } from '../types';
import { fetchPerformanceData, savePerformanceData, fetchAlbums } from '../api/endpoints';
import { defaultTheme, themes } from '../themes';
import { AlbumSelectionDialog } from './AlbumSelectionDialog';
import { useExternalCommands } from '../context/ExternalCommandsContext';
import { usePlayback } from '../context/PlaybackContext';

import './EditMode.css';

interface EditModeProps {
    performanceFile: string;
    wsUrl: string;
    onWsUrlChange: (url: string) => void;
}

export const EditMode: React.FC<EditModeProps> = ({
    performanceFile,
    wsUrl,
    onWsUrlChange
}) => {
    const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [isAlbumDialogOpen, setIsAlbumDialogOpen] = useState<boolean>(false);
    const { setEnabled } = useExternalCommands();
    const { isPlaying, currentTrackIndex, setCurrentTrackIndex, setCurrentTrack } = usePlayback();

    useEffect(() => {
        const loadData = async () => {
            try {
                const [perfData, albumsData] = await Promise.all([
                    fetchPerformanceData(performanceFile),
                    fetchAlbums()
                ]);
                setPerformanceData(perfData);
                setAlbums(albumsData);
            } catch (error) {
                console.error("Error loading data:", error);
            }
        };
        loadData();
    }, [performanceFile]);

    useEffect(() => {
        if (performanceData) {
            setCurrentTrack(performanceData.tracks[currentTrackIndex]);
        }
    }, [performanceData, currentTrackIndex, setCurrentTrack]);

    const handleTrackChange = (event: SelectChangeEvent<number>): void => {
        if (event.target.value || event.target.value === 0) {
            setCurrentTrackIndex(event.target.value as number);
        }
    };

    const handleThemeChange = (event: SelectChangeEvent<string>): void => {
        if (performanceData && performanceData.tracks[currentTrackIndex]) {
            const updatedTracks = [...performanceData.tracks];
            updatedTracks[currentTrackIndex] = {
                ...updatedTracks[currentTrackIndex],
                theme: event.target.value as string
            };
            setPerformanceData({ ...performanceData, tracks: updatedTracks });
        }
    };

    const handleDelayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (performanceData && performanceData.tracks[currentTrackIndex]) {
            const updatedTracks = [...performanceData.tracks];
            updatedTracks[currentTrackIndex] = {
                ...updatedTracks[currentTrackIndex],
                animationDelay: parseInt(event.target.value)
            };
            setPerformanceData({ ...performanceData, tracks: updatedTracks });
        }
    };

    const handleFullscreen = () => {
        const panel = document?.querySelector(".preview-panel");
        if (panel) {
            panel.requestFullscreen();
            setEnabled(true);
        }
    }

    const handleSave = () => {
        if (performanceData) {
            savePerformanceData(performanceFile, performanceData);
        }
    };

    const handleTracksSelected = (selectedTracks: Track[], selectedAlbums: Album[]) => {
        if (performanceData) {
            setPerformanceData(prevData => {

                if (!prevData) return null;

                return {
                    ...prevData,
                    tracks: selectedTracks.map(track => ({
                        ...track,
                        theme: track.theme || 'default',
                        animationDelay: track.animationDelay || 0
                    })),
                    albums: selectedAlbums,
                }

            });
        }
        setIsAlbumDialogOpen(false);
    };

    const handleNewProject = () => {
        setPerformanceData({
            title: 'New Project',
            date: new Date().toISOString().split('T')[0],
            albums: [],
            tracks: [],
            themes: []
        });
    };

    const handleOpenProject = async () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const content = e.target?.result as string;
                    const data: PerformanceData = JSON.parse(content);

                    const tracks = data.tracks.map((t) => ({ ...t, id: t.url }));

                    data.tracks = tracks;

                    setPerformanceData(data);
                };
                reader.readAsText(file);
            }
        };
        fileInput.click();
    };

    const handleAnimationTypeChange = (event: SelectChangeEvent<AnimationType>) => {
        if (performanceData && performanceData.tracks[currentTrackIndex]) {
            const updatedTracks = [...performanceData.tracks];
            updatedTracks[currentTrackIndex] = {
                ...updatedTracks[currentTrackIndex],
                animationType: event.target.value as AnimationType
            };
            setPerformanceData({ ...performanceData, tracks: updatedTracks });
        }
    };

    if (!performanceData || !albums) {
        return <div>Loading...</div>;
    }

    const currentTrack = performanceData.tracks[currentTrackIndex];

    return (
        <div className="edit-mode">
            <div className="preview-panel">
                {isPlaying && currentTrack && <LyricDisplay
                    performanceData={performanceData}
                    currentTrack={currentTrack}
                />}
            </div>
            <div className="properties-panel">
                <Typography variant="h6" gutterBottom color="black">Properties</Typography>
                <FormControl fullWidth margin="normal">
                    <InputLabel id="theme-select-label">Track</InputLabel>
                    <Select
                        label="Track"
                        id="track-select"
                        value={currentTrackIndex}
                        onChange={handleTrackChange}
                    >
                        {performanceData.tracks.map((track, index) => (
                            <MenuItem key={track.id} value={index}>
                                <Box display="flex" alignItems="center">
                                    <img
                                        src={`/data/${albums.find(a => a.id === track.albumId)?.coverImage}`}
                                        alt={track.albumId}
                                        style={{ width: 30, height: 30, marginRight: 10 }}
                                    />
                                    {track.title}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel id="theme-select-label">Theme</InputLabel>
                    <Select<string>
                        label="Theme"
                        id="theme-select"
                        value={currentTrack && currentTrack.theme ? currentTrack.theme : defaultTheme.name}
                        onChange={handleThemeChange}
                    >
                        {themes.map(theme => (
                            <MenuItem key={theme.name} value={theme.name}>{theme.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <InputLabel id="animation-type-select-label">Animation Type</InputLabel>
                    <Select<AnimationType>
                        label="Animation Type"
                        id="animation-type-select"
                        value={currentTrack && currentTrack.animationType ? currentTrack.animationType : "default"}
                        onChange={handleAnimationTypeChange}
                    >
                        <MenuItem value="carousel">Carousel</MenuItem>
                        <MenuItem value="constellation">Constellation</MenuItem>
                        <MenuItem value="default">Default</MenuItem>
                        <MenuItem value="fade">Fade</MenuItem>
                        <MenuItem value="falling">Falling</MenuItem>
                        <MenuItem value="manuscript">Manuscript</MenuItem>
                        <MenuItem value="none">None</MenuItem>
                        <MenuItem value="grid">Grid</MenuItem>
                        <MenuItem value="spiral">Spiral</MenuItem>
                        <MenuItem value="teletype">Teletype</MenuItem>
                        <MenuItem value="typewriter">Typewriter</MenuItem>
                        <MenuItem value="typography">Typography</MenuItem>
                        <MenuItem value="wall">Wall</MenuItem>
                        <MenuItem value="wave">Wave</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    fullWidth
                    margin="normal"
                    label="Delay (ms)"
                    type="number"
                    value={currentTrack && currentTrack.animationDelay ? currentTrack.animationDelay : 0}
                    onChange={handleDelayChange}
                />
                <Box mb={2}>
                    <Button variant="outlined" color="secondary" onClick={() => setIsAlbumDialogOpen(true)} fullWidth>
                        Select Albums and Tracks
                    </Button>
                </Box>
                <Box mb={2}>
                    <Button variant="contained" color="primary" onClick={handleNewProject} fullWidth>
                        New Project
                    </Button>
                </Box>
                <Box mb={2}>
                    <Button variant="contained" color="primary" onClick={handleOpenProject} fullWidth>
                        Open Project
                    </Button>
                </Box>
                <Box mt={2}>
                    <Button variant="contained" color="primary" onClick={handleSave} fullWidth>
                        Save to File
                    </Button>
                </Box>
                <Divider variant="middle" component="li" />
                <Box mt={2}>
                    <Button variant="contained" color="success" onClick={handleFullscreen} fullWidth>
                        Fullscreen
                    </Button>
                </Box>
                <Divider variant="middle" component="li" />
                <Box mt={2}>
                    <TextField
                        fullWidth
                        margin="normal"
                        label="WebSocket URL"
                        value={wsUrl}
                        onChange={(e) => onWsUrlChange(e.target.value)}
                        helperText="WebSocket server URL for player integration"
                    />
                </Box>
            </div>
            <Dialog
                open={isAlbumDialogOpen}
                onClose={() => setIsAlbumDialogOpen(false)}
                fullWidth
                maxWidth="md"
            >
                <AlbumSelectionDialog
                    albums={albums}
                    initialTracks={performanceData ? performanceData.tracks : []}
                    onTracksSelected={handleTracksSelected}
                    onClose={() => setIsAlbumDialogOpen(false)}
                />
            </Dialog>
        </div>
    );
};