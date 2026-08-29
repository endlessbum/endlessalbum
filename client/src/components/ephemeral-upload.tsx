import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: (file: File, kind: 'photo' | 'video') => void;
};

export default function EphemeralUpload({ open, onOpenChange, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const isVideo = useMemo(() => !!file && file.type.startsWith('video/'), [file]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setUrl(null);
      setDuration(0);
      setTrimStart(0);
      setIsTrimming(false);
      return;
    }
    setTimeout(() => inputRef.current?.click(), 0);
  }, [open]);

  useEffect(() => {
    if (url && isVideo) {
      if (!videoRef.current) return;
      const v = videoRef.current;
      const onLoaded = () => {
        setDuration(v.duration || 0);
      };
      v.addEventListener('loadedmetadata', onLoaded);
      return () => v.removeEventListener('loadedmetadata', onLoaded);
    }
  }, [url, isVideo]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (url) URL.revokeObjectURL(url);
    setUrl(f ? URL.createObjectURL(f) : null);
  };

  const confirm = async () => {
    if (!file) return;
    if (!isVideo) {
      onUploaded(file, 'photo');
      onOpenChange(false);
      return;
    }

    if (duration <= 10 + 0.01) {
      onUploaded(file, 'video');
      onOpenChange(false);
      return;
    }

    try {
      setIsTrimming(true);
      const trimmed = await trimVideo(file, trimStart, 10);
      onUploaded(trimmed, 'video');
      onOpenChange(false);
    } catch {
    } finally {
      setIsTrimming(false);
    }
  };

  const trimVideo = async (file: File, start: number, length: number) => {
    const src = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((res) => video.addEventListener('loadedmetadata', () => res(), { once: true }));
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const stream = (canvas as HTMLCanvasElement).captureStream(30);
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

    await new Promise<void>((res) => {
      video.currentTime = Math.max(0, Math.min(start, Math.max(0, video.duration - length)));
      video.addEventListener('seeked', () => res(), { once: true });
    });

    recorder.start();

    let stopped = false;
    const stopTimer = setTimeout(() => { stopped = true; recorder.stop(); }, length * 1000);

    const draw = () => {
      if (stopped) return;
      ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(draw);
    };

    video.play().catch(() => {});
    requestAnimationFrame(draw);

    await new Promise<void>((res) => recorder.addEventListener('stop', () => res(), { once: true }));
    clearTimeout(stopTimer);

    const blob = new Blob(chunks, { type: 'video/webm' });
    URL.revokeObjectURL(src);
    return new File([blob], `ephemeral_trim_${Date.now()}.webm`, { type: 'video/webm' });
  };

  const sliderMax = useMemo(() => Math.max(0, Math.floor(Math.max(0, duration - 10))), [duration]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Эфемерная загрузка</DialogTitle>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={onPick}
        />

        <div className="space-y-3">
          {!file && (
            <div className="text-sm text-muted-foreground">Выберите фото или видео с устройства для отправки как эфемерное</div>
          )}

          {file && !isVideo && url && (
            <img src={url} alt="Предпросмотр" className="max-h-[360px] rounded-lg" />
          )}

          {file && isVideo && (
            <div className="space-y-2">
              <video ref={videoRef} src={url || undefined} className="w-full rounded-lg bg-black" controls muted playsInline />
              {duration > 10 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Длительность: {Math.round(duration)}с</span>
                    <span>Отрезок: 10с</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sliderMax}
                    step={1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Number(e.target.value))}
                    className="w-full"
                    data-testid="ephemeral-trim-slider"
                  />
                  <div className="text-xs text-muted-foreground">Начало: {trimStart}s · Конец: {Math.min(sliderMax, trimStart + 10)}s</div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!file || isTrimming} onClick={confirm} data-testid="ephemeral-upload-confirm">
            {isTrimming ? 'Обрезаем…' : 'Отправить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
