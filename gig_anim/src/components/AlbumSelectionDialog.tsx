import React, { useState, useEffect, useCallback } from 'react';
import {
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Grid,
    Card,
    CardContent,
    CardMedia,
    Typography,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    Box,
    styled,
    IconButton
} from '@mui/material';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import DeleteIcon from '@mui/icons-material/Delete';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Album, Track } from '../types';
import { fetchAlbumTracks } from '../api/endpoints';

const ScrollableSection = styled(Box)({
    height: '60vh',
    overflowY: 'auto',
    padding: '10px',
    '&::-webkit-scrollbar': {
        width: '0.4em'
    },
    '&::-webkit-scrollbar-track': {
        boxShadow: 'inset 0 0 6px rgba(0,0,0,0.00)',
        webkitBoxShadow: 'inset 0 0 6px rgba(0,0,0,0.00)'
    },
    '&::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgba(0,0,0,.1)',
        outline: '1px solid slategrey'
    }
});

const ColumnHeader = styled(Typography)({
    position: 'sticky',
    top: 0,
    backgroundColor: 'white',
    zIndex: 1,
    paddingTop: '10px',
    paddingBottom: '10px',
});

interface DraggableListItemProps {
    id: string;
    text: string;
    index: number;
    moveListItem: (dragIndex: number, hoverIndex: number) => void;
    onRemove: (id: string) => void;
}

const DraggableListItem: React.FC<DraggableListItemProps> = ({ id, text, index, moveListItem, onRemove }) => {
    const [{ isDragging }, drag] = useDrag({
        type: 'list-item',
        item: { id, index },
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    });

    const [, drop] = useDrop({
        accept: 'list-item',
        hover(item: { id: string; index: number }) {
            if (item.index !== index) {
                moveListItem(item.index, index);
                item.index = index;
            }
        },
    });

    return (
        <ListItem
            ref={(node) => drag(drop(node))}
            style={{ opacity: isDragging ? 0.5 : 1, cursor: 'move' }}
        >
            <DragIndicatorIcon style={{ marginRight: 8 }} />
            <ListItemText primary={text} />
            <IconButton edge="end" aria-label="delete" onClick={() => onRemove(id)}>
                <DeleteIcon />
            </IconButton>
        </ListItem>
    );
};

interface AlbumSelectionDialogProps {
    albums: Album[];
    initialTracks: Track[];
    onTracksSelected: (tracks: Track[], albums: Album[]) => void;
    onClose: () => void;
}

