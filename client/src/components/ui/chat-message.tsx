import { toast } from '@/hooks/use-toast';
import React, { useState, useEffect, useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Edit2, Trash2, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface Message {
  id: string;
  content: string;
  createdAt: string | number | Date;
  type?: string;
  mediaUrl?: string;
  isEphemeral?: boolean;
  expiresAt?: string | number | Date;
  isRead?: boolean;
  reactions?: Record<string, string[]>;
}

interface WordAnimation {
  word: string;
  animation: string;
}

const DEFAULT_WORD_ANIMATIONS: WordAnimation[] = [
  { word: "люблю", animation: "pulse" },
  { word: "счастье", animation: "blush" }
];

function getAnimationClass(anim: string) {
  if (anim === "blush") return "bg-surface-hover text-primary-foreground px-1 rounded";
  return "bg-surface-hover text-primary-foreground px-1 rounded animate-pulse";
}

function formatTime(date: Date | string | number | null) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessage({ message, isOwn, userId, dataTestId }: {
  message: Message;
  isOwn: boolean;
  userId?: string;
  dataTestId?: string;
}) {
  const queryClient = useQueryClient();
  const [messageFontSize, setMessageFontSize] = useState<string>('text-sm');

  useEffect(() => {
    try {
      const size = localStorage.getItem('ui:messageFontSize') || 'text-sm';
      setMessageFontSize(size);
    } catch {}
    
    const handleStorage = () => {
      try {
        const size = localStorage.getItem('ui:messageFontSize') || 'text-sm';
        setMessageFontSize(size);
      } catch {}
    };
    
    window.addEventListener('storage', handleStorage);
    const handleCustom = (e: Event) => {
      const ce = e as CustomEvent<{ key: string; value: string }>;
      if (ce.detail?.key === 'ui:messageFontSize') {
        setMessageFontSize(ce.detail.value);
      }
    };
    window.addEventListener('uiSettingsChanged', handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('uiSettingsChanged', handleCustom as EventListener);
    };
  }, []);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [wordAnimations, setWordAnimations] = useState<WordAnimation[]>(() => {
    try {
      const raw = localStorage.getItem('ui:wordAnimations');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return DEFAULT_WORD_ANIMATIONS;
  });
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const readMarkedRef = useRef(false);

  const validateWord = (word: string): boolean => {
    return /^[а-яёa-zА-ЯЁA-Z\s]{1,30}$/u.test(word.trim());
  };
  
  const safeWordAnimations = wordAnimations.filter(
    (w): w is WordAnimation => typeof w.word === 'string' && validateWord(w.word)
  );

  useEffect(() => {
    if (!message.isEphemeral || !message.expiresAt) {
      setTimeRemaining(null);
      return;
    }
    const updateTimer = () => {
      const now = new Date();
      const expiresAt = new Date(message.expiresAt!);
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      setTimeRemaining(remaining);
    };
    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);
    return () => clearInterval(intervalId);
  }, [message.isEphemeral, message.expiresAt]);

  useEffect(() => {
    if (!message.isEphemeral) return;
    const onVis = () => {
      const visible = document.visibilityState === 'visible';
      if (!visible) {
        setBlocked(true);
        setUnlocked(false);
      } else {
        setBlocked(false);
      }
    };
    const onBlur = () => {
      setBlocked(true);
      setUnlocked(false);
    };
    const onFocus = () => {
      setBlocked(false);
    };
    const onFs = () => {
      if (document.fullscreenElement) {
        setBlocked(true);
        setUnlocked(false);
      } else {
        setBlocked(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [message.isEphemeral]);

  useEffect(() => {
    const onStorage = () => {
      try {
        const raw = localStorage.getItem('ui:wordAnimations');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setWordAnimations(parsed);
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    const onCustom = (e: Event) => {
      try {
        const detail = (e as CustomEvent).detail;
        if (detail?.items && Array.isArray(detail.items)) {
          setWordAnimations(detail.items as WordAnimation[]);
        }
      } catch {}
    };
    window.addEventListener('wordAnimationsChanged', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('wordAnimationsChanged', onCustom as EventListener);
    };
  }, []);

  const hasBlushWord = (() => {
    if (!message.content) return false;
    const blushWords = safeWordAnimations.filter(w => w.animation === 'blush').map(w => w.word.toLowerCase());
    if (blushWords.length === 0) return false;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${blushWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu');
    return pattern.test(message.content);
  })();

  function renderHighlightedText(text: string): React.ReactNode[] {
    const loveWords = safeWordAnimations.map(w => w.word.toLowerCase());
    if (loveWords.length === 0) return [text];
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(${loveWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const word = match[0];
      const anim = safeWordAnimations.find(w => w.word.toLowerCase() === word.toLowerCase());
      const cls = getAnimationClass(anim?.animation || 'pulse');
      parts.push(<span key={`highlight-${match.index}`} className={cls}>{word}</span>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    return parts.length > 0 ? parts : [text];
  }

  const editMutation = useMutation({
    mutationFn: async (newContent: string) => {
      const payload = { content: newContent, type: message.type || 'text', mediaUrl: message.mediaUrl };
      const res = await apiRequest(`/api/messages/${message.id}`, 'PUT', payload);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Ошибка редактирования');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
  toast({ title: 'Ошибка редактирования', description: err?.message || 'Ошибка редактирования', variant: 'destructive' });
    },
  });

  function handleEditSave() {
    setLoading(true);
    editMutation.mutate(editContent, {
      onSettled: () => setLoading(false),
    });
  }

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/messages/${message.id}`, 'DELETE');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Ошибка удаления');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
      setDeleteOpen(false);
    },
    onError: (err: Error) => {
  toast({ title: 'Ошибка удаления', description: err?.message || 'Ошибка удаления', variant: 'destructive' });
    },
  });

  function handleDelete() {
    setLoading(true);
    deleteMutation.mutate(undefined, {
      onSettled: () => setLoading(false),
    });
  }

  // Реакции и прочтение персистятся на сервер (PUT /api/messages/:id) и
  // синхронизируются с партнёром через WS-событие chat_message_update.
  const reactionMutation = useMutation({
    mutationFn: async (reactions: Record<string, string[]>) => {
      const res = await apiRequest(`/api/messages/${message.id}`, 'PUT', { reactions });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Ошибка обновления реакции');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Ошибка реакции', description: err?.message || 'Ошибка обновления реакции', variant: 'destructive' });
    },
  });

  const readMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/messages/${message.id}`, 'PUT', { isRead: true });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Не удалось отметить сообщение прочитанным');
      }
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
    },
  });

  const heartReacted = !!message.reactions?.['❤️']?.includes(userId ?? '');
  const heartCount = message.reactions?.['❤️']?.length ?? 0;

  const toggleHeartReaction = () => {
    if (!userId) return;
    const current = message.reactions?.['❤️'] ?? [];
    const next = heartReacted
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    const { ['❤️']: _removed, ...remaining } = message.reactions ?? {};
    const reactions: Record<string, string[]> = heartReacted
      ? remaining
      : { ...remaining, '❤️': next };
    reactionMutation.mutate(reactions);
  };

  // Отмечаем прочитанными чужие сообщения (кроме эфемерных — они исчезают
  // сами, а «прочитано» на них лишено смысла). По одному PUT на сообщение:
  // readMarkedRef не даёт отправить повторно, даже если эффект перезапустится.
  useEffect(() => {
    if (!isOwn && !message.isEphemeral && !message.isRead && !readMarkedRef.current) {
      readMarkedRef.current = true;
      readMutation.mutate();
    }
  }, [isOwn, message.isEphemeral, message.isRead, readMutation]);

  function renderMessageContent() {
    if (message.type === 'image' && message.mediaUrl) {
      return <img src={message.mediaUrl} alt="Изображение" className="max-w-full rounded-lg" />;
    }
    if (message.type === 'video' && message.mediaUrl) {
      return <video src={message.mediaUrl} controls className="max-w-full rounded-lg" />;
    }
    if (message.type === 'voice' && message.mediaUrl) {
      return <audio src={message.mediaUrl} controls className="max-w-full rounded-lg" preload="metadata" />;
    }
    if (message.type === 'document' && message.mediaUrl) {
      return <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary underline">Документ</a>;
    }
    if (message.type === 'ephemeral_image' || message.type === 'ephemeral_video') {
      if (timeRemaining === 0) {
        return <div className="flex items-center justify-center p-4 text-muted-foreground"><span className="text-sm">Медиа исчезло</span></div>;
      }
      const showOverlay = !unlocked || blocked;
      return (
        <div className="relative" data-testid={`${dataTestId}-ephemeral-media`}>
          <div className={`relative max-w-full overflow-hidden rounded-lg ${showOverlay ? 'blur-sm' : ''}`}>
            {message.type === 'ephemeral_image' ? (
              <img src={message.mediaUrl || undefined} alt="Эфемерное фото" className="w-full" />
            ) : (
              <video src={message.mediaUrl || undefined} className="w-full" controls={!showOverlay} />
            )}
          </div>
          {showOverlay && (
            <button
              type="button"
              className="absolute inset-0 flex flex-col items-center justify-center bg-background text-text-primary text-sm gap-2 rounded-lg"
              onClick={() => { if (!blocked) setUnlocked(true); }}
              data-testid={`${dataTestId}-ephemeral-lock-overlay`}
            >
              Нажмите для просмотра
            </button>
          )}
          {timeRemaining !== null && !showOverlay && (
            <span
              className="absolute bottom-1 right-1 bg-background text-text-primary text-[10px] px-1.5 py-0.5 rounded"
              data-testid={`${dataTestId}-ephemeral-timer`}
            >
              {timeRemaining}с
            </span>
          )}
        </div>
      );
    }
    return <p className="text-foreground whitespace-pre-wrap break-words">{renderHighlightedText(message.content || '')}</p>;
  }

  const isShortMessage = message.content && message.content.length <= 50 && !message.content.includes('\n') && !message.type?.startsWith('ephemeral');

  return (
    <div className={`flex py-0.5 message-animation ${isOwn ? 'justify-end' : 'justify-start'}`} data-testid={dataTestId}>
      <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* bubble */}
        <div className={`rounded-lg px-3 py-1.5 ${messageFontSize} ${isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-surface-hover text-text-primary rounded-bl-sm border border-border-subtle'} ${hasBlushWord ? 'blush-bubble' : ''} ${isShortMessage ? 'inline-flex' : ''}`}>
          {isEditing ? (
            <div className="w-full">
              <textarea 
                className="w-full bg-transparent p-0 text-inherit resize-none outline-none" 
                value={editContent} 
                onChange={e => setEditContent(e.target.value)} 
                disabled={loading} 
                rows={2} 
                autoFocus
              />
              <div className="flex gap-2 justify-center mt-1 pt-1 border-t border-border">
                <button 
                  className="text-xs px-3 py-1 rounded-lg bg-muted text-foreground hover:bg-surface-hover" 
                  onClick={() => setIsEditing(false)} 
                  disabled={loading}
                >
                  Отмена
                </button>
                <button 
                  className="text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:bg-accent-hover" 
                  onClick={handleEditSave} 
                  disabled={loading}
                >
                  Сохранить
                </button>
              </div>
            </div>
          ) : (
            renderMessageContent()
          )}
        </div>
        
        {/* Время и кнопка действий - только для своих сообщений */}
        {isOwn ? (
          <div className="flex items-center gap-1 mt-0.5 group">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded-full hover:bg-surface-hover transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Действия с сообщением"
                  data-testid={`actions-menu-${dataTestId}`}
                  disabled={loading}
                >
                  <MoreVertical className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-[140px]">
                <DropdownMenuItem
                  onClick={() => setIsEditing(true)}
                  disabled={loading}
                  className="flex items-center gap-2 cursor-pointer"
                  data-testid={`edit-action-${dataTestId}`}
                >
                  <Edit2 className="w-4 h-4 mr-1" />
                  <span>Изменить</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  disabled={loading}
                  className="flex items-center gap-2 text-destructive cursor-pointer"
                  data-testid={`delete-action-${dataTestId}`}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  <span>Удалить</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-[9px] text-muted-foreground">{formatTime(message.createdAt)}</span>
            {message.isRead && (
              <Check
                className="w-3 h-3 text-primary"
                aria-label="Прочитано"
                data-testid={`read-mark-${dataTestId}`}
              />
            )}
          </div>
        ) : (
          /* Время для чужих сообщений - слева */
          <div className="flex items-center gap-1 mt-0.5 group">
             <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded-full hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                  aria-label="Действия"
                  data-testid={`actions-menu-${dataTestId}`}
                  disabled={loading}
                >
                  <MoreVertical className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-[140px]">
                <DropdownMenuItem
                  onClick={toggleHeartReaction}
                  disabled={reactionMutation.isPending}
                  className="flex items-center gap-2 cursor-pointer"
                  data-testid={`reaction-action-${dataTestId}`}
                >
                  <span className="w-4 h-4 mr-1 inline-flex items-center justify-center">❤️</span>
                  <span>{heartReacted ? 'Убрать реакцию' : 'Отреагировать'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
                <span className="text-[9px] text-muted-foreground">{formatTime(message.createdAt)}</span>
          </div>
        )}
        
        {/* Реакция "сердце" для чужих сообщений */}
        {!isOwn && (
          <button
            className={`text-xs px-1.5 py-0.5 rounded-full transition-all mt-0.5 inline-flex items-center gap-1 ${
              heartReacted ? 'bg-primary text-primary-foreground' : 'bg-surface-hover text-text-primary hover:bg-accent-hover'
            }`}
            data-testid={`reaction-heart-${dataTestId}`}
            onClick={toggleHeartReaction}
            disabled={reactionMutation.isPending}
          >
            <span>❤️</span>
            {heartCount > 0 && <span data-testid={`reaction-count-${dataTestId}`}>{heartCount}</span>}
          </button>
        )}
      </div>
      
      {/* Диалог подтверждения удаления */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
          <div className="bg-popover rounded-2xl border border-border-subtle p-4 min-w-[280px] max-w-[90vw] flex flex-col gap-3">
            <div className="text-base font-medium">Удалить сообщение?</div>
            <div className="text-muted-foreground text-sm">Это действие необратимо</div>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1.5 rounded-lg hover:bg-surface-hover text-sm" onClick={() => setDeleteOpen(false)} disabled={loading}>Отмена</button>
              <button className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:bg-accent-hover text-sm" onClick={handleDelete} disabled={loading}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}