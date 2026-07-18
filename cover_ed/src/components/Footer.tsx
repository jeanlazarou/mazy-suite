import React from 'react';
import { Group, Text, ActionIcon, useMantineColorScheme } from '@mantine/core';
import { IconSun, IconMoonStars } from '@tabler/icons-react';

interface FooterProps {
  version: string;
}

export const Footer: React.FC<FooterProps> = ({ version }) => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group mt="xl" pb="md">
      <Text size="xs" color="dimmed">Ver. {version}</Text>
      <ActionIcon
        variant="subtle"
        color={colorScheme === 'dark' ? 'yellow' : 'blue'}
        onClick={() => toggleColorScheme()}
        title="Toggle color scheme"
      >
        {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoonStars size={18} />}
      </ActionIcon>
    </Group>
  );
};
