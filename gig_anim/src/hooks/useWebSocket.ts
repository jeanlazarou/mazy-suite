import { useState, useEffect, useRef } from 'react';

interface WebSocketMessage {
  type: 'trackStart' | 'trackStop';
  trackId?: string;
  timestamp: number;
}

interface WebSocketConfig {
  wsUrl: string;
  onMessage: (message: WebSocketMessage) => void;
}

// Global connection state
let globalSocket: WebSocket | null = null;
let globalUrl: string | null = null;
let reconnectTimeout: number | null = null;
let messageHandlers: Set<(data: WebSocketMessage) => void> = new Set();

function createConnection(url: string) {
  // Clear any existing reconnect timeout
  if (reconnectTimeout !== null) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const ws = new WebSocket(`${url}/ws/subscribe`);
  globalSocket = ws;
  globalUrl = url;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      channel: "player",
      payload: null
    }));
  };

  ws.onmessage = (event) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);
      // Notify all current handlers
      messageHandlers.forEach(handler => handler(data));
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  };

  ws.onerror = (event) => {
    console.error('WebSocket error:', event);
  };

  ws.onclose = () => {
    // Only clear global references if this is still the active socket
    if (globalSocket === ws) {
      globalSocket = null;
      globalUrl = null;
    }

    // Schedule reconnection
    if (!reconnectTimeout) {
      reconnectTimeout = window.setTimeout(() => {
        reconnectTimeout = null;
        if (globalSocket === null && url === globalUrl) {
          createConnection(url);
        }
      }, 5000);
    }
  };

  return ws;
}

export const useWebSocket = ({ wsUrl, onMessage }: WebSocketConfig) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageHandler = useRef(onMessage);

  // Update message handler ref when callback changes
  useEffect(() => {
    messageHandler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    // Register this instance's message handler
    messageHandlers.add(messageHandler.current);

    // If we already have a connection to this URL, reuse it
    if (globalSocket && globalUrl === wsUrl && globalSocket.readyState !== WebSocket.CLOSED) {
      setIsConnected(globalSocket.readyState === WebSocket.OPEN);
    } else {
      // Create new connection
      const ws = createConnection(wsUrl);

      // Set up connection state handling for this instance
      const handleOpen = () => setIsConnected(true);
      const handleClose = () => setIsConnected(false);
      const handleError = () => setError('WebSocket connection error');

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('close', handleClose);
      ws.addEventListener('error', handleError);

      return () => {
        // Clean up event listeners
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('close', handleClose);
        ws.removeEventListener('error', handleError);
      };
    }

    // Cleanup function
    return () => {
      messageHandlers.delete(messageHandler.current);
    };
  }, [wsUrl]);

  return { isConnected, error };
};