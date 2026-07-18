import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { MantineEmotionProvider } from '@mantine/emotion';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MantineEmotionProvider>
      <MantineProvider defaultColorScheme={'dark'}>
        <App />
      </MantineProvider>
    </MantineEmotionProvider>
  </React.StrictMode>,
);