// Carrying the link codes between devices: as a QR code to show or to read
// with the camera, or as text to copy.
//
// Shared file: keep live_prompter/src/utils/qrCode.ts and
// gig_anim/src/utils/qrCode.ts identical.
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

/** The camera is only offered on https pages and on localhost. */
export const canScanQrCodes = Boolean(navigator.mediaDevices?.getUserMedia);

const SCAN_WIDTH = 640;

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Plain http pages have no clipboard API, and it may also refuse: copy
    // from a selected text field instead
    const field = document.createElement('textarea');
    field.value = text;
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
}

/** A QR code image for `text`, as a data URL. */
export function qrCodeDataUrl(text: string, cellSize = 6): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(cellSize, cellSize * 4);
}

/**
 * Shows the camera in `video` and calls `onCode` with each QR code it reads.
 * Resolves with the function that stops the camera.
 */
export async function scanQrCodes(video: HTMLVideoElement, onCode: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  let frame = 0;

  const readFrame = () => {
    if (video.videoWidth > 0) {
      // A smaller frame is plenty to read a code and keeps each pass fast
      const scale = Math.min(1, SCAN_WIDTH / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (code?.data) onCode(code.data);
    }
    frame = requestAnimationFrame(readFrame);
  };
  frame = requestAnimationFrame(readFrame);

  return () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };
}
