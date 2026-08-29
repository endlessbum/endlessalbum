import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type Memory, type Comment, type PartnerResponse } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as ADDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Settings, Send, Quote as QuoteIcon, FileText, Play, Pause, Music as MusicIcon, Edit } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAudioPlayer } from "@/hooks/use-audio-player";

interface MemoryModalProps {
  memory: Memory;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (memory: Memory) => void;
  'data-testid'?: string;
}

export default function MemoryModal({ memory, isOpen, onClose, onEdit, 'data-testid': testId }: MemoryModalProps) {
  const player = useAudioPlayer();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isOpen) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isOpen]);

  const { data: comments = [], isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/memories", memory.id, "comments"],
    enabled: isOpen,
  });

  // Комментарии хранят только authorId — имя/инициал автора достаём из текущего
  // пользователя и партнёра (в паре их максимум двое).
  const { data: partnerData } = useQuery<PartnerResponse>({
    queryKey: ["/api/partner"],
  });

  const authorInitialFor = (authorId: string | null | undefined): string => {
    const name = authorId === user?.id
      ? (user?.firstName || user?.username || '')
      : (authorId === partnerData?.partner?.id
        ? (partnerData?.partner?.firstName || partnerData?.partner?.username || '')
        : '');
    return name ? name.charAt(0).toUpperCase() : 'К';
  };

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest(`/api/memories/${memory.id}/comments`, "POST", { content });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories", memory.id, "comments"] });
      setNewComment("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/memories/${memory.id}`, "DELETE");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Не удалось удалить");
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      onClose();
    },
  });

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment.trim());
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatCommentDate = (date: Date | null) => {
    if (!date) return '';
    const commentTs = new Date(date).getTime();
  const diffSec = Math.floor((nowTs - commentTs) / 1000);

    if (diffSec <= 0) return 'Только что';

    const plural = (n: number, one: string, few: string, many: string) => {
      const nAbs = Math.abs(n);
      const n10 = nAbs % 10;
      const n100 = nAbs % 100;
      if (n10 === 1 && n100 !== 11) return one;
      if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
      return many;
    };

    if (diffSec < 60) {
      const s = diffSec;
      const unit = plural(s, 'секунду', 'секунды', 'секунд');
      return `${s} ${unit} назад`;
    }

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      const unit = plural(diffMin, 'минуту', 'минуты', 'минут');
      return `${diffMin} ${unit} назад`;
    }

    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      const unit = plural(diffHr, 'час', 'часа', 'часов');
      return `${diffHr} ${unit} назад`;
    }

    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) {
      const unit = plural(diffDay, 'день', 'дня', 'дней');
      return `${diffDay} ${unit} назад`;
    }

    const diffMon = Math.floor(diffDay / 30);
    if (diffMon < 12) {
      const unit = plural(diffMon, 'месяц', 'месяца', 'месяцев');
      return `${diffMon} ${unit} назад`;
    }

    const diffYr = Math.floor(diffDay / 365);
    const unit = plural(diffYr, 'год', 'года', 'лет');
    return `${diffYr} ${unit} назад`;
  };

  const getAttachedAudioUrl = (): string | null => {
    const visibility = memory.visibility as { extra?: { audioUrl?: string } } | undefined;
    const extraUrl = visibility?.extra?.audioUrl;
    if (extraUrl && typeof extraUrl === 'string') return extraUrl;
    const tag = memory.tags?.find(t => t?.startsWith('audio_url:')) || null;
    if (tag) return tag.slice('audio_url:'.length);
    return null;
  };

  const getMusicMeta = (url: string): { title: string; artist?: string; coverUrl?: string } => {
    const keys = ['music_meta_v1', 'music_meta_v1_own'];
    try {
      const userId = (user && user.id) ? user.id : null;
      if (userId) keys.push(`music_meta_v1_${userId}`);
    } catch {}
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        const map = raw ? JSON.parse(raw) as Record<string, { title: string; artist?: string; coverUrl?: string }> : {};
        const m = map[url];
        if (m && m.title) return m;
      } catch {}
    }
    const titleTag = memory.tags?.find(t => t.startsWith('audio_title:'));
    const artistTag = memory.tags?.find(t => t.startsWith('audio_artist:'));
    const coverTag = memory.tags?.find(t => t.startsWith('audio_cover:'));
    const base = url.split('/').pop() || 'Аудио';
    const title = titleTag ? titleTag.slice('audio_title:'.length) : base.replace(/\.[^.]+$/, '') || 'Аудио';
    const artist = artistTag ? artistTag.slice('audio_artist:'.length) : undefined;
    const coverUrl = coverTag ? coverTag.slice('audio_cover:'.length) : undefined;
    return { title, artist, coverUrl };
  };

  const renderContent = () => {
    if (memory.type === 'photo' && memory.mediaUrl) {
      const url = getAttachedAudioUrl();
      const meta = url ? getMusicMeta(url) : null;
      const isCurrent = url && player.current?.url === url;
      const isPlaying = !!isCurrent && player.playing;
      const title = meta?.title || (url ? (url.split('/').pop() || 'Аудио') : '');

      const extraImages = (memory.tags || [])
        .filter(t => typeof t === 'string' && t.startsWith('image_url:'))
        .map(t => t.slice('image_url:'.length))
        .filter(Boolean);
      const images = [memory.mediaUrl, ...extraImages];

      return (
        <>
          <div className="w-full bg-surface">
            {images.length === 1 ? (
              <img
                src={images[0]!}
                alt={memory.title || 'Воспоминание'}
                className="w-full max-h-[420px] sm:max-h-[480px] object-contain"
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
                {images.map((src, idx) => (
                  <img
                    key={`${src}-${idx}`}
                    src={src}
                    alt={(memory.title || 'Фото') + ` ${idx + 1}`}
                    className="w-full h-40 object-cover rounded"
                  />
                ))}
              </div>
            )}
          </div>
          {url && meta ? (
            <div className="mt-3 w-full flex items-center gap-3 justify-center px-4">
              <button
                className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${isPlaying ? 'bg-accent-strong text-primary-foreground' : 'bg-surface-soft text-primary-foreground hover:bg-surface-hover'}`}
                onClick={() => {
                  if (isCurrent) player.toggle();
                  else player.playTrack({ url, title: meta.title || title, artist: meta.artist, coverUrl: meta.coverUrl });
                }}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-wrap justify-center text-center">
                <MusicIcon className="h-4 w-4 text-text-muted flex-shrink-0" />
                <div className="text-sm text-text-primary break-words">{title}</div>
                {meta.artist ? (
                  <span className="text-sm text-text-secondary break-words">{meta.artist}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (memory.type === 'video' && memory.mediaUrl) {
      const url = getAttachedAudioUrl();
      const meta = url ? getMusicMeta(url) : null;
      const isCurrent = url && player.current?.url === url;
      const isPlaying = !!isCurrent && player.playing;
      const title = meta?.title || (url ? (url.split('/').pop() || 'Аудио') : '');
      return (
        <>
          <div className="relative">
            <video 
              src={memory.mediaUrl}
              controls
              className="w-full max-h-[420px] sm:max-h-[480px] object-contain bg-black rounded-lg"
              poster={memory.thumbnailUrl || undefined}
            >
              Ваш браузер не поддерживает видео.
            </video>
          </div>
          {url && meta ? (
            <div className="mt-3 w-full flex items-center gap-3 justify-center px-4">
              <button
                className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${isPlaying ? 'bg-accent-strong text-primary-foreground' : 'bg-surface-soft text-primary-foreground hover:bg-surface-hover'}`}
                onClick={() => {
                  if (isCurrent) player.toggle();
                  else player.playTrack({ url, title: meta.title || title, artist: meta.artist, coverUrl: meta.coverUrl });
                }}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-wrap justify-center text-center">
                <MusicIcon className="h-4 w-4 text-text-muted flex-shrink-0" />
                <div className="text-sm text-text-primary break-words">{title}</div>
                {meta.artist ? (
                  <span className="text-sm text-text-secondary break-words">{meta.artist}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (memory.type === 'quote') {
      const rawTag = memory.tags?.find(t => t?.startsWith('quote_author:')) || null;
      const raw = rawTag ? rawTag.slice('quote_author:'.length).trim() : '';
      const author = raw ? (/^\S+$/.test(raw) ? `@${raw}` : raw) : '';
      const url = getAttachedAudioUrl();
      const meta = url ? getMusicMeta(url) : null;
      const isCurrent = url && player.current?.url === url;
      const isPlaying = !!isCurrent && player.playing;
      const title = meta?.title || (url ? (url.split('/').pop() || 'Аудио') : '');
      return (
        <div className="p-6 text-center">
          <div className="mb-4 flex items-center justify-center text-text-muted">
            <QuoteIcon className="h-10 w-10" />
          </div>
          <p className="text-lg text-text-primary leading-relaxed">"{memory.content}"</p>
          {author && (
            <p className="mt-2 text-sm text-text-secondary">{author}</p>
          )}
          {url && meta ? (
            <div className="mt-3 w-full flex items-center gap-3 justify-center px-4">
              <button
                className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ${isPlaying ? 'bg-accent-strong text-primary-foreground' : 'bg-surface-soft text-primary-foreground hover:bg-surface-hover'}`}
                onClick={() => {
                  if (isCurrent) player.toggle();
                  else player.playTrack({ url, title: meta.title || title, artist: meta.artist, coverUrl: meta.coverUrl });
                }}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-wrap justify-center text-center">
                <MusicIcon className="h-4 w-4 text-text-muted flex-shrink-0" />
                <div className="text-sm text-text-primary break-words">{title}</div>
                {meta.artist ? (
                  <span className="text-sm text-text-secondary break-words">{meta.artist}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="p-6 text-center">
        <div className="mb-4 flex items-center justify-center text-text-muted">
          <FileText className="h-10 w-10" />
        </div>
        <p className="text-lg text-text-primary leading-relaxed">{memory.content}</p>
        {(() => {
          const url = getAttachedAudioUrl();
          if (!url) return null;
          const meta = getMusicMeta(url);
          const isCurrent = player.current?.url === url;
          const isPlaying = isCurrent && player.playing;
          const title = meta.title || (url.split('/').pop() || 'Аудио');
          return (
            <div className="mt-4 mb-2 flex items-center gap-3 justify-center px-4">
              {meta.coverUrl ? (
                <img src={meta.coverUrl} alt={meta.title} className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-surface-soft flex items-center justify-center text-primary-foreground">
                  <MusicIcon className="h-6 w-6" />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-base text-text-primary truncate max-w-[160px]">{meta.title}</span>
                  {meta.artist ? (
                    <span className="text-sm text-text-secondary break-words">{meta.artist}</span>
                  ) : null}
                </div>
              </div>
              <button
                className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors ml-2 ${isPlaying ? 'bg-accent-strong text-primary-foreground' : 'bg-surface-soft text-primary-foreground hover:bg-surface-hover'}`}
                onClick={() => {
                  if (isCurrent) player.toggle();
                  else player.playTrack({ url, title: meta.title || title, artist: meta.artist, coverUrl: meta.coverUrl });
                }}
                aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
                title={isPlaying ? 'Пауза' : 'Воспроизвести'}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose} data-testid={testId}>
      <DialogContent className="glass-strong max-w-2xl p-0 sm:max-h-[85vh] max-h-[90vh] grid grid-rows-[auto,1fr,auto] overflow-hidden rounded-2xl">
        <DialogHeader className="flex-row items-center justify-between text-left space-y-0 p-4 pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2 min-w-0">
            <DialogTitle className="text-base sm:text-lg font-semibold text-foreground truncate">
              {memory.title || 'Воспоминание'}
            </DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid={`${testId}-settings-button`}
                  aria-label="Открыть меню настроек"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {onEdit && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onEdit(memory); }} className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    Изменить
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDeleteOpen(true); }} className="text-destructive focus:text-destructive">
                  Удалить…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <DialogDescription className="sr-only">
            Просмотр воспоминания с возможностью добавления комментариев и управления настройками
          </DialogDescription>
        </DialogHeader>

  <div className="overflow-y-auto min-h-0">
          <div className="p-0">
            {renderContent()}
          </div>

          <div className="p-4">
          <div className="mb-4">
            {(memory.type === 'photo' || memory.type === 'video') && (
              <p className="text-foreground mb-2">{memory.content}</p>
            )}
            <div className="flex items-center justify-start text-sm text-text-secondary">
              <span>{formatDate(memory.createdAt)}</span>
            </div>
          </div>

          <div className="border-t border-border-subtle pt-4" data-testid={`${testId}-comments`}>
            <h4 className="font-medium text-foreground mb-3">Комментарии</h4>
            
            {commentsLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-3 pb-24">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
                    <div className="w-8 h-8 bg-accent-strong rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold flex-shrink-0">
                      {authorInitialFor(comment.authorId)}
                    </div>
                    <div className="flex-1">
                      <div className="glass rounded-lg p-3">
                        <p className="text-sm text-text-primary">{comment.content}</p>
                        <p className="text-xs text-text-muted mt-1">
                          {formatCommentDate(comment.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                
                {comments.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-4">
                    Пока нет комментариев
                  </p>
                )}
              </div>
            )}

          </div>

          </div>
        </div>
        <div className="border-t border-border-subtle bg-surface p-3">
          <form onSubmit={handleAddComment} className="flex gap-3 items-center">
            <div className="w-8 h-8 bg-accent-strong rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold flex-shrink-0">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1">
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Добавить комментарий..."
                  className="text-sm"
                  data-testid={`${testId}-comment-input`}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newComment.trim() || addCommentMutation.isPending}
                  className="bg-primary text-primary-foreground"
                  data-testid={`${testId}-submit-comment`}
                  aria-label="Отправить комментарий"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить воспоминание?</AlertDialogTitle>
          <ADDescription>
            Это действие нельзя отменить.
          </ADDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Отмена</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Удаление…' : 'Удалить'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
