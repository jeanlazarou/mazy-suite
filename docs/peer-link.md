# Linking live_prompter and gig_anim without a server

On stage, [live_prompter](../live_prompter/) plays the backing tracks and
[gig_anim](../gig_anim/) projects the animations, usually on two devices.
Once linked, gig_anim follows the prompter: it switches to the track the
prompter is on, shows its animation while the prompter plays and hides it while
it is paused or stopped. The `spotlight` animation also follows where the
prompter is in the song, line by line.

This document describes how the two apps talk to each other, and why it is
built that way.

## Constraints

- **No server.** Both apps are static builds on plain file servers: a
  `python3 -m http.server`, an Apache folder, GitHub Pages. Nothing runs
  besides the browsers.
- **Same local network, no internet needed.** A venue's connection is not
  something to count on.
- **Plain `http` is a normal deployment.** It means no camera, no clipboard
  API and no `crypto.randomUUID()`, all of which browsers only offer on
  `https` and `localhost` pages.
- **The link is optional.** Each app works on its own. The prompter starts a
  link only when someone asks for one.

## Why WebRTC, and why by hand

A web page cannot accept incoming connections. WebSocket and WebTransport
always need a server on one end. The only direct browser-to-browser channel is
a **WebRTC data channel**. Once open, it works much like a WebSocket: messages
in both directions, reliable and ordered.

Before it opens, though, each side has to hand the other a *session
description* (SDP). That carries its network addresses and ports, its ICE
credentials and the fingerprint of the certificate that encrypts the channel.
Knowing the other device's IP address is not enough. Usually a "signaling
server" carries the two descriptions. Here, **the user carries them by hand**:
the prompter shows an *invite*, gig_anim answers with a *reply*, each as a QR
code and as text.

Alternatives that were considered:

| Option | Why not |
|---|---|
| A WebSocket relay (tried first, inside the prompter's Vite dev server) | Needs a running server, so no static builds |
| A public signaling service, e.g. PeerJS's | Needs internet at the venue, and a third party staying up |
| `BroadcastChannel` / `localStorage` events | Same browser only |

## The handshake

```
 live_prompter                      user                       gig_anim
 ─────────────                      ────                       ────────
 "Link gig_anim"
 createOffer, wait for ICE ──► invite (QR / text) ──►
                                                      setRemoteDescription(offer)
                                                      createAnswer, wait for ICE
                             ◄── reply (QR / text) ◄──
 setRemoteDescription(answer)
 ◄═══════════════ data channel "prompter" opens ════════════════►
 status: linked                                        status: linked
```

- **No trickle ICE.** Each side waits until candidate gathering is complete
  (at most 3 s), so each description carries all of its candidates and one
  hand-off per direction is enough.
- **No STUN or TURN server.** Only *host* candidates are gathered: the
  device's own addresses on the local network. That is all two devices on the
  same network need, and nothing ever leaves it. Browsers hide local IPs
  behind random `<uuid>.local` names, resolved over mDNS on the network. On a
  page with camera access (scanning a QR code), Chrome shows the real IP
  instead.
- The prompter creates the one data channel, labelled `prompter`. gig_anim
  receives it with `ondatachannel`.

## Compact codes

A full session description is about 700 characters. As a QR code that is
about version 21 (101 modules a side), too dense for a laptop webcam to read
off another screen. Compression barely helps, since the content is mostly
random: deflate only takes it to about 500. But only a few fields differ from
one link to the next. A code keeps just those, comma separated:

```
i,0,Ucbl,nlmyy2z9fNlGmfRVRxzLe774,_lfYe21Y88cRAulR39660hr6rbaKJzrKV5qvbkhMDbA,d781040c-…-036023745b77.local:56433,cae080d6-…-3fe96.local:56924
│ │ │    │                        │                                           └ one address:port per UDP host candidate
│ │ │    │                        └ sha-256 certificate fingerprint, 32 bytes, base64url
│ │ │    └ ice-pwd
│ │ └ ice-ufrag
│ └ mid of the data channel's media section
└ kind: i = invite (offer, setup actpass); ra / rp = reply (answer, setup active / passive)
```

That is 175 to 190 characters, a version 9 or 10 QR code (53–57 modules a
side, error correction level M). With real IPs instead of `.local` names, it
is about 140.

The receiving side rebuilds a complete description from a fixed template for a
data-channel-only session:

```
v=0
o=- <now> 2 IN IP4 127.0.0.1
s=-
t=0 0
a=group:BUNDLE <mid>
m=application 9 UDP/DTLS/SCTP webrtc-datachannel
c=IN IP4 0.0.0.0
a=candidate:<n> 1 udp <priority> <address> <port> typ host     (one per candidate)
a=end-of-candidates
a=ice-ufrag:<ufrag>
a=ice-pwd:<pwd>
a=fingerprint:sha-256 <hex fingerprint>
a=setup:<actpass | active | passive>
a=mid:<mid>
a=sctp-port:5000
a=max-message-size:262144
```

The rebuilt description is only ever set as the *remote* description. Neither
browser's own local description is edited, so this is not "SDP munging" in the
sense browsers are restricting. This was tested between two Chrome processes
and between Chrome and Firefox in both directions, but not with Safari.

Decoding also catches a wrong code before anything is created:
- text that isn't a code at all ("That isn't a link code")
- an invite pasted where a reply is expected, or the other way round, each
  with its own message

## Carrying the codes

| | Shown as | Taken in by |
|---|---|---|
| Invite | QR code + text with Copy, in the prompter's "Link gig_anim" dialog | gig_anim, editor panel (ctrl+e), *Prompter link*: Scan or paste |
| Reply | QR code + text with Copy, in that same panel | the prompter's dialog: Scan or paste |

- QR codes are drawn with `qrcode-generator` and read with `jsQR`, one camera
  frame per animation frame, scaled down to at most 640 px wide.
- **Scan** only shows where the camera is available, which means `https` or
  `localhost`.
- **Copy** falls back to selecting a hidden text field and
  `document.execCommand('copy')` when the clipboard API is missing (plain
  `http`) or refuses (no focus, no permission).
- On plain `http`, codes move by copy and paste: AirDrop, Universal
  Clipboard, a message to yourself.

## Messages

All messages are JSON on the one channel, from the prompter to gig_anim:

```ts
// On linking, then on every change of track or play state
interface PrompterState {
  type: 'state';
  track: { url: string; title: string } | null;
  playing: boolean;
}

// After each state message, then every second while playing
interface PrompterTime {
  type: 'time';
  position: number; // seconds into the track
  playing: boolean;
}
```

Both are *states*, not commands: a lost message is replaced by the next one,
and a gig_anim that links late is right after the first.

### What gig_anim does with them

- **Track:** gig_anim matches it to one of the performance's tracks, by url
  first, then by title (case-insensitive). The performance usually plays the
  live playback files while the prompter's albums point at the studio ones.
- **Showing:** the animation shows while the prompter plays. On a track that
  isn't in the performance, nothing shows, rather than another song's words.
- **Show mode only:** the prompter is followed in show mode and in the
  editor's fullscreen preview, but not while the editor is open. The latest
  state is kept, and applied when the editor closes.
- **Where the link lives:** in `ExternalCommandsProvider`, above the show and
  the editor, so switching between them with ctrl+e keeps the link.

### The song clock

`spotlight` needs the prompter's position several times a second. The
prompter only sends it once a second, so gig_anim counts forward from the
last one it received:

```
position = time.position + (time.playing ? (performance.now() - receivedAt) / 1000 : 0)
```

- **A ref, not React state.** The last time message is kept in a ref, so a
  message every second doesn't re-render the show; spotlight reads the ref on
  its own 50 ms tick.
- **Track changes:** a state message for another track clears the clock until
  that track's first time message arrives.
- **No wall-clock sync:** the two devices' clocks never need to agree, since
  only time elapsed since a message counts.
- **Jumps** (seek, restart) are picked up by the next time message, within a
  second.
- **Without a link,** spotlight starts its clock when the animation shows.

Measured between the prompter's actual WebAudio position and gig_anim's sweep:
within 40–60 ms, on one machine. Across two devices the network adds a few
milliseconds.

## Link status

Both sides show the same states. They come from the data channel's `open` and
`close` events and the peer connection's `connectionState`:

| Status | Meaning |
|---|---|
| `off` | no link |
| `waiting` | a code was made; waiting for the other side, then for the connection |
| `linked` | the channel is open |
| `interrupted` | `connectionState` is `disconnected`: the network dropped; WebRTC often recovers by itself |
| `lost` | the channel closed or the connection failed: link again |

**Reloading either page ends the link.** The other side sees `lost` within
moments, and pairing starts over: a new invite, a new reply. There is no way
around this without something to carry the new codes.

## Where the code is

| | live_prompter | gig_anim |
|---|---|---|
| WebRTC, codes, message types (**shared**) | [`src/utils/peerLink.ts`](../live_prompter/src/utils/peerLink.ts) | [`src/utils/peerLink.ts`](../gig_anim/src/utils/peerLink.ts) |
| QR codes, camera, copy (**shared**) | [`src/utils/qrCode.ts`](../live_prompter/src/utils/qrCode.ts) | [`src/utils/qrCode.ts`](../gig_anim/src/utils/qrCode.ts) |
| Link state, sending | [`src/hooks/useGigAnimLink.ts`](../live_prompter/src/hooks/useGigAnimLink.ts) | |
| Link state, receiving, clock | | [`src/context/ExternalCommandsContext.tsx`](../gig_anim/src/context/ExternalCommandsContext.tsx) |
| UI | [`GigAnimLinkDialog.tsx`](../live_prompter/src/components/GigAnimLinkDialog.tsx), [`QrScanner.tsx`](../live_prompter/src/components/QrScanner.tsx), the button in [`PlayerControls.tsx`](../live_prompter/src/components/PlayerControls.tsx) | [`PrompterLink.tsx`](../gig_anim/src/components/PrompterLink.tsx) |
| Following the prompter | | [`App.tsx`](../gig_anim/src/App.tsx), [`SpotlightAnimation.tsx`](../gig_anim/src/components/SpotlightAnimation.tsx) |

The two **shared** files must stay identical in both apps. Each app is built
and deployed on its own, so they are copies, not a package; after changing
one, copy it over and check with `cmp`.

## Limits and troubleshooting

- **The network must let the devices see each other.** `.local` names
  resolve over multicast. Guest Wi-Fi with client isolation, or a network
  that blocks multicast, leaves the link in `waiting` and then `lost`. Your
  own router or a phone hotspot avoids that. Test at the venue before the
  show.
- **Different networks don't work.** Without STUN or TURN there is no way
  across NATs, by design.
- **Codes are single-use.** A reply only fits the invite it answers. An old
  reply gets as far as "connecting" and then fails.
- **Browsers:** tested Chrome↔Chrome and Chrome↔Firefox. The compact codes
  assume a sha-256 fingerprint (what current browsers use) and a
  data-channel-only session.
- **Changing what is sent** means changing `peerLink.ts` in both apps, and
  deploying both: a newer prompter talking to an older gig_anim only works if
  the older one ignores what it doesn't know. The message guards
  (`isPrompterState`, `isPrompterTime`) do ignore unknown types.
