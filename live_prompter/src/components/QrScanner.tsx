import { useEffect, useRef, useState } from 'react';
import { scanQrCodes } from '../utils/qrCode';

interface QrScannerProps {
  onCode: (text: string) => void;
  onCancel: () => void;
}

export function QrScanner({ onCode, onCancel }: QrScannerProps) {
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
    <div className="flex flex-col gap-2">
      <video ref={videoRef} className="w-full rounded-lg bg-black" muted playsInline />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={onCancel}
        className="self-end px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
