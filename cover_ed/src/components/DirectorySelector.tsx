import React from 'react';
import { Button, Group, Breadcrumbs, Text } from '@mantine/core';
import { open } from '@tauri-apps/plugin-dialog';

interface DirectorySelectorProps {
  currentDir: string;
  setCurrentDir: (dir: string) => void;
}

export const DirectorySelector: React.FC<DirectorySelectorProps> = ({ currentDir, setCurrentDir }) => {
  const handleSelectDirectory = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      setCurrentDir(selected);
    }
  };

  const breadcrumbs = currentDir.split('/').map((part, index, array) => (
    <Text
      key={index}
      style={{ cursor: 'pointer' }}
      onClick={() => setCurrentDir(array.slice(0, index + 1).join('/'))}
    >
      {part || 'Root'}
    </Text>
  ));

  return (
    <>
      <Group mb="md">
        <Button onClick={handleSelectDirectory}>Select Directory</Button>
      </Group>
      <Breadcrumbs mb="md">{breadcrumbs}</Breadcrumbs>
    </>
  );
};
