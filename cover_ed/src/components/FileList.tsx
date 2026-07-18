import React from 'react';
import { Pagination } from '@mantine/core';
import { createStyles } from '@mantine/emotion';
import { FileCard } from './FileCard';
import { Mp3File } from '../types';

const useStyles = createStyles((theme) => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: theme.spacing.md,
  },
}));

interface FileListProps {
  files: Mp3File[];
  selectedFiles: string[];
  setSelectedFiles: (files: string[]) => void;
  setEditingFile: (file: Mp3File | null) => void;
  playingFile: Mp3File | null;
  setPlayingFile: (file: Mp3File | null) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  selectedFiles,
  setSelectedFiles,
  setEditingFile,
  playingFile,
  setPlayingFile,
  audioRef,
}) => {
  const { classes } = useStyles();
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 12;

  const paginatedFiles = files.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <>
      <div className={classes.grid}>
        {paginatedFiles.map((file, index) => (
          <FileCard
            key={index}
            file={file}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            setEditingFile={setEditingFile}
            playingFile={playingFile}
            setPlayingFile={setPlayingFile}
            audioRef={audioRef}
          />
        ))}
      </div>
      <Pagination
        total={Math.ceil(files.length / itemsPerPage)}
        onChange={setCurrentPage}
        mt="md"
      />
    </>
  );
};
