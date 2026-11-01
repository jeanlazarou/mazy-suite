import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { PeerLink, LinkStatus, PrompterState, isPrompterState } from '../utils/peerLink';

interface ExternalCommandsContextType {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  // The link to the live_prompter, kept here so it survives edit mode
  linkStatus: LinkStatus;
  reply: string | null;
  prompterState: PrompterState | null;
  acceptInvite: (invite: string) => Promise<void>;
  unlink: () => void;
}

const ExternalCommandsContext = createContext<ExternalCommandsContextType | null>(null);

interface ExternalCommandsProviderProps {
  children: ReactNode;
  startEnabled: boolean;
}

export const ExternalCommandsProvider: React.FC<ExternalCommandsProviderProps> = ({
  children,
  startEnabled
}) => {
  const [enabled, setEnabled] = useState(startEnabled);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('off');
  const [reply, setReply] = useState<string | null>(null);
  const [prompterState, setPrompterState] = useState<PrompterState | null>(null);
  const linkRef = useRef<PeerLink | null>(null);

  // Disable external commands when in edit mode
  useEffect(() => {
    setEnabled(startEnabled);
  }, [startEnabled]);

  // The reply is only needed until the prompter takes it
  useEffect(() => {
    if (linkStatus !== 'waiting') setReply(null);
  }, [linkStatus]);

  const unlink = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
    setLinkStatus('off');
  }, []);

  // Throws when the invite isn't one, for the panel to show
  const acceptInvite = useCallback(async (invite: string) => {
    const { link, reply } = await PeerLink.answer(invite, setLinkStatus, (data) => {
      if (isPrompterState(data)) setPrompterState(data);
    });
    linkRef.current?.close();
    linkRef.current = link;
    setLinkStatus('waiting');
    setReply(reply);
  }, []);

  useEffect(() => () => linkRef.current?.close(), []);

  return (
    <ExternalCommandsContext.Provider value={{
      enabled,
      setEnabled,
      linkStatus,
      reply,
      prompterState,
      acceptInvite,
      unlink
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
