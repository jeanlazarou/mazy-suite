// A direct link between live_prompter and gig_anim over WebRTC, with no server
// in between: the prompter creates an invite code, gig_anim answers it with a
// reply code, and the user carries each code across (QR code or copied text).
// Then the prompter tells gig_anim which track it is on, whether it plays and
// where it is in the song.
//
// Shared file: keep live_prompter/src/utils/peerLink.ts and
// gig_anim/src/utils/peerLink.ts identical.

/** What the prompter sends, on linking and whenever it changes. */
export interface PrompterState {
  type: 'state';
  track: { url: string; title: string } | null;
  playing: boolean;
}

/**
 * Where the prompter is in the song, for animations synced to it: sent on
 * every change of track or play state, then every second while playing.
 */
export interface PrompterTime {
  type: 'time';
  position: number; // seconds into the track
  playing: boolean;
}

export type LinkStatus =
  | 'off'          // no link
  | 'waiting'      // a code was made, waiting for the other side
  | 'linked'
  | 'interrupted'  // the network dropped, the link may come back by itself
  | 'lost';        // closed by the other side or failed: link again

export function isPrompterState(data: unknown): data is PrompterState {
  return typeof data === 'object' && data !== null && (data as PrompterState).type === 'state';
}

export function isPrompterTime(data: unknown): data is PrompterTime {
  return typeof data === 'object' && data !== null && (data as PrompterTime).type === 'time';
}

// Both devices are on the same network, so no STUN or TURN server: host
// candidates are enough, and nothing ever leaves the local network.
const ICE_GATHERING_TIMEOUT = 3000;

export class PeerLink {
  private readonly pc = new RTCPeerConnection();
  private channel: RTCDataChannel | null = null;
  private closed = false;
  private readonly onStatus: (status: LinkStatus) => void;
  private readonly onMessage: (data: unknown) => void;

  private constructor(onStatus: (status: LinkStatus) => void, onMessage: (data: unknown) => void) {
    this.onStatus = onStatus;
    this.onMessage = onMessage;

    this.pc.onconnectionstatechange = () => {
      if (this.closed) return;
      switch (this.pc.connectionState) {
        case 'disconnected':
          onStatus('interrupted');
          break;
        case 'connected':
          if (this.channel?.readyState === 'open') onStatus('linked');
          break;
        case 'failed':
          onStatus('lost');
          break;
      }
    };
  }

  /** Prompter side: starts a link and returns the invite to give gig_anim. */
  static async invite(onStatus: (status: LinkStatus) => void): Promise<{ link: PeerLink; invite: string }> {
    const link = new PeerLink(onStatus, () => {});
    link.attach(link.pc.createDataChannel('prompter'));
    await link.pc.setLocalDescription(await link.pc.createOffer());
    return { link, invite: await link.localCode() };
  }

  /** Prompter side: completes the link with gig_anim's reply. */
  async acceptReply(reply: string): Promise<void> {
    await this.pc.setRemoteDescription(decodeCode(reply, 'answer'));
  }

  /** gig_anim side: answers an invite and returns the reply to give the prompter. */
  static async answer(
    invite: string,
    onStatus: (status: LinkStatus) => void,
    onMessage: (data: unknown) => void,
  ): Promise<{ link: PeerLink; reply: string }> {
    const offer = decodeCode(invite, 'offer');
    const link = new PeerLink(onStatus, onMessage);
    link.pc.ondatachannel = (event) => link.attach(event.channel);
    await link.pc.setRemoteDescription(offer);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    return { link, reply: await link.localCode() };
  }

  send(data: unknown): void {
    if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(data));
  }

  /** Closes the link; its status callback is not called any more. */
  close(): void {
    this.closed = true;
    this.pc.close();
  }

  private attach(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => !this.closed && this.onStatus('linked');
    channel.onclose = () => !this.closed && this.onStatus('lost');
    channel.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (error) {
        console.error('Unreadable message from the linked app:', error);
      }
    };
  }

  private async localCode(): Promise<string> {
    await new Promise<void>((resolve) => {
      if (this.pc.iceGatheringState === 'complete') return resolve();
      const timeout = setTimeout(resolve, ICE_GATHERING_TIMEOUT);
      this.pc.onicegatheringstatechange = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };
    });
    return encodeCode(this.pc.localDescription!);
  }
}

// A full session description is ~700 characters, too dense a QR code for a
// laptop camera to read off another screen. A code keeps only what differs
// from one link to the next, comma separated, and the receiving side rebuilds
// the description around it:
//
//   kind (i = invite, ra/rp = reply with DTLS setup active/passive), mid,
//   ice-ufrag, ice-pwd, sha-256 certificate fingerprint (base64url),
//   then one address:port per UDP host candidate.
const SETUP_BY_KIND: Record<string, { type: RTCSdpType; setup: string }> = {
  i: { type: 'offer', setup: 'actpass' },
  ra: { type: 'answer', setup: 'active' },
  rp: { type: 'answer', setup: 'passive' },
};

function encodeCode({ type, sdp }: RTCSessionDescription): string {
  const field = (name: string) => sdp.match(new RegExp(`^a=${name}:([^\\r\\n]*)`, 'm'))?.[1].trim() ?? '';

  const [algorithm, fingerprint] = field('fingerprint').split(' ');
  if (algorithm.toLowerCase() !== 'sha-256') {
    throw new Error(`Unsupported certificate fingerprint: ${algorithm}`);
  }
  const candidates = [...sdp.matchAll(/^a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/gim)]
    .map(([, address, port]) => `${address}:${port}`);
  if (candidates.length === 0) {
    throw new Error('No network connection found');
  }

  const kind = type === 'offer' ? 'i' : field('setup') === 'passive' ? 'rp' : 'ra';
  const bytes = fingerprint.split(':').map((hex) => parseInt(hex, 16));
  return [kind, field('mid'), field('ice-ufrag'), field('ice-pwd'), toBase64Url(bytes), ...candidates].join(',');
}

function decodeCode(code: string, expected: RTCSdpType): RTCSessionDescriptionInit {
  const [kind, mid, ufrag, pwd, fingerprint, ...candidates] = code.replace(/\s+/g, '').split(',');
  const description = SETUP_BY_KIND[kind];

  if (!description || !fingerprint || candidates.length === 0) {
    throw new Error("That isn't a link code");
  }
  if (description.type !== expected) {
    throw new Error(expected === 'answer'
      ? "That's the prompter's own invite: this needs gig_anim's reply"
      : "That's a reply: this needs the prompter's invite");
  }

  const fingerprintBytes = fromBase64Url(fingerprint);
  if (fingerprintBytes.length !== 32 || !ufrag || !pwd) {
    throw new Error("That isn't a link code");
  }
  const hex = fingerprintBytes
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(':');
  const candidateLines = candidates.map((candidate, index) => {
    const separator = candidate.lastIndexOf(':');
    const address = candidate.slice(0, separator);
    const port = candidate.slice(separator + 1);
    return `a=candidate:${index + 1} 1 udp ${2113937151 - index} ${address} ${port} typ host`;
  });

  const sdp = [
    'v=0',
    `o=- ${Date.now()} 2 IN IP4 127.0.0.1`,
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...candidateLines,
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${hex}`,
    `a=setup:${description.setup}`,
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    '',
  ].join('\r\n');

  return { type: description.type, sdp };
}

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): number[] {
  try {
    return Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
  } catch {
    throw new Error("That isn't a link code");
  }
}
