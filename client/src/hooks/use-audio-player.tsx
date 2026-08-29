import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type TrackMeta = { url: string; title?: string; artist?: string; coverUrl?: string };

type AudioPlayerState = {
  current?: TrackMeta | null;
  playing: boolean;
  duration: number;
  currentTime: number;
  volume: number; // 0..1
  muted: boolean;
  queue: TrackMeta[];
  index: number; // -1 when no queue
  repeat: 'none' | 'one' | 'all';
  shuffle: boolean;
};

type AudioPlayerApi = AudioPlayerState & {
  playTrack: (track: TrackMeta) => void;
  playList: (tracks: TrackMeta[], startIndex: number) => void;
  updateTrackMeta: (
    url: string,
    meta: { title?: string; artist?: string; coverUrl?: string },
  ) => void;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  stop: () => void;
  close: () => void;
  setRepeat: (mode: 'none' | 'one' | 'all') => void;
  toggleShuffle: () => void;
  toggleMute: () => void;
};

const AudioPlayerCtx = createContext<AudioPlayerApi | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    playing: false,
    duration: 0,
    currentTime: 0,
    volume: 1,
    muted: false,
    current: null,
    queue: [],
    index: -1,
    repeat: 'all',
    shuffle: false,
  });

  const VOL_KEY = 'audio_vol_v1';
  const TRACK_KEY = 'audio_last_track_v1';
  const MODE_KEY = 'audio_repeat_v1';
  const SHUF_KEY = 'audio_shuffle_v1';
  const POS_KEY = 'audio_pos_v1'; // map url -> seconds
  const DUR_KEY = 'audio_dur_v1'; // map url -> duration seconds
  const QUEUE_KEY = 'audio_queue_v1'; // { queue: TrackMeta[], index: number }
  const lastSavedPosRef = React.useRef(0);
  const MUTE_KEY = 'audio_mute_v1';
  const audioCtxRef = useRef<AudioContext | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const FADE_MS = 200;
  const currentUrlRef = useRef<string | null>(null);
  const repeatRef = useRef<'none' | 'one' | 'all'>('all');
  const nextRef = useRef<(() => void) | null>(null);
  const prevRef = useRef<(() => void) | null>(null);
  const seekRef = useRef<((time: number) => void) | null>(null);
  const toggleRef = useRef<(() => void) | null>(null);

  const currentUrlVal = state.current?.url ?? null;
  const repeatVal: 'none' | 'one' | 'all' = state.repeat;
  useEffect(() => {
    currentUrlRef.current = currentUrlVal;
  }, [currentUrlVal]);
  useEffect(() => {
    repeatRef.current = repeatVal;
  }, [repeatVal]);

  if (!audioRef.current && typeof window !== 'undefined') {
    const el = new Audio();
    el.preload = 'metadata';
    el.crossOrigin = 'anonymous';
    try {
      const vRaw = localStorage.getItem(VOL_KEY);
      if (vRaw != null) {
        const v = Math.max(0, Math.min(1, parseFloat(vRaw)));
        if (!Number.isNaN(v)) el.volume = v;
      }
      const m = localStorage.getItem(MUTE_KEY);
      el.muted = m === '1';
    } catch {}
    audioRef.current = el;
  }
  useEffect(() => {
    const el = audioRef.current!;
    const getPosMap = (): Record<string, number> => {
      try {
        return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
      } catch {
        return {};
      }
    };
    const savePos = (url: string | null, time: number) => {
      if (!url) return;
      try {
        const map = getPosMap();
        map[url] = Math.max(0, Math.floor(time || 0));
        localStorage.setItem(POS_KEY, JSON.stringify(map));
      } catch {}
    };
    const onLoaded = () => {
      const dur = isFinite(el.duration) ? el.duration : 0;
      setState((s) => ({ ...s, duration: dur }));
      try {
        const url = el.src || currentUrlRef.current || undefined;
        if (url && dur > 0) {
          const map: Record<string, number> = JSON.parse(localStorage.getItem(DUR_KEY) || '{}') || {};
          map[url] = Math.floor(dur);
          localStorage.setItem(DUR_KEY, JSON.stringify(map));
        }
      } catch {}
      try {
        const url = el.src || currentUrlRef.current || undefined;
        if (!url) return;
        const map = getPosMap();
        const pos = Number(map[url]);
        if (pos && isFinite(pos) && pos > 0) {
          const safe = Math.min(el.duration || pos, Math.max(0, pos));
          if (safe > 0 && safe < (el.duration || Infinity) - 0.4) {
            el.currentTime = safe;
            setState((s) => ({ ...s, currentTime: safe }));
          }
        }
      } catch {}
    };
    const onTime = () => {
      setState((s) => ({ ...s, currentTime: el.currentTime }));
      try {
        const now = Date.now();
        const url = currentUrlRef.current;
        if (now - lastSavedPosRef.current > 1800 && url) {
          savePos(url, el.currentTime);
          lastSavedPosRef.current = now;
        }
      } catch {}
    };
    const onPlay = () => setState((s) => ({ ...s, playing: true }));
    const onPause = () => {
      setState((s) => ({ ...s, playing: false }));
      try {
        savePos(currentUrlRef.current, el.currentTime);
      } catch {}
    };
    const onEnd = () => {
      try {
        const url = currentUrlRef.current;
        if (url) {
          const map = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
          delete map[url];
          localStorage.setItem(POS_KEY, JSON.stringify(map));
        }
      } catch {}
      setState((s) => ({ ...s, playing: false, currentTime: 0 }));
      if (repeatRef.current === 'one') {
        el.currentTime = 0;
        const p = el.play();
        if (p && typeof p.then === 'function') p.catch(() => {});
        return;
      }
      setTimeout(() => {
        nextRef.current?.();
      }, 0);
    };
    const onVol = () => {
      setState((s) => ({ ...s, volume: el.volume, muted: el.muted }));
      try {
        localStorage.setItem(VOL_KEY, String(el.volume));
        localStorage.setItem(MUTE_KEY, el.muted ? '1' : '0');
      } catch {}
    };

    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    el.addEventListener('volumechange', onVol);
    const onBeforeUnload = () => {
      try {
        savePos(currentUrlRef.current, el.currentTime);
      } catch {}
    };
    const onVis = () => {
      if (document.hidden) {
        try {
          savePos(currentUrlRef.current, el.currentTime);
        } catch {}
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('volumechange', onVol);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TRACK_KEY);
      if (raw) {
        const t = JSON.parse(raw) as TrackMeta;
        if (t && t.url) {
          let lastPos = 0;
          let lastDur = 0;
          try {
            const map: Record<string, unknown> = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
            const p = Number(map[t.url]);
            if (p && isFinite(p) && p > 0) lastPos = Math.max(0, Math.floor(p));
            const dmap: Record<string, unknown> = JSON.parse(localStorage.getItem(DUR_KEY) || '{}') || {};
            const d = Number(dmap[t.url]);
            if (d && isFinite(d) && d > 0) lastDur = Math.max(0, Math.floor(d));
          } catch {}
          let restoredQueue: TrackMeta[] | undefined;
          let restoredIndex: number = -1;
          try {
            const qraw = localStorage.getItem(QUEUE_KEY);
            if (qraw) {
              const parsed = JSON.parse(qraw) as { queue?: TrackMeta[]; index?: number };
              if (Array.isArray(parsed?.queue)) {
                restoredQueue = parsed.queue.filter((x) => x && x.url);
                restoredIndex = typeof parsed.index === 'number' ? parsed.index! : -1;
                if (restoredQueue && restoredQueue.length) {
                  const idxByUrl = restoredQueue.findIndex((q) => q.url === t.url);
                  if (idxByUrl >= 0) restoredIndex = idxByUrl;
                }
              }
            }
          } catch {}
          setState((s) => ({
            ...s,
            current: t,
            currentTime: lastPos,
            duration: lastDur,
            queue: restoredQueue || s.queue,
            index: restoredIndex,
          }));
          try {
            const el = audioRef.current!;
            if (el && !el.src) {
              el.src = t.url;
            }
          } catch {}
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MODE_KEY) as 'none' | 'one' | 'all' | null;
      const sh = localStorage.getItem(SHUF_KEY);
      const rep = m === 'none' || m === 'one' || m === 'all' ? m : 'all';
      setState((s) => ({ ...s, repeat: rep, shuffle: sh === '1' }));
      if (!m) {
        try {
          localStorage.setItem(MODE_KEY, rep);
        } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => {
      toggleRef.current?.();
    });
    ms.setActionHandler('pause', () => {
      toggleRef.current?.();
    });
    ms.setActionHandler('previoustrack', () => {
      prevRef.current?.();
    });
    ms.setActionHandler('nexttrack', () => {
      nextRef.current?.();
    });
    ms.setActionHandler('seekbackward', (details: MediaSessionActionDetails) => {
      if (seekRef.current) seekRef.current((audioRef.current?.currentTime || 0) - (details?.seekOffset || 10));
    });
    ms.setActionHandler('seekforward', (details: MediaSessionActionDetails) => {
      if (seekRef.current) seekRef.current((audioRef.current?.currentTime || 0) + (details?.seekOffset || 10));
    });
    ms.setActionHandler('seekto', (details: MediaSessionActionDetails) => {
      if (seekRef.current && typeof details?.seekTime === 'number') seekRef.current(details.seekTime);
    });
  }, []);

  const metaTitle =
    state.current?.title ||
    (state.current?.url ? state.current.url.split('/').pop() || 'Аудио' : 'Аудио');
  const metaArtist = state.current?.artist || '';
  const metaCover = state.current?.coverUrl || '';
  const isPlaying = state.playing;
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
    const ms = navigator.mediaSession;
    try {
      const artwork = metaCover ? [{ src: metaCover }] : undefined;
      ms.metadata = new MediaMetadata({
        title: metaTitle,
        artist: metaArtist,
        artwork,
      });
    } catch {}
    ms.playbackState = isPlaying ? 'playing' : 'paused';
  }, [metaTitle, metaArtist, metaCover, isPlaying]);

  const ensureAudioGraph = useCallback(async () => {
    try {
      if (!audioCtxRef.current) {
        const win = window as unknown as {
          AudioContext: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const Ctor = win.AudioContext || win.webkitAudioContext;
        if (!Ctor) return;
        audioCtxRef.current = new Ctor();
      }
      if (!srcNodeRef.current && audioCtxRef.current) {
        srcNodeRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current!);
        gainRef.current = audioCtxRef.current.createGain();
        srcNodeRef.current.connect(gainRef.current);
        gainRef.current.connect(audioCtxRef.current.destination);
        gainRef.current.gain.setValueAtTime(
          gainRef.current.gain.value || 1,
          audioCtxRef.current.currentTime,
        );
      }
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume().catch(() => {});
      }
    } catch {}
  }, []);

  const fadeTo = useCallback((target: number, ms: number = FADE_MS) => {
    const ctx = audioCtxRef.current;
    const g = gainRef.current;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    const current = g.gain.value;
    const clamped = Math.max(0, Math.min(1, target));
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(current, now);
      g.gain.linearRampToValueAtTime(clamped, now + ms / 1000);
    } catch {}
  }, []);

  const setCurrentAndSrc = useCallback(
    (track: TrackMeta) => {
      const el = audioRef.current!;
      try {
        fadeTo(0, 120);
      } catch {}
      el.src = track.url;
      setState((s) => ({ ...s, current: track, currentTime: 0, duration: 0 }));
      try {
        localStorage.setItem(TRACK_KEY, JSON.stringify(track));
      } catch {}
    },
    [fadeTo, setState],
  );

  const playTrack = useCallback(
    (track: TrackMeta) => {
      const el = audioRef.current!;
      if (!track?.url) return;
      if (currentUrlRef.current !== track.url) setCurrentAndSrc(track);
      const p = el.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
      ensureAudioGraph().then(() => {
        try {
          const ctx = audioCtxRef.current;
          const g = gainRef.current;
          if (ctx && g) {
            g.gain.setValueAtTime(0, ctx.currentTime);
            fadeTo(1, FADE_MS);
          }
        } catch {}
      });
    },
    [setCurrentAndSrc, ensureAudioGraph, fadeTo],
  );

  const playList = useCallback(
    (tracks: TrackMeta[], startIndex: number) => {
      const list = Array.isArray(tracks) ? tracks.filter((t) => t && t.url) : [];
      const idx = Math.max(0, Math.min(startIndex, list.length - 1));
      setState((s) => ({ ...s, queue: list, index: list.length ? idx : -1 }));
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue: list, index: idx }));
      } catch {}
      if (list.length) {
        const track = list[idx];
        setCurrentAndSrc(track);
        const p = audioRef.current!.play();
        if (p && typeof p.then === 'function') p.catch(() => {});
        ensureAudioGraph().then(() => {
          try {
            const ctx = audioCtxRef.current;
            const g = gainRef.current;
            if (ctx && g) {
              g.gain.setValueAtTime(0, ctx.currentTime);
              fadeTo(1, FADE_MS);
            }
          } catch {}
        });
      }
    },
    [setCurrentAndSrc, ensureAudioGraph, fadeTo],
  );

  const updateTrackMeta = useCallback(
    (url: string, meta: { title?: string; artist?: string; coverUrl?: string }) => {
      setState((s) => {
        let metaMap: Record<string, { title?: string; artist?: string; coverUrl?: string }> = {};
        try {
          metaMap = JSON.parse(localStorage.getItem('music_meta_v1_own') || '{}');
        } catch {}
        const mergedMeta = { ...metaMap[url], ...meta };
        const newQueue = s.queue.map((t) => (t.url === url ? { ...t, ...mergedMeta } : t));
        let newCurrent = s.current;
        if (s.current?.url === url) {
          newCurrent = { ...s.current, ...mergedMeta };
          try {
            localStorage.setItem(TRACK_KEY, JSON.stringify(newCurrent));
          } catch {}
        }
        try {
          localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue: newQueue, index: s.index }));
        } catch {}
        return { ...s, queue: newQueue, current: newCurrent } as AudioPlayerState;
      });
    },
    [],
  );

  const next = useCallback(() => {
    setState((s) => {
      if (!s.queue.length || s.index < 0) return s;
      let ni = s.index + 1;
      if (s.shuffle && s.queue.length > 1) {
        const candidates = s.queue.map((_, i) => i).filter((i) => i !== s.index);
        ni = candidates[Math.floor(Math.random() * candidates.length)] ?? s.index;
      }
      if (ni >= s.queue.length) {
        if (s.repeat === 'all') ni = 0;
        else return { ...s };
      }
      const track = s.queue[ni];
      const el = audioRef.current!;
      try {
        fadeTo(0, 120);
      } catch {}
      el.src = track.url;
      try {
        localStorage.setItem(TRACK_KEY, JSON.stringify(track));
      } catch {}
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue: s.queue, index: ni }));
      } catch {}
      const p = el.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
      ensureAudioGraph().then(() => {
        try {
          const ctx = audioCtxRef.current;
          const g = gainRef.current;
          if (ctx && g) {
            g.gain.setValueAtTime(0, ctx.currentTime);
            fadeTo(1, FADE_MS);
          }
        } catch {}
      });
      return { ...s, current: track, index: ni, currentTime: 0, duration: 0, playing: true };
    });
  }, [ensureAudioGraph, fadeTo]);

  const prev = useCallback(() => {
    setState((s) => {
      if (!s.queue.length || s.index < 0) return s;
      let pi = s.index - 1;
      if (s.shuffle && s.queue.length > 1) {
        const candidates = s.queue.map((_, i) => i).filter((i) => i !== s.index);
        pi = candidates[Math.floor(Math.random() * candidates.length)] ?? s.index;
      }
      if (pi < 0) {
        if (s.repeat === 'all') pi = s.queue.length - 1;
        else return { ...s };
      }
      const track = s.queue[pi];
      const el = audioRef.current!;
      try {
        fadeTo(0, 120);
      } catch {}
      el.src = track.url;
      try {
        localStorage.setItem(TRACK_KEY, JSON.stringify(track));
      } catch {}
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue: s.queue, index: pi }));
      } catch {}
      const p = el.play();
      if (p && typeof p.then === 'function') p.catch(() => {});
      ensureAudioGraph().then(() => {
        try {
          const ctx = audioCtxRef.current;
          const g = gainRef.current;
          if (ctx && g) {
            g.gain.setValueAtTime(0, ctx.currentTime);
            fadeTo(1, FADE_MS);
          }
        } catch {}
      });
      return { ...s, current: track, index: pi, currentTime: 0, duration: 0, playing: true };
    });
  }, [ensureAudioGraph, fadeTo]);

  const toggle = useCallback(() => {
    const el = audioRef.current!;
    const url = currentUrlRef.current;
    if (!el.src && url) {
      try {
        el.src = url;
      } catch {}
      let pos = 0;
      try {
        const map: Record<string, unknown> = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
        const p = Number(map[url]);
        if (p && isFinite(p) && p > 0) pos = Math.max(0, Math.floor(p));
      } catch {}
      const onMeta = () => {
        try {
          if (pos > 0) {
            const safe = Math.min(el.duration || pos, Math.max(0, pos));
            el.currentTime = safe;
            setState((s) => ({ ...s, currentTime: safe }));
          }
        } catch {}
        const p = el.play();
        if (p && typeof p.then === 'function') p.catch(() => {});
        ensureAudioGraph().then(() => {
          try {
            const ctx = audioCtxRef.current;
            const g = gainRef.current;
            if (ctx && g) {
              g.gain.setValueAtTime(0, ctx.currentTime);
              fadeTo(1, FADE_MS);
            }
          } catch {}
        });
        el.removeEventListener('loadedmetadata', onMeta);
      };
      el.addEventListener('loadedmetadata', onMeta);
      return; // не продолжаем стандартную ветку
    }
    if (!el.src && !url) return;
    if (el.paused) {
      let pos = 0;
      try {
        const map: Record<string, unknown> = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
        const p = Number(map[url!]);
        if (p && isFinite(p) && p > 0) pos = Math.max(0, Math.floor(p));
      } catch {}
      const startPlayback = () => {
        const playPromise = el.play();
        if (playPromise && typeof playPromise.then === 'function') playPromise.catch(() => {});
        ensureAudioGraph().then(() => {
          try {
            const ctx = audioCtxRef.current;
            const g = gainRef.current;
            if (ctx && g) {
              g.gain.setValueAtTime(0, ctx.currentTime);
              fadeTo(1, FADE_MS);
            }
          } catch {}
        });
      };
      if (pos > 0 && (el.readyState < 1 || Math.abs((el.currentTime || 0) - pos) > 0.35)) {
        const onMeta = () => {
          try {
            const safe = Math.min(el.duration || pos, Math.max(0, pos));
            el.currentTime = safe;
            setState((s) => ({ ...s, currentTime: safe }));
          } catch {}
          el.removeEventListener('loadedmetadata', onMeta);
          startPlayback();
        };
        el.addEventListener('loadedmetadata', onMeta);
        if (el.readyState >= 1) onMeta();
      } else {
        startPlayback();
      }
    } else {
      el.pause();
    }
  }, [ensureAudioGraph, fadeTo]);

  const seek = useCallback((time: number) => {
    const el = audioRef.current!;
    try {
      el.currentTime = Math.max(0, Math.min(time, el.duration || time));
    } catch {}
  }, []);

  const setVolume = useCallback((v: number) => {
    const el = audioRef.current!;
    el.volume = Math.max(0, Math.min(1, v));
    setState((s) => ({ ...s, volume: el.volume }));
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current!;
    el.pause();
    el.currentTime = 0;
    setState((s) => ({ ...s, playing: false }));
  }, []);

  const close = useCallback(() => {
    const el = audioRef.current!;
    try {
      el.pause();
    } catch {}
    try {
      el.removeAttribute('src');
      el.load();
    } catch {}
    setState((s) => ({
      ...s,
      playing: false,
      current: null,
      currentTime: 0,
      duration: 0,
      queue: [],
      index: -1,
    }));
    try {
      localStorage.removeItem(TRACK_KEY);
      localStorage.removeItem(QUEUE_KEY);
      const url = currentUrlRef.current;
      if (url) {
        const map: Record<string, unknown> = JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {};
        delete map[url];
        localStorage.setItem(POS_KEY, JSON.stringify(map));
      }
    } catch {}
  }, []);

  const setRepeat = useCallback((mode: 'none' | 'one' | 'all') => {
    setState((s) => ({ ...s, repeat: mode }));
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((s) => {
      const nextVal = !s.shuffle;
      try {
        localStorage.setItem(SHUF_KEY, nextVal ? '1' : '0');
      } catch {}
      return { ...s, shuffle: nextVal };
    });
  }, []);

  const toggleMute = useCallback(() => {
    const el = audioRef.current!;
    el.muted = !el.muted;
    setState((s) => ({ ...s, muted: el.muted }));
    try {
      localStorage.setItem(MUTE_KEY, el.muted ? '1' : '0');
    } catch {}
  }, []);

  const api: AudioPlayerApi = useMemo(
    () => ({
      ...state,
      playTrack,
      playList,
      updateTrackMeta,
      next,
      prev,
      toggle,
      seek,
      setVolume,
      stop,
      close,
      setRepeat,
      toggleShuffle,
      toggleMute,
    }),
    [
      state,
      playTrack,
      playList,
      updateTrackMeta,
      next,
      prev,
      toggle,
      seek,
      setVolume,
      stop,
      close,
      setRepeat,
      toggleShuffle,
      toggleMute,
    ],
  );

  useEffect(() => {
    const isEditable = (el: EventTarget | null) => {
      if (!el) return false;
      const target = el as HTMLElement;
      const tag = (target.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.code === 'ArrowRight') {
        seek((audioRef.current?.currentTime || 0) + 5);
      } else if (e.code === 'ArrowLeft') {
        seek((audioRef.current?.currentTime || 0) - 5);
      } else if (e.code === 'ArrowUp') {
        setVolume(Math.min(1, (audioRef.current?.volume || 0) + 0.05));
      } else if (e.code === 'ArrowDown') {
        setVolume(Math.max(0, (audioRef.current?.volume || 0) - 0.05));
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 'n') {
        next();
      } else if (e.key.toLowerCase() === 'p') {
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seek, setVolume, toggleMute, next, prev]);

  useEffect(() => {
    nextRef.current = next;
    prevRef.current = prev;
    seekRef.current = seek;
    toggleRef.current = toggle;
  }, [next, prev, seek, toggle]);

  useEffect(() => {
    const w = window as unknown as { audioPlayerCtx?: { updateTrackMeta: typeof updateTrackMeta } };
    w.audioPlayerCtx = { updateTrackMeta };
    return () => {
      delete w.audioPlayerCtx;
    };
  }, [updateTrackMeta]);

  return <AudioPlayerCtx.Provider value={api}>{children}</AudioPlayerCtx.Provider>;
}

export function useAudioPlayer() {
  const ctx = useContext(AudioPlayerCtx);
  if (!ctx) throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  return ctx;
}
