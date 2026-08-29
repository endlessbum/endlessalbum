import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Loader2,
  Search as SearchIcon,
  MoreVertical,
  Trash2,
  Pencil,
  Play,
  Pause,
  Music as MusicIcon,
  X,
  Users,
  Download,
  ArrowLeft,
  Heart,
  Album,
} from 'lucide-react';
import { MarqueeText } from '@/components/MarqueeText';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { attachCsrfHeader, csrfFetch, csrfUploadFetch } from '@/lib/queryClient';
import { MEMORY_IMAGE_MAX_SIZE } from '@shared/constants';
import { formatMaxSizeMb } from '@shared/utils';

type AudioItem = {
  id: string;
  url: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  createdAt: number;
};

type ServerAudio = { name: string; url: string; modifiedAt: string };

type AudioPlayerWindowCtx = {
  audioPlayerCtx?: {
    updateTrackMeta: (
      url: string,
      meta: { title?: string; artist?: string; coverUrl?: string },
    ) => void;
  };
};

export default function MusicPage() {
  const {
    data: partnerData,
    isLoading: isPartnerLoading,
  } = useQuery<{ partner: { id: string; username: string; firstName?: string } | null }>({
    queryKey: ['/api/partner'],
    staleTime: 5 * 60 * 1000,
  });

  const [viewingPartnerMusic, setViewingPartnerMusic] = useState(false);

  const getCurrentUserId = () =>
    viewingPartnerMusic ? partnerData?.partner?.id || 'partner' : 'own';
  const META_KEY = `music_meta_v1_${getCurrentUserId()}`;
  const ORDER_KEY = `music_order_v1_${getCurrentUserId()}`;
  const FAVORITES_KEY = `music_favorites_v1_${getCurrentUserId()}`;
  const ALBUMS_KEY = `music_albums_v1_${getCurrentUserId()}`;

  const getFavorites = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]') || [];
    } catch {
      return [];
    }
  }, [FAVORITES_KEY]);
  const getAlbums = useCallback((): Array<{ id: string; name: string; tracks: string[] }> => {
    try {
      return JSON.parse(localStorage.getItem(ALBUMS_KEY) || '[]') || [];
    } catch {
      return [];
    }
  }, [ALBUMS_KEY]);

  useEffect(() => {
    function updateFromStorage(_e?: StorageEvent | CustomEvent) {
      try {
        setFavorites(getFavorites());
        setAlbums(getAlbums());
        setAudios((audios) => [...audios]);
      } catch {}
    }
    function onStorage(_e: StorageEvent) {
      if (
        _e.key &&
        (_e.key === FAVORITES_KEY ||
          _e.key === ALBUMS_KEY ||
          _e.key === ORDER_KEY ||
          _e.key === META_KEY)
      )
        updateFromStorage(_e);
    }
    function onCustom(_e: Event) {
      const ce = _e as CustomEvent<{ key: string }>;
      if (
        ce.detail?.key &&
        (ce.detail.key === FAVORITES_KEY ||
          ce.detail.key === ALBUMS_KEY ||
          ce.detail.key === ORDER_KEY ||
          ce.detail.key === META_KEY)
      )
        updateFromStorage();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener('musicChanged', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('musicChanged', onCustom as EventListener);
    };
  }, [getFavorites, getAlbums, FAVORITES_KEY, ALBUMS_KEY, ORDER_KEY, META_KEY]);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const player = useAudioPlayer();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [currentView, setCurrentView] = useState<'all' | 'favorites' | string>('all');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [albumDraggingId, setAlbumDraggingId] = useState<string | null>(null);
  const [albumOverId, setAlbumOverId] = useState<string | null>(null);

  const [albums, setAlbums] = useState<Array<{ id: string; name: string; tracks: string[] }>>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showNewAlbumDialog, setShowNewAlbumDialog] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');

  const getMetaMap = useCallback((): Record<
    string,
    { title: string; artist?: string; coverUrl?: string }
  > => {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }, [META_KEY]);
  const getOrder = useCallback((): string[] => {
    try {
      return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]') || [];
    } catch {
      return [];
    }
  }, [ORDER_KEY]);
  const saveOrder = useCallback(
    (urls: string[]) => {
      try {
        localStorage.setItem(ORDER_KEY, JSON.stringify(urls));
        window.dispatchEvent(new CustomEvent('musicChanged', { detail: { key: ORDER_KEY } }));
      } catch {}
    },
    [ORDER_KEY],
  );

  const saveFavorites = useCallback(
    (favorites: string[]) => {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
        window.dispatchEvent(new CustomEvent('musicChanged', { detail: { key: FAVORITES_KEY } }));
      } catch {}
    },
    [FAVORITES_KEY],
  );

  const saveAlbums = useCallback(
    (albums: Array<{ id: string; name: string; tracks: string[] }>) => {
      try {
        localStorage.setItem(ALBUMS_KEY, JSON.stringify(albums));
        window.dispatchEvent(new CustomEvent('musicChanged', { detail: { key: ALBUMS_KEY } }));
      } catch {}
    },
    [ALBUMS_KEY],
  );
  const applySavedOrder = useCallback(
    (items: AudioItem[]): AudioItem[] => {
      const order = getOrder();
      if (!order.length) return items;
      const indexMap = new Map(order.map((u, i) => [u, i] as const));
      return [...items].sort((a, b) => {
        const ai = indexMap.get(a.url);
        const bi = indexMap.get(b.url);
        if (ai == null && bi == null) return 0;
        if (ai == null) return 1;
        if (bi == null) return -1;
        return ai - bi;
      });
    },
    [getOrder],
  );
  const upsertMeta = (url: string, meta: { title: string; artist?: string; coverUrl?: string }) => {
    try {
      const map = getMetaMap();
      map[url] = { title: meta.title, artist: meta.artist, coverUrl: meta.coverUrl };
      localStorage.setItem(META_KEY, JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('musicChanged', { detail: { key: META_KEY } }));
      if (typeof window !== 'undefined') {
        const playerCtx = (window as unknown as AudioPlayerWindowCtx).audioPlayerCtx;
        if (playerCtx && typeof playerCtx.updateTrackMeta === 'function') {
          playerCtx.updateTrackMeta(url, meta);
        }
      }
    } catch {}
  };
  const removeMeta = (url: string) => {
    try {
      const map = getMetaMap();
      if (map[url]) {
        delete map[url];
        localStorage.setItem(META_KEY, JSON.stringify(map));
        window.dispatchEvent(new CustomEvent('musicChanged', { detail: { key: META_KEY } }));
      }
    } catch {}
  };

  const [metaOpen, setMetaOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metaTitle, setMetaTitle] = useState('');
  const [metaArtist, setMetaArtist] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<AudioItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [clearCover, setClearCover] = useState(false);

  const onClickAdd = () => fileInputRef.current?.click();

  const isPlayingUrl = (url: string) => player.current?.url === url && player.playing;
  const onToggleItem = (item: AudioItem) => {
    if (player.current?.url === item.url) {
      player.toggle();
      return;
    }
    const idx = filtered.findIndex((f) => f.id === item.id);
    const queue = filtered.map((f) => ({
      url: f.url,
      title: f.title,
      artist: f.artist,
      coverUrl: f.coverUrl,
    }));
    player.playList(queue, Math.max(0, idx));
  };

  const deleteAudio = async (item: AudioItem) => {
    try {
      if (player.current?.url === item.url) {
        player.stop();
      }

      const urlParam = encodeURIComponent(item.url);
      let endpoint = `/api/audios?url=${urlParam}`;
      // Передаём обложку, чтобы сервер удалил и её (метаданные хранятся
      // на клиенте, сервер сам не знает о связи трека и обложки).
      if (item.coverUrl && item.coverUrl.startsWith('/uploads/')) {
        endpoint += `&cover=${encodeURIComponent(item.coverUrl)}`;
      }
      const res = await csrfFetch(endpoint, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || 'Не удалось удалить аудио');
      }
      setAudios((prev) => {
        const next = prev.filter((a) => a.url !== item.url);
        saveOrder(next.map((x) => x.url));
        return next;
      });
      removeMeta(item.url);
      toast({ title: 'Удалено', description: item.title });
    } catch (e) {
      toast({
        title: 'Ошибка удаления',
        description: (e as Error).message || 'Попробуйте снова',
        variant: 'destructive',
      });
    }
  };

  const copyTrackToMyLibrary = (item: AudioItem) => {
    if (!viewingPartnerMusic) return;

    const ownMetaKey = 'music_meta_v1_own';
    const ownOrderKey = 'music_order_v1_own';

    try {
      const ownMetaMap = JSON.parse(localStorage.getItem(ownMetaKey) || '{}');
      const ownOrder = JSON.parse(localStorage.getItem(ownOrderKey) || '[]');

      if (ownMetaMap[item.url]) {
        toast({
          title: 'Трек уже добавлен',
          description: 'Этот трек уже есть в вашей библиотеке',
          variant: 'destructive',
        });
        return;
      }

      ownMetaMap[item.url] = {
        title: item.title,
        artist: item.artist,
        coverUrl: item.coverUrl,
      };

      if (!ownOrder.includes(item.url)) {
        ownOrder.push(item.url);
      }

      localStorage.setItem(ownMetaKey, JSON.stringify(ownMetaMap));
      localStorage.setItem(ownOrderKey, JSON.stringify(ownOrder));

      toast({
        title: 'Трек добавлен',
        description: `"${item.title}" добавлен в вашу библиотеку`,
      });
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Не удалось добавить трек в библиотеку',
        variant: 'destructive',
      });
    }
  };

  const downloadTrack = async (item: AudioItem) => {
    try {
      let fileName = item.title;
      if (item.artist) {
        fileName = `${item.artist} - ${item.title}`;
      }

      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

      const urlParts = item.url.split('.');
      let extension =
        urlParts.length > 1 ? `.${urlParts[urlParts.length - 1].split('?')[0]}` : '.mp3';

      if (extension.toLowerCase() === '.m4a' || extension.toLowerCase() === '.mp4') {
        extension = '.m4a';
      }
      fileName += extension;

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error('Не удалось загрузить файл');
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      window.URL.revokeObjectURL(url);

      toast({
        title: 'Скачивание началось',
        description: `Файл "${fileName}" загружается`,
      });
    } catch {
      toast({
        title: 'Ошибка скачивания',
        description: 'Не удалось скачать файл',
        variant: 'destructive',
      });
    }
  };

  const toggleFavorite = (trackUrl: string) => {
    const currentFavorites = getFavorites();
    const newFavorites = currentFavorites.includes(trackUrl)
      ? currentFavorites.filter((url) => url !== trackUrl)
      : [...currentFavorites, trackUrl];

    setFavorites(newFavorites);
    saveFavorites(newFavorites);

    const action = newFavorites.includes(trackUrl) ? 'добавлен в' : 'удален из';
    const track = audios.find((a) => a.url === trackUrl);
    toast({
      title: `Трек ${action} избранное`,
      description: track?.title || 'Трек',
    });
  };

  const createAlbum = (name: string) => {
    if (!name.trim()) return;

    const newAlbum = {
      id: Date.now().toString(),
      name: name.trim(),
      tracks: [],
    };

    const currentAlbums = getAlbums();
    const newAlbums = [...currentAlbums, newAlbum];

    setAlbums(newAlbums);
    saveAlbums(newAlbums);

    toast({
      title: 'Альбом создан',
      description: `Альбом "${name}" успешно создан`,
    });
  };

  const deleteAlbum = (albumId: string) => {
    const currentAlbums = getAlbums();
    const album = currentAlbums.find((a) => a.id === albumId);
    const newAlbums = currentAlbums.filter((a) => a.id !== albumId);

    setAlbums(newAlbums);
    saveAlbums(newAlbums);

    if (currentView === albumId) {
      setCurrentView('all');
    }

    toast({
      title: 'Альбом удален',
      description: `Альбом "${album?.name}" удален`,
    });
  };

  const addToAlbum = (trackUrl: string, albumId: string) => {
    const currentAlbums = getAlbums();
    const newAlbums = currentAlbums.map((album) => {
      if (album.id === albumId && !album.tracks.includes(trackUrl)) {
        return { ...album, tracks: [...album.tracks, trackUrl] };
      }
      return album;
    });

    setAlbums(newAlbums);
    saveAlbums(newAlbums);

    const album = newAlbums.find((a) => a.id === albumId);
    const track = audios.find((a) => a.url === trackUrl);
    toast({
      title: 'Трек добавлен в альбом',
      description: `"${track?.title}" добавлен в альбом "${album?.name}"`,
    });
  };

  const resetFilePicker = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const resetCoverPicker = () => {
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/opus',
      'audio/webm',
      'audio/aac',
      'audio/mp4',
      'audio/flac',
      'audio/x-flac',
      'application/octet-stream',
    ];
    if (!allowed.includes(file.type)) {
      toast({
        title: 'Неподдерживаемый формат',
        description: 'Допустимые: MP3, WAV, OGG/OPUS, M4A/AAC, FLAC, WebM',
        variant: 'destructive',
      });
      resetFilePicker();
      return;
    }
    const baseName = file.name.replace(/\.[^.]+$/, '');
    setSelectedFile(file);
    setMetaTitle(baseName);
    setMetaArtist('');
    resetCoverPicker();
    setMetaOpen(true);
  };

  const uploadWithMeta = (file: File, title: string, artist?: string) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/audio');
    xhr.withCredentials = true;
    const fd = new FormData();
    fd.append('audio', file);

    setIsUploading(true);
    setUploadProgress(0);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setIsUploading(false);
      setUploadProgress(null);
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json?.url) {
          const baseItem: AudioItem = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            url: json.url as string,
            title: title.trim() || file.name,
            artist: artist?.trim() || undefined,
            createdAt: Date.now(),
          };
          const finish = (coverUrl?: string) => {
            const item: AudioItem = { ...baseItem, coverUrl };
            setAudios((prev) => {
              const next = [item, ...prev];
              saveOrder(next.map((x) => x.url));
              return next;
            });
            upsertMeta(item.url, { title: item.title, artist: item.artist, coverUrl });
            const desc = item.artist ? `${item.artist} — ${item.title}` : item.title;
            toast({ title: 'Аудио загружено', description: desc });
          };
          if (coverFile) {
            const fd2 = new FormData();
            fd2.append('image', coverFile);
            csrfUploadFetch('/api/upload/audio-cover', 'POST', fd2)
              .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
              .then(({ ok, j }) => {
                if (ok && j?.url) finish(j.url as string);
                else finish(undefined);
              })
              .catch(() => finish(undefined))
              .finally(() => {
                resetCoverPicker();
              });
          } else {
            finish(undefined);
          }
        } else {
          throw new Error(json?.message || 'Ошибка загрузки аудио');
        }
      } catch (err) {
        toast({
          title: 'Ошибка',
          description: (err as Error).message || 'Не удалось загрузить аудио',
          variant: 'destructive',
        });
      } finally {
        setMetaOpen(false);
        setSelectedFile(null);
        resetFilePicker();
        resetCoverPicker();
      }
    };
    xhr.onerror = () => {
      setIsUploading(false);
      setUploadProgress(null);
      toast({
        title: 'Сеть недоступна',
        description: 'Проверьте соединение и попробуйте снова',
        variant: 'destructive',
      });
      setMetaOpen(false);
      setSelectedFile(null);
      resetFilePicker();
    };
    attachCsrfHeader(xhr)
      .then(() => {
        xhr.send(fd);
      })
      .catch(() => {
        setIsUploading(false);
        setUploadProgress(null);
        toast({
          title: 'Ошибка',
          description: 'Не удалось подготовить CSRF-защиту',
          variant: 'destructive',
        });
        setMetaOpen(false);
        setSelectedFile(null);
        resetFilePicker();
        resetCoverPicker();
      });
  };

  const openEdit = (item: AudioItem) => {
    setEditItem(item);
    setEditTitle(item.title);
    setEditArtist(item.artist || '');
    setEditCoverFile(null);
    setEditCoverPreview(null);
    setClearCover(false);
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!editItem) return;
    const newTitle = editTitle.trim() || editItem.title;
    const newArtist = editArtist.trim() || undefined;
    const apply = (coverUrl?: string) => {
      const next = {
        ...editItem,
        title: newTitle,
        artist: newArtist,
        coverUrl: clearCover ? undefined : (coverUrl ?? editItem.coverUrl),
      } as AudioItem;
      setAudios((prev) => prev.map((a) => (a.id === editItem.id ? next : a)));
      upsertMeta(editItem.url, { title: newTitle, artist: newArtist, coverUrl: next.coverUrl });
      try {
        player.updateTrackMeta(editItem.url, {
          title: newTitle,
          artist: newArtist,
          coverUrl: next.coverUrl,
        });
      } catch {}
      toast({
        title: 'Сохранено',
        description: newArtist ? `${newArtist} — ${newTitle}` : newTitle,
      });
      setEditOpen(false);
      setEditItem(null);
      setEditCoverFile(null);
      setEditCoverPreview(null);
      setClearCover(false);
    };
    if (clearCover) {
      apply(undefined);
      return;
    }
    if (editCoverFile) {
      const fd = new FormData();
      fd.append('image', editCoverFile);
      csrfUploadFetch('/api/upload/audio-cover', 'POST', fd)
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => apply(ok && j?.url ? (j.url as string) : undefined))
        .catch(() => apply(undefined));
      return;
    }
    apply(undefined);
  };

  useEffect(() => {
    setFavorites(getFavorites());
    setAlbums(getAlbums());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let canceled = false;
    const load = async () => {
      try {
        const endpoint = viewingPartnerMusic ? '/api/partner/audios' : '/api/audios';
        const res = await csrfFetch(endpoint, { credentials: 'include' });
        const data = (await res.json().catch(() => ({ audios: [] }))) as { audios: ServerAudio[] };
        if (canceled) return;
        const metaKey = viewingPartnerMusic
          ? `music_meta_v1_${partnerData?.partner?.id || 'partner'}`
          : 'music_meta_v1_own';
        let meta: Record<string, { title?: string; artist?: string; coverUrl?: string }> = {};
        try {
          meta = JSON.parse(localStorage.getItem(metaKey) || '{}');
        } catch {}
        const itemsRaw: AudioItem[] = (data?.audios || []).map((a) => {
          const baseName = (a.name || '').replace(/\.[^.]+$/, '') || 'Аудио';
          const m = meta[a.url];
          return {
            id: a.url,
            url: a.url as string,
            title: (m?.title || baseName) as string,
            artist: m?.artist,
            coverUrl: m?.coverUrl,
            createdAt: a.modifiedAt ? Date.parse(a.modifiedAt) : Date.now(),
          } as AudioItem;
        });
        const items = applySavedOrder(itemsRaw);
        if (canceled) return;
        setAudios(items);
        if (typeof window !== 'undefined') {
          const playerCtx = (window as unknown as AudioPlayerWindowCtx).audioPlayerCtx;
          if (playerCtx && typeof playerCtx.updateTrackMeta === 'function') {
            items.forEach((item) => {
              playerCtx.updateTrackMeta(item.url, {
                title: item.title,
                artist: item.artist,
                coverUrl: item.coverUrl,
              });
            });
          }
        }
      } catch {
        if (!canceled) setAudios([]);
      }
    };
    load();
    return () => {
      canceled = true;
    };
  }, [applySavedOrder, viewingPartnerMusic, partnerData?.partner?.id]);

  const filtered = useMemo(() => {
    let baseList = audios;

    if (currentView === 'favorites') {
      baseList = audios.filter((a) => favorites.includes(a.url));
    } else if (currentView !== 'all') {
      const album = albums.find((a) => a.id === currentView);
      if (album) {
        baseList = audios.filter((a) => album.tracks.includes(a.url));
      }
    }

    if (!query.trim()) return baseList;
    const q = query.trim().toLowerCase();
    return baseList.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.artist ? a.artist.toLowerCase().includes(q) : false),
    );
  }, [query, audios, currentView, favorites, albums]);

  return (
    <div className="flex min-h-full w-full overflow-x-hidden min-w-0">
      <main className="flex-1 p-4 sm:p-6 min-w-0 overflow-x-hidden">
        <div className="mx-auto w-full max-w-6xl mb-6 sm:mb-8 min-w-0 overflow-x-hidden">
          <div className="mb-4 sm:mb-6 relative flex flex-col sm:grid sm:grid-cols-[auto,1fr,auto] items-center gap-4 min-w-0 overflow-x-auto">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary w-full sm:w-auto text-center sm:text-left">
              {(() => {
                if (viewingPartnerMusic && partnerData?.partner) {
                  return 'Музыка партнера';
                }
                if (currentView === 'favorites') return 'Избранное';
                if (currentView !== 'all') {
                  const album = albums.find((a) => a.id === currentView);
                  return album ? `Альбом: ${album.name}` : 'Музыка';
                }
                return 'Музыка';
              })()}
            </h1>
            <div className="w-full sm:w-auto flex items-center justify-center order-2 sm:order-none mt-2 sm:mt-0 min-w-0">
              <div className="relative flex items-center w-full max-w-full sm:max-w-[27rem]">
                <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none z-20" style={{maxHeight: '2rem'}} />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск..."
                  className="pl-10 h-10 w-full max-w-full rounded-full border-border-subtle bg-surface focus-ring text-left placeholder:text-left placeholder:text-text-muted"
                />
              </div>
            </div>
            <div className="w-full sm:w-auto flex justify-center sm:justify-end order-3 sm:order-none">
              {!viewingPartnerMusic && (
                <Button
                  onClick={onClickAdd}
                  className="btn-gradient"
                  disabled={isUploading}
                  aria-label="Выбрать аудиофайл"
                  title="Выбрать аудиофайл"
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Добавить
                </Button>
              )}
            </div>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {viewingPartnerMusic ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewingPartnerMusic(false)}
                className="flex items-center gap-2 hover-lift"
              >
                <ArrowLeft className="h-4 w-4" />
                Моя музыка
              </Button>
            ) : (
              (partnerData?.partner || isPartnerLoading) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingPartnerMusic(true)}
                  className="flex items-center gap-2 hover-lift"
                  disabled={isPartnerLoading}
                >
                  <Users className="h-4 w-4" />
                  {isPartnerLoading ? 'Загрузка...' : 'Музыка партнера'}
                </Button>
              )
            )}
          </div>

          {!viewingPartnerMusic && (
            <div className="mb-4 flex w-full justify-center">
              <div className="flex w-full max-w-[700px] flex-nowrap sm:flex-wrap items-center justify-start sm:justify-center gap-2 px-1 overflow-x-auto no-scrollbar min-w-0">
                <Button
                  variant={currentView === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('all')}
                  className="flex items-center gap-2"
                >
                  <MusicIcon className="h-4 w-4" />
                  Все треки ({audios.length})
                </Button>

                <Button
                  variant={currentView === 'favorites' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentView('favorites')}
                  className="flex items-center gap-2"
                >
                  <Heart className="h-4 w-4" />
                  Избранное ({favorites.length})
                </Button>

                {albums.map((album) => (
                  <Button
                    key={album.id}
                    variant={currentView === album.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setCurrentView(album.id)}
                    className={`flex items-center gap-2 ${albumDraggingId === album.id ? 'bg-surface-hover' : ''} ${albumOverId === album.id ? 'ring-2 ring-primary' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setAlbumDraggingId(album.id);
                      try {
                        e.dataTransfer.setData('text/plain', album.id);
                      } catch {}
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setAlbumOverId(album.id);
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDragLeave={() => {
                      setAlbumOverId((v) => (v === album.id ? null : v));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const srcId = albumDraggingId || e.dataTransfer.getData('text/plain');
                      if (!srcId || srcId === album.id) {
                        setAlbumDraggingId(null);
                        setAlbumOverId(null);
                        return;
                      }
                      setAlbums((prev) => {
                        const srcIndex = prev.findIndex((x) => x.id === srcId);
                        const dstIndex = prev.findIndex((x) => x.id === album.id);
                        if (srcIndex < 0 || dstIndex < 0) return prev;
                        const next = [...prev];
                        const [moved] = next.splice(srcIndex, 1);
                        next.splice(dstIndex, 0, moved);
                        saveAlbums(next);
                        return next;
                      });
                      setAlbumDraggingId(null);
                      setAlbumOverId(null);
                    }}
                    onDragEnd={() => {
                      setAlbumDraggingId(null);
                      setAlbumOverId(null);
                    }}
                    style={{ cursor: 'grab' }}
                    title={`Альбом: ${album.name}`}
                  >
                    <Album className="h-4 w-4" />
                    {album.name} ({album.tracks.length})
                  </Button>
                ))}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewAlbumDialog(true)}
                  className="flex items-center gap-2 border-2 border-dashed border-muted-foreground"
                  title="Новый альбом"
                  aria-label="Новый альбом"
                >
                  <Plus className="h-4 w-4" />
                  <span className="sr-only">Новый альбом</span>
                </Button>
              </div>
            </div>
          )}

          {isUploading && (
            <div className="mb-4">
              <div className="h-2 w-full bg-muted rounded">
                <div
                  className="h-2 bg-primary rounded transition-all"
                  style={{ width: `${uploadProgress ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/opus,audio/webm,audio/aac,audio/mp4,audio/m4a,audio/x-m4a,audio/flac,audio/x-flac,.mp3,.wav,.ogg,.oga,.opus,.webm,.m4a,.aac,.flac"
          onChange={handleFiles}
          className="hidden"
        />

        <div className={`flex justify-center ${filtered.length === 0 ? 'mt-6' : ''}`}>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface p-6 sm:p-8 text-center w-full max-w-[900px]">
              <MusicIcon className="h-8 w-8 mx-auto mb-3 text-text-muted" strokeWidth={1.25} />
              <p className="text-text-secondary text-lg">Аудио не найдено</p>
              <p className="text-text-secondary text-sm mt-1">
                Добавьте файл или измените запрос.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl border border-border-subtle bg-surface w-full max-w-[700px] divide-y divide-border-subtle overflow-hidden"
              data-testid="music-list"
            >
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className={`px-3 sm:px-4 py-2.5 flex flex-col gap-1.5 group transition-colors cursor-grab ${draggingId === a.id ? 'bg-surface-hover' : ''} ${overId === a.id ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
                  data-testid={`music-row-${a.id}`}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(a.id);
                    try {
                      e.dataTransfer.setData('text/plain', a.id);
                    } catch {}
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOverId(a.id);
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    setOverId((v) => (v === a.id ? null : v));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const srcId = draggingId || e.dataTransfer.getData('text/plain');
                    if (!srcId || srcId === a.id) {
                      setDraggingId(null);
                      setOverId(null);
                      return;
                    }
                    setAudios((prev) => {
                      const srcIndex = prev.findIndex((x) => x.id === srcId);
                      const dstIndex = prev.findIndex((x) => x.id === a.id);
                      if (srcIndex < 0 || dstIndex < 0) return prev;
                      const next = [...prev];
                      const [moved] = next.splice(srcIndex, 1);
                      next.splice(dstIndex, 0, moved);
                      saveOrder(next.map((x) => x.url));
                      return next;
                    });
                    setDraggingId(null);
                    setOverId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverId(null);
                  }}
                  title="Перетащите, чтобы изменить порядок"
                >
                  <div className="flex items-center justify-between gap-3 min-w-0 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-9 w-9 shrink-0">
                        {a.coverUrl ? (
                          <img
                            src={a.coverUrl}
                            alt="Обложка"
                            className="h-9 w-9 rounded object-cover border border-border-subtle"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-surface-soft flex items-center justify-center text-primary-foreground border border-border-subtle">
                            <MusicIcon className="h-4 w-4" />
                          </div>
                        )}
                        {(() => {
                          const isCurrent = player.current?.url === a.url;
                          const isPlaying = isPlayingUrl(a.url);
                          const alwaysVisible = isPlaying || isCurrent;
                          return (
                            <button
                              type="button"
                              onClick={() => onToggleItem(a)}
                              title={isPlaying ? 'Пауза' : 'Воспроизвести'}
                              aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                              className={`absolute inset-0 rounded flex items-center justify-center bg-background transition-opacity ${alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              {isPlaying ? (
                                <Pause className="h-4 w-4 text-foreground drop-shadow" />
                              ) : (
                                <Play className="h-4 w-4 text-foreground drop-shadow" />
                              )}
                            </button>
                          );
                        })()}
                      </div>
                      <div
                        className="font-medium text-sm leading-tight w-full max-w-full"
                        style={{ minWidth: 0 }}
                      >
                        <MarqueeText className="w-full max-w-full">
                          <span className="text-text-primary">{a.title}</span>
                          {a.artist ? (
                            <>
                              <span className="ml-1 text-text-secondary">{a.artist}</span>
                            </>
                          ) : null}
                        </MarqueeText>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <div className="hidden sm:block text-[11px] text-text-secondary">
                        {new Date(a.createdAt).toLocaleDateString()}
                        {(() => {
                          try {
                            const map = JSON.parse(localStorage.getItem('audio_dur_v1') || '{}') || {};
                            const dur = map[a.url];
                            if (dur && !isNaN(dur)) {
                              const min = Math.floor(dur / 60);
                              const sec = Math.floor(dur % 60).toString().padStart(2, '0');
                              return ` · ${min}:${sec}`;
                            }
                          } catch {}
                          return '';
                        })()}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Дополнительно"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {viewingPartnerMusic ? (
                            <DropdownMenuItem onClick={() => copyTrackToMyLibrary(a)}>
                              <Plus className="h-4 w-4" /> Добавить себе
                            </DropdownMenuItem>
                          ) : (
                            <>
                              {currentView === 'favorites' ? (
                                <>
                                  <DropdownMenuItem onClick={() => toggleFavorite(a.url)}>
                                    <Heart
                                      className={`h-4 w-4 ${favorites.includes(a.url) ? 'fill-current text-destructive' : ''}`}
                                    />
                                    {favorites.includes(a.url)
                                      ? 'Убрать из избранного'
                                      : 'В избранное'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => downloadTrack(a)}>
                                    <Download className="h-4 w-4" /> Скачать
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <>
                                  <DropdownMenuItem onClick={() => toggleFavorite(a.url)}>
                                    <Heart
                                      className={`h-4 w-4 ${favorites.includes(a.url) ? 'fill-current text-destructive' : ''}`}
                                    />
                                    {favorites.includes(a.url)
                                      ? currentView === 'all'
                                        ? 'В избранном'
                                        : 'Убрать из избранного'
                                      : 'В избранное'}
                                  </DropdownMenuItem>
                                  {albums.length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-xs text-muted-foreground">
                                        Добавить в альбом:
                                      </div>
                                      {albums.map((album) => (
                                        <DropdownMenuItem
                                          key={album.id}
                                          onClick={() => addToAlbum(a.url, album.id)}
                                          disabled={album.tracks.includes(a.url)}
                                        >
                                          <Album className="h-4 w-4" />
                                          {album.name}{' '}
                                          {album.tracks.includes(a.url) && '(уже добавлен)'}
                                        </DropdownMenuItem>
                                      ))}
                                    </>
                                  )}
                                  <DropdownMenuItem onClick={() => openEdit(a)}>
                                    <Pencil className="h-4 w-4" /> Изменить
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => downloadTrack(a)}>
                                    <Download className="h-4 w-4" /> Скачать
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => deleteAudio(a)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" /> Удалить
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {!viewingPartnerMusic && currentView !== 'all' && currentView !== 'favorites' && (
          <div className="mt-4 flex w-full justify-center">
            <div className="w-full max-w-[700px] flex justify-center">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteAlbum(currentView)}
                className="flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Удалить альбом
              </Button>
            </div>
          </div>
        )}
      </main>

      <Dialog
        open={metaOpen}
        onOpenChange={(o) => {
          if (!isUploading) setMetaOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Детали трека</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Название</Label>
              <Input
                id="title"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="artist">Исполнитель (необязательно)</Label>
              <Input
                id="artist"
                value={metaArtist}
                onChange={(e) => setMetaArtist(e.target.value)}
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label>Обложка (необязательно)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    if (!f) {
                      resetCoverPicker();
                      return;
                    }
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
                      toast({
                        title: 'Неподдерживаемый формат',
                        description: 'Допустимы: PNG, JPEG, WEBP',
                        variant: 'destructive',
                      });
                      return;
                    }
                    if (f.size > MEMORY_IMAGE_MAX_SIZE) {
                      toast({
                        title: 'Слишком большой файл',
                        description: `До ${formatMaxSizeMb(MEMORY_IMAGE_MAX_SIZE)}`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    setCoverFile(f);
                    if (coverPreview) URL.revokeObjectURL(coverPreview);
                    setCoverPreview(URL.createObjectURL(f));
                  }}
                  disabled={isUploading}
                />
                {coverPreview ? (
                  <div className="relative">
                    <img
                      src={coverPreview}
                      alt="Обложка"
                      className="h-16 w-16 rounded object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 bg-background hover:bg-surface-hover hover:text-primary-foreground text-foreground rounded-full p-1 shadow"
                      onClick={() => resetCoverPicker()}
                      aria-label="Убрать обложку"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded bg-muted flex items-center justify-center text-muted-foreground">
                    <MusicIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (selectedFile) uploadWithMeta(selectedFile, metaTitle, metaArtist);
              }}
              disabled={!selectedFile || !metaTitle.trim() || isUploading}
            >
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Загрузить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Изменить трек</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Название</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-artist">Исполнитель (необязательно)</Label>
              <Input
                id="edit-artist"
                value={editArtist}
                onChange={(e) => setEditArtist(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Обложка</Label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setClearCover(false);
                    if (!f) {
                      setEditCoverFile(null);
                      if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
                      setEditCoverPreview(null);
                      return;
                    }
                    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
                      toast({
                        title: 'Неподдерживаемый формат',
                        description: 'Допустимы: PNG, JPEG, WEBP',
                        variant: 'destructive',
                      });
                      return;
                    }
                    if (f.size > MEMORY_IMAGE_MAX_SIZE) {
                      toast({
                        title: 'Слишком большой файл',
                        description: `До ${formatMaxSizeMb(MEMORY_IMAGE_MAX_SIZE)}`,
                        variant: 'destructive',
                      });
                      return;
                    }
                    setEditCoverFile(f);
                    if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
                    setEditCoverPreview(URL.createObjectURL(f));
                  }}
                />
                {editCoverPreview || editItem?.coverUrl ? (
                  <div className="relative">
                    <img
                      src={editCoverPreview || editItem?.coverUrl || ''}
                      alt="Обложка"
                      className="h-16 w-16 rounded object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 bg-background hover:bg-surface-hover hover:text-primary-foreground text-foreground rounded-full p-1 shadow"
                      onClick={() => {
                        setEditCoverFile(null);
                        if (editCoverPreview) URL.revokeObjectURL(editCoverPreview);
                        setEditCoverPreview(null);
                        setClearCover(true);
                      }}
                      aria-label="Убрать обложку"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded bg-muted flex items-center justify-center text-muted-foreground">
                    <MusicIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveEdit} disabled={!editTitle.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNewAlbumDialog} onOpenChange={setShowNewAlbumDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать альбом</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="album-name">Название альбома</Label>
              <Input
                id="album-name"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="Введите название альбома"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlbumName.trim()) {
                    createAlbum(newAlbumName);
                    setNewAlbumName('');
                    setShowNewAlbumDialog(false);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewAlbumDialog(false);
                setNewAlbumName('');
              }}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (newAlbumName.trim()) {
                  createAlbum(newAlbumName);
                  setNewAlbumName('');
                  setShowNewAlbumDialog(false);
                }
              }}
              disabled={!newAlbumName.trim()}
            >
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
