import React from 'react';
import { Card, Image, Text, Group, Button, Checkbox, ActionIcon } from '@mantine/core';
import { IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';
import { createStyles } from '@mantine/emotion';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Mp3File } from '../types';
import { toImageUrl } from '../utils';

const useStyles = createStyles((_theme) => ({
  card: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    height: '100%',
  },
  imageContainer: {
    width: '100%',
    paddingBottom: '100%',
    position: 'relative',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noCover: {
    position: 'absolute',
    top: 82,
    left: 82,
  }
}));

interface FileCardProps {
  file: Mp3File;
  selectedFiles: string[];
  setSelectedFiles: (files: string[]) => void;
  setEditingFile: (file: Mp3File | null) => void;
  playingFile: Mp3File | null;
  setPlayingFile: (file: Mp3File | null) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export const FileCard: React.FC<FileCardProps> = ({
  file,
  selectedFiles,
  setSelectedFiles,
  setEditingFile,
  playingFile,
  setPlayingFile,
  audioRef,
}) => {
  const { classes } = useStyles();

  const handlePlayPause = (file: Mp3File) => {
    if (playingFile?.path === file.path) {
      if (audioRef.current?.paused) {
        audioRef.current.play();
      } else {
        audioRef.current?.pause();
      }
    } else {
      audioRef.current?.pause();

      setPlayingFile(file);
      if (audioRef.current) {
        audioRef.current.src = convertFileSrc(file.path);
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      }
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder style={{ width: 250 }} className={classes.card}>
      <Card.Section>
        <Image
          src={toImageUrl(file)}
          height={250}
          width={250}
          fit="cover"
          alt="Album cover"
        />
        {!file.cover_art && <Text size="xl" className={classes.noCover}>No cover</Text>}
      </Card.Section>
      <Group mt="md" mb="xs">
        <Text>{file.title || 'Unknown Title'}</Text>
        <Checkbox
          checked={selectedFiles.includes(file.path)}
          onChange={(event) => {
            if (event.currentTarget.checked) {
              setSelectedFiles([...selectedFiles, file.path]);
            } else {
              setSelectedFiles(selectedFiles.filter(path => path !== file.path));
            }
          }}
        />
      </Group>
      <Text size="sm" color="dimmed">{file.artist || 'Unknown Artist'}</Text>
      <Text size="sm" color="dimmed">{file.album || 'Unknown Album'}</Text>
      <Group mt="md">
        <Button variant="light" onClick={() => setEditingFile(file)}>
          Edit Metadata
        </Button>
        <ActionIcon onClick={() => handlePlayPause(file)}>
          {playingFile?.path === file.path && !audioRef.current?.paused ? (
            <IconPlayerPause size={18} />
          ) : (
            <IconPlayerPlay size={18} />
          )}
        </ActionIcon>
      </Group>
    </Card>
  );
};