import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, TextField, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { useExternalCommands } from '../context/ExternalCommandsContext';
import { LinkStatus } from '../utils/peerLink';
import { canScanQrCodes, copyText, qrCodeDataUrl, scanQrCodes } from '../utils/qrCode';

const STATUS_TEXT: Record<LinkStatus, { text: string; color: string }> = {
    off: { text: 'Not linked', color: '#9e9e9e' },
    waiting: { text: 'Waiting for the prompter to take the reply', color: '#ffa000' },
    linked: { text: 'Following the prompter', color: '#2e7d32' },
    interrupted: { text: 'Network dropped, waiting for it to come back', color: '#ffa000' },
    lost: { text: 'Link lost: ask the prompter for a new invite', color: '#d32f2f' },
};

/** Links gig_anim to the live_prompter, which then drives the show. */
export const PrompterLink: React.FC = () => {
    const { linkStatus, reply, acceptInvite, unlink } = useExternalCommands();
    const [invite, setInvite] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [linking, setLinking] = useState(false);
    const replyQrCode = useMemo(() => (reply ? qrCodeDataUrl(reply, 4) : null), [reply]);
    const replyRef = useRef<HTMLDivElement>(null);
    const status = STATUS_TEXT[linkStatus];

    // The section sits at the bottom of the panel: bring the reply into view
    useEffect(() => {
        if (reply) replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [reply]);

    const link = async (code: string) => {
        setError(null);
        setLinking(true);
        try {
            await acceptInvite(code);
            setInvite('');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLinking(false);
        }
    };

    const handleScanned = (code: string) => {
        setScanning(false);
        setInvite(code);
        link(code);
    };

    return (
        <Box mt={2}>
            <Typography variant="subtitle1" color="black">Prompter link</Typography>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Box width={8} height={8} borderRadius="50%" bgcolor={status.color} flexShrink={0} />
                <Typography variant="body2" color="text.secondary">{status.text}</Typography>
            </Box>

            {reply && (
                <Box ref={replyRef}>
                    <Typography variant="body2" color="text.secondary">
                        On the prompter, scan or paste this reply.
                    </Typography>
                    {replyQrCode && (
                        <Box textAlign="center" my={1}>
                            <img src={replyQrCode} alt="Reply QR code" style={{ maxWidth: '100%' }} />
                        </Box>
                    )}
                    <TextField
                        fullWidth
                        size="small"
                        value={reply}
                        slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } } }}
                        onFocus={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Box display="flex" gap={1} mt={1}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<ContentCopyIcon />}
                            onClick={() => copyText(reply)}
                        >
                            Copy
                        </Button>
                        <Button variant="text" size="small" onClick={unlink}>Cancel</Button>
                    </Box>
                </Box>
            )}

            {(linkStatus === 'linked' || linkStatus === 'interrupted') && (
                <Button variant="outlined" size="small" onClick={unlink}>Unlink</Button>
            )}

            {(linkStatus === 'off' || linkStatus === 'lost') && (
                <>
                    <TextField
                        fullWidth
                        multiline
                        minRows={2}
                        margin="dense"
                        label="Invite from the prompter"
                        value={invite}
                        onChange={(e) => setInvite(e.target.value)}
                        error={Boolean(error)}
                        helperText={error ?? 'In the prompter, click "Link gig_anim"'}
                        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
                    />
                    <Box display="flex" gap={1}>
                        {canScanQrCodes && (
                            <Button variant="outlined" size="small" startIcon={<QrCodeScannerIcon />} onClick={() => setScanning(true)}>
                                Scan
                            </Button>
                        )}
                        <Button variant="contained" size="small" disabled={!invite.trim() || linking} onClick={() => link(invite)}>
                            Link
                        </Button>
                    </Box>
                </>
            )}

            <Dialog open={scanning} onClose={() => setScanning(false)} fullWidth maxWidth="sm">
                <DialogContent>
                    {scanning && <QrScanner onCode={handleScanned} />}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setScanning(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const QrScanner: React.FC<{ onCode: (text: string) => void }> = ({ onCode }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const onCodeRef = useRef(onCode);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        onCodeRef.current = onCode;
    }, [onCode]);

    useEffect(() => {
        let stop: (() => void) | null = null;
        let cancelled = false;

        scanQrCodes(videoRef.current!, (text) => onCodeRef.current(text))
            .then((stopScan) => (cancelled ? stopScan() : (stop = stopScan)))
            .catch((e) => setError(`Camera unavailable: ${e instanceof Error ? e.message : e}`));

        return () => {
            cancelled = true;
            stop?.();
        };
    }, []);

    return (
        <>
            <video ref={videoRef} style={{ width: '100%', background: 'black' }} muted playsInline />
            {error && <Typography color="error" variant="body2">{error}</Typography>}
        </>
    );
};
