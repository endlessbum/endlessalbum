import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCaptured: (file: File, kind: 'photo' | 'video') => void;
};

export default function EphemeralCapture({ open, onOpenChange, onCaptured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const isRecordingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (!open) return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch {}
    })();
    return () => {
      cancelledRef.current = true;
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.stop();
      }
      recorderRef.current = null;
      chunksRef.current = [];
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      isRecordingRef.current = false;
      setIsRecording(false);
      setTimeLeft(10);
    };
  }, [open]);

  const takePhoto = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png', 0.92));
    if (!blob) return;
    const file = new File([blob], `ephemeral_${Date.now()}.png`, { type: 'image/png' });
    onCaptured(file, 'photo');
    onOpenChange(false);
  };

  const startRecord = () => {
    if (!streamRef.current || isRecording) return;
    const rec = new MediaRecorder(streamRef.current, { mimeType: 'video/webm;codecs=vp9,opus' });
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      if (cancelledRef.current) {
        cancelledRef.current = false;
        return;
      }
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `ephemeral_${Date.now()}.webm`, { type: 'video/webm' });
      onCaptured(file, 'video');
      onOpenChange(false);
      setTimeLeft(10);
      isRecordingRef.current = false;
      setIsRecording(false);
    };
    rec.start();
    cancelledRef.current = false;
    isRecordingRef.current = true;
    setIsRecording(true);
    setTimeLeft(10);
    const start = Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const remain = Math.max(0, 10 - elapsed);
      setTimeLeft(remain);
      if (!isRecordingRef.current) return;
      if (remain === 0) {
        stopRecord();
      } else {
        setTimeout(tick, 200);
      }
    };
    setTimeout(tick, 200);
  };

  const stopRecord = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    isRecordingRef.current = false;
    setIsRecording(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Эфемерная камера</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <video ref={videoRef} muted playsInline className="w-full rounded-lg bg-black" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Фото или видео до 10 сек</span>
            {isRecording && <span>Осталось: {timeLeft}s</span>}
          </div>
        </div>
        <DialogFooter className="gap-2">
          {!isRecording ? (
            <>
              <Button onClick={takePhoto} data-testid="ephemeral-capture-photo">Снимок</Button>
              <Button onClick={startRecord} variant="secondary" data-testid="ephemeral-capture-video">Запись 10s</Button>
              <Button onClick={() => onOpenChange(false)} variant="outline" data-testid="button-ephemeral-capture">Закрыть</Button>
            </>
          ) : (
            <Button onClick={stopRecord} variant="destructive" data-testid="ephemeral-capture-stop">Стоп</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
