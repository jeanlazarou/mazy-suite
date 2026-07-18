import React, { useState, useEffect } from 'react';
import { Group, TextInput, Select, Button } from '@mantine/core';
import { Mp3File } from '../types';

interface SearchAndSortProps {
  files: Mp3File[];
  setFilteredFiles: (files: Mp3File[]) => void;
  selectedFiles: string[];
  setBulkEditing: (editing: boolean) => void;
}

export const SearchAndSort: React.FC<SearchAndSortProps> = ({
  files,
  setFilteredFiles,
  selectedFiles,
  setBulkEditing,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<string>('title');

  useEffect(() => {
    let sorted = [...files].sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'artist') return (a.artist || '').localeCompare(b.artist || '');
      if (sortBy === 'album') return (a.album || '').localeCompare(b.album || '');
      return 0;
    });

    const filtered = sorted.filter(file =>
      file.title?.toLowerCase().includes(search.toLowerCase()) ||
      file.artist?.toLowerCase().includes(search.toLowerCase()) ||
      file.album?.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredFiles(filtered);
  }, [search, files, sortBy, setFilteredFiles]);

  return (
    <Group mb="md">
      <TextInput
        placeholder="Search files..."
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <Select
        placeholder="Sort by"
        value={sortBy}
        onChange={(value) => setSortBy(value || 'title')}
        data={[
          { value: 'title', label: 'Title' },
          { value: 'artist', label: 'Artist' },
          { value: 'album', label: 'Album' },
        ]}
      />
      <Button onClick={() => setBulkEditing(true)} disabled={selectedFiles.length === 0}>
        Bulk Edit
      </Button>
    </Group>
  );
};
