'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}

/**
 * A live `getUserMedia` preview with a shutter button, rear-camera-first on phones. There is no
 * separate "no camera" fallback screen inside this component — the caller (Scan to PDF's
 * workspace) already offers file upload as a sibling action, so a permission denial or a
 * desktop with no camera just shows this panel's own inline error and the user picks "Upload
 * instead" outside it.
 */
export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera capture is not supported in this browser.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        if (!cancelled)
          setError('Camera access was denied or is unavailable. Upload a photo instead.');
      }
    })();

    return () => {
      cancelled = true;
      for (const track of streamRef.current?.getTracks() ?? []) track.stop();
      streamRef.current = null;
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob);
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Photograph a page</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close camera"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>

        <div className="bg-cream relative flex aspect-video items-center justify-center overflow-hidden rounded-xl">
          {error ? (
            <span className="text-danger flex max-w-xs items-center gap-2 p-4 text-center text-sm">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              {error}
            </span>
          ) : (
            <video ref={videoRef} muted playsInline className="size-full object-contain" />
          )}
        </div>

        {!error && (
          <Button
            onClick={capture}
            disabled={!ready}
            className="mx-auto h-14 w-14 rounded-full p-0"
          >
            <Camera aria-hidden className="size-6" />
            <span className="sr-only">Capture</span>
          </Button>
        )}
      </div>
    </div>
  );
}
