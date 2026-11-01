import { useState, useEffect, useRef, useCallback } from 'react';
import { PeerLink, LinkStatus, PrompterState } from '../utils/peerLink';

/**
 * The optional link to gig_anim: `start` makes an invite, `acceptReply` takes
 * gig_anim's reply. Once linked, `state` is sent each time it changes.
 */
export function useGigAnimLink(state: PrompterState) {
  const [status, setStatus] = useState<LinkStatus>('off');
  const [invite, setInvite] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkRef = useRef<PeerLink | null>(null);

  const unlink = useCallback(() => {
    linkRef.current?.close();
    linkRef.current = null;
    setInvite(null);
    setError(null);
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    unlink();
    try {
      const { link, invite } = await PeerLink.invite(setStatus);
      linkRef.current = link;
      setInvite(invite);
      setStatus('waiting');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [unlink]);

  // Throws when the reply isn't one, for the dialog to show
  const acceptReply = useCallback(async (reply: string) => {
    if (!linkRef.current) return;
    await linkRef.current.acceptReply(reply);
  }, []);

  useEffect(() => {
    if (status === 'linked') linkRef.current?.send(state);
  }, [state, status]);

  useEffect(() => () => linkRef.current?.close(), []);

  return { status, invite, error, start, acceptReply, unlink };
}

export type GigAnimLink = ReturnType<typeof useGigAnimLink>;
