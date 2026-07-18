import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ExternalCommandsContextType {
  wsUrl: string;
  setWsUrl: (url: string) => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const ExternalCommandsContext = createContext<ExternalCommandsContextType | null>(null);

interface ExternalCommandsProviderProps {
  children: ReactNode;
  defaultWsUrl?: string;
  startEnabled: boolean;
}

export const ExternalCommandsProvider: React.FC<ExternalCommandsProviderProps> = ({ 
  children, 
  defaultWsUrl = 'ws://localhost:51987',
  startEnabled 
}) => {
  const [wsUrl, setWsUrl] = useState(defaultWsUrl);
  const [enabled, setEnabled] = useState(startEnabled);

  // Disable external commands when in edit mode
  useEffect(() => {
    setEnabled(startEnabled);
  }, [startEnabled]);

  return (
    <ExternalCommandsContext.Provider value={{
      wsUrl,
      setWsUrl,
      enabled,
      setEnabled
    }}>
      {children}
    </ExternalCommandsContext.Provider>
  );
};

export const useExternalCommands = () => {
  const context = useContext(ExternalCommandsContext);
  if (!context) {
    throw new Error('useExternalCommands must be used within an ExternalCommandsProvider');
  }
  return context;
};