import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Copy, X } from 'lucide-react';
import { GigAnimLink } from '../hooks/useGigAnimLink';
import { canScanQrCodes, copyText, qrCodeDataUrl } from '../utils/qrCode';
import { QrScanner } from './QrScanner';

interface GigAnimLinkDialogProps {
  link: GigAnimLink;
  onClose: () => void;
}

export function GigAnimLinkDialog({ link, onClose }: GigAnimLinkDialogProps) {
  const { status, invite, error, start, acceptReply, unlink } = link;
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const previousStatus = useRef(status);
  const inviteQrCode = useMemo(() => (invite ? qrCodeDataUrl(invite) : null), [invite]);

  // Linking is what the dialog is for: once it's made, get out of the way
  useEffect(() => {
    if (status === 'linked' && previousStatus.current !== 'linked') onClose();
    previousStatus.current = status;
  }, [status, onClose]);

  useEffect(() => {
    if (status !== 'waiting') setConnecting(false);
  }, [status]);

  useEffect(() => {
    setReply('');
    setReplyError(null);
    setCopied(false);
  }, [invite]);

  const connect = async (code: string) => {
    setReplyError(null);
    try {
      await acceptReply(code);
      setConnecting(true);
    } catch (e) {
      setReplyError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    await copyText(invite);
    setCopied(true);
  };

  const handleScanned = (code: string) => {
    setScanning(false);
    setReply(code);
    connect(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[28rem] max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Link gig_anim</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {status === 'waiting' && invite && (
          <>
            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium text-gray-900">1.</span> In gig_anim (ctrl+e, then <em>Prompter link</em>),
              scan or paste this invite.
            </p>
            {inviteQrCode && <img src={inviteQrCode} alt="Invite QR code" className="mx-auto mb-2" />}
            <div className="flex gap-2 mb-4">
              <input
                readOnly
                value={invite}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-lg bg-gray-50"
              />
              <button
                onClick={copyInvite}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              <span className="font-medium text-gray-900">2.</span> Then bring back gig_anim's reply.
            </p>
            {scanning ? (
              <QrScanner onCode={handleScanned} onCancel={() => setScanning(false)} />
            ) : (
              <div className="flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Paste the reply here"
                  rows={2}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono border border-gray-300 rounded-lg resize-none"
                />
                <div className="flex flex-col gap-2">
                  {canScanQrCodes && (
                    <button
                      onClick={() => setScanning(true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <Camera className="w-4 h-4" /> Scan
                    </button>
                  )}
                  <button
                    onClick={() => connect(reply)}
                    disabled={!reply.trim() || connecting}
                    className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                  >
                    Connect
                  </button>
                </div>
              </div>
            )}
            {replyError && <p className="mt-2 text-sm text-red-600">{replyError}</p>}
            {connecting && <p className="mt-2 text-sm text-gray-600">Connecting…</p>}
          </>
        )}

        {status === 'linked' && (
          <p className="text-sm text-gray-600 mb-4">
            gig_anim follows the track you're on, and when you play or pause.
          </p>
        )}

        {status === 'interrupted' && (
          <p className="text-sm text-gray-600 mb-4">
            The network dropped. The link usually comes back by itself; if it doesn't, link again.
          </p>
        )}

        {(status === 'off' || status === 'lost') && (
          <p className="text-sm text-gray-600 mb-4">
            {status === 'lost' ? 'The link to gig_anim was lost. ' : ''}
            Linking lets gig_anim follow the track you're on, and when you play or pause.
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          {status !== 'off' && (
            <button
              onClick={unlink}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {status === 'waiting' ? 'Cancel' : 'Unlink'}
            </button>
          )}
          {status !== 'waiting' && (
            <button
              onClick={start}
              className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              {status === 'off' ? 'Create invite' : 'Link again'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