export const AlbumSelectionDialog: React.FC<AlbumSelectionDialogProps> = ({
    albums,
    initialTracks,
    onTracksSelected,
    onClose
}) => {
    const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
    const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
    const [selectedTracks, setSelectedTracks] = useState<Track[]>(initialTracks);
    const [selectedAlbums, setSelectedAlbums] = useState<Album[]>([]);

    useEffect(() => {
        if (selectedAlbum) {
            fetchAlbumTracks(selectedAlbum.id).then(setAlbumTracks);
        }
    }, [selectedAlbum]);

    useEffect(() => {
        // Initialize selectedAlbums based on initialTracks
        const initialAlbums = initialTracks.reduce((acc: Album[], track) => {
            const album = albums.find(a => a.id === track.albumId);
            if (album && !acc.some(a => a.id === album.id)) {
                acc.push(album);
            }
            return acc;
        }, []);
        setSelectedAlbums(initialAlbums);
    }, [initialTracks, albums]);

    const handleAlbumClick = (album: Album) => {
        setSelectedAlbum(album);
    };

    const handleTrackToggle = (track: Track) => {
        setSelectedTracks(prev => {
            if (prev.some(t => t.id === track.id)) {
                // Remove track
                const newTracks = prev.filter(t => t.id !== track.id);
                // Update albums
                const newAlbums = newTracks.reduce((acc: Album[], t) => {
                    const album = albums.find(a => a.id === t.albumId);
                    if (album && !acc.some(a => a.id === album.id)) {
                        acc.push(album);
                    }
                    return acc;
                }, []);
                setSelectedAlbums(newAlbums);
                return newTracks;
            } else {
                // Add track
                const newTracks = [...prev, track];
                // Update albums
                if (selectedAlbum && !selectedAlbums.some(a => a.id === selectedAlbum.id)) {
                    setSelectedAlbums([...selectedAlbums, selectedAlbum]);
                }
                return newTracks;
            }
        });
    };

    const moveListItem = useCallback((dragIndex: number, hoverIndex: number) => {
        setSelectedTracks((prevTracks) => {
            const newTracks = [...prevTracks];
            const draggedTrack = newTracks[dragIndex];
            newTracks.splice(dragIndex, 1);
            newTracks.splice(hoverIndex, 0, draggedTrack);
            return newTracks;
        });
    }, []);

    const handleSave = () => {
        onTracksSelected(selectedTracks, selectedAlbums);
    };

    const handleClearAll = () => {
        setSelectedTracks([]);
        setSelectedAlbums([]);
    };

    const handleRemoveTrack = (trackId: string) => {
        setSelectedTracks(prev => {
            const newTracks = prev.filter(t => t.id !== trackId);
            // Update albums
            const newAlbums = newTracks.reduce((acc: Album[], t) => {
                const album = albums.find(a => a.id === t.albumId);
                if (album && !acc.some(a => a.id === album.id)) {
                    acc.push(album);
                }
                return acc;
            }, []);
            setSelectedAlbums(newAlbums);
            return newTracks;
        });
    };

    return (
        <>
            <DialogTitle>Select Albums and Tracks</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} style={{ height: '70vh' }}>
                    <Grid item xs={4} style={{ height: '100%', overflowY: 'auto' }}>
                        <ColumnHeader variant="h6">Albums</ColumnHeader>
                        <ScrollableSection>
                            <Grid container spacing={2}>
                                {albums.map((album) => (
                                    <Grid item xs={6} key={album.id}>
                                        <Card
                                            onClick={() => handleAlbumClick(album)}
                                            style={{
                                                cursor: 'pointer',
                                                border: selectedAlbum?.id === album.id ? '2px solid blue' : 'none',
                                                height: '100%'
                                            }}
                                        >
                                            <CardMedia
                                                component="img"
                                                height="140"
                                                image={`/data/${album.coverImage}`}
                                                alt={album.name}
                                            />
                                            <CardContent>
                                                <Typography variant="body2">{album.name}</Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </ScrollableSection>
                    </Grid>
                    <Grid item xs={4} style={{ height: '100%', overflowY: 'auto' }}>
                        <ColumnHeader variant="h6">Tracks</ColumnHeader>
                        <ScrollableSection>
                            {selectedAlbum && (
                                <List dense>
                                    {albumTracks.map((track) => (
                                        <ListItem key={track.id}>
                                            <Checkbox
                                                edge="start"
                                                checked={selectedTracks.some(t => t.id === track.id)}
                                                onChange={() => handleTrackToggle(track)}
                                            />
                                            <ListItemText
                                                primary={track.title}
                                                secondary={`${track.authors.join(', ')} - ${track.creationDate}`}
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </ScrollableSection>
                    </Grid>
                    <Grid item xs={4} style={{ height: '100%', overflowY: 'auto' }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                            <ColumnHeader variant="h6">Selected Tracks</ColumnHeader>
                            <IconButton onClick={handleClearAll} title="Clear all tracks">
                                <ClearAllIcon />
                            </IconButton>
                        </Box>
                        <DndProvider backend={HTML5Backend}>
                            <List>
                                {selectedTracks.map((track: Track, index: number) => (
                                    <DraggableListItem
                                        key={track.id}
                                        id={track.id}
                                        text={track.title}
                                        index={index}
                                        moveListItem={moveListItem}
                                        onRemove={handleRemoveTrack}
                                    />
                                ))}
                            </List>
                        </DndProvider>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} color="primary">Save</Button>
            </DialogActions>
        </>
    );
};