import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ChatMessage from '@/components/ui/chat-message';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Palette, Paperclip, Image, Mic, Send, Timer, Camera, FileText, Video, MessageCircle } from 'lucide-react';
import { getChatBackgroundStyle, type ChatBackgroundKey } from '@/lib/chatBackgrounds';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { apiRequest, csrfUploadFetch } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { subscribeWs, sendWs } from '@/lib/ws';
import type { Message, User } from '@shared/schema';
import EphemeralCapture from '@/components/ephemeral-capture';
import EphemeralUpload from '@/components/ephemeral-upload';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type PartnerResponse = {
  partner: Pick<
    User,
    | 'id'
    | 'username'
    | 'firstName'
    | 'lastName'
    | 'profileImageUrl'
    | 'isOnline'
    | 'lastSeen'
    | 'role'
  > | null;
};

export default function ChatPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileInputImageRef = useRef<HTMLInputElement | null>(null);
  const fileInputVideoRef = useRef<HTMLInputElement | null>(null);
  const fileInputDocRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [chatBgKey, setChatBgKey] = useState<ChatBackgroundKey>(() => {
    try {
      return (localStorage.getItem('ui:chatBackground') as ChatBackgroundKey) || 'none';
    } catch {
      return 'none';
    }
  });

  const { data: messagesResponse, isLoading } = useQuery<{ messages: Message[]; pagination: unknown }>({
    queryKey: ['/api/messages'],
    staleTime: 1000 * 60, // Consider data stale after 1 minute
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes
  });

  const messages = useMemo(() => messagesResponse?.messages ?? [], [messagesResponse]);

  const { data: partnerData } = useQuery<PartnerResponse>({
    queryKey: ['/api/partner'],
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: {
      content: string;
      type: string;
      isEphemeral?: boolean;
      expiresAt?: string;
      mediaUrl?: string | null;
    }) => {
      const res = await apiRequest('/api/messages', 'POST', messageData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
      setNewMessage('');
      setEphemeralMode(false);
    },
  });

  const sendEphemeralMedia = async (file: File, kind: 'photo' | 'video') => {
    try {
      const fd = new FormData();
      const isPhoto = kind === 'photo';
      fd.append(isPhoto ? 'image' : 'video', file);
      const endpoint = isPhoto ? '/api/upload/memory-image' : '/api/upload/memory-video';
      const res = await csrfUploadFetch(endpoint, 'POST', fd);
      const j = await res.json();
      if (!res.ok || !j?.url) throw new Error(j?.message || 'Ошибка загрузки');
      const msgType = isPhoto ? 'ephemeral_image' : 'ephemeral_video';
      // Сохраняем относительный /uploads/... путь как есть: сервер по нему
      // находит файл при очистке эфемерных сообщений (абсолютный URL не
      // резолвится и файл «зависал» на диске навсегда).
      sendMessageMutation.mutate({
        content: '',
        type: msgType,
        isEphemeral: true,
        mediaUrl: j.url,
      });
    } catch (e) {
      toast({ 
        title: "Ошибка загрузки", 
        description: e instanceof Error ? e.message : "Не удалось загрузить эфемерный медиафайл", 
        variant: "destructive" 
      });
    }
  };

  const sendRegularUpload = async (file: File, kind: 'image' | 'video' | 'document') => {
    try {
      const fd = new FormData();
      let endpoint = '';
      if (kind === 'image') {
        fd.append('image', file);
        endpoint = '/api/upload/memory-image';
      } else if (kind === 'video') {
        fd.append('video', file);
        endpoint = '/api/upload/memory-video';
      } else {
        fd.append('document', file);
        endpoint = '/api/upload/document';
      }

      const res = await csrfUploadFetch(endpoint, 'POST', fd);
      const j = await res.json();
      if (!res.ok || !j?.url) throw new Error(j?.message || 'Ошибка загрузки');

      const typeMap = { image: 'image', video: 'video', document: 'document' } as const;
      sendMessageMutation.mutate({ content: '', type: typeMap[kind], mediaUrl: j.url });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось загрузить медиафайл", variant: "destructive" });
    }
  };

  const queryClientRef = useRef(queryClient);
  useEffect(() => {
    const unsubscribe = subscribeWs((event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat_message') {
          queryClientRef.current.invalidateQueries({ queryKey: ['/api/messages'] });
        } else if (data.type === 'chat_message_update') {
          queryClientRef.current.invalidateQueries({ queryKey: ['/api/messages'] });
        } else if (data.type === 'typing_start') {
          setPartnerTyping(true);
        } else if (data.type === 'typing_stop') {
          setPartnerTyping(false);
        } else if (data.type === 'partner_status_change') {
          // REST-снимок /api/partner устаревает, когда партнёр подключается
          // или отключается — синхронизируем его по WS-событию.
          queryClientRef.current.setQueryData<PartnerResponse>(['/api/partner'], (old) => {
            if (!old?.partner) return old;
            return {
              ...old,
              partner: {
                ...old.partner,
                isOnline: data.isOnline === true,
                lastSeen: data.lastSeen ?? old.partner.lastSeen,
              },
            };
          });
        }
      } catch {
        // Ignore parse errors
      }
    });

    return () => {
      // Clear typing timeout on cleanup
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      unsubscribe();
    };
  }, []); // Subscribe once - the shared connection lives across renders

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const onStorage = () => {
      try {
        const key = (localStorage.getItem('ui:chatBackground') as ChatBackgroundKey) || 'none';
        setChatBgKey(key);
      } catch {}
    };
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<{ key: ChatBackgroundKey }>;
      if (ce.detail?.key) setChatBgKey(ce.detail.key);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('chatBackgroundChanged', onCustom as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chatBackgroundChanged', onCustom as EventListener);
    };
  }, []);

  const handleTyping = () => {
    if (!typingRef.current) {
      typingRef.current = true;
      setIsTyping(true);
      sendWs({ type: 'typing_start' });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (typingRef.current) {
        typingRef.current = false;
        setIsTyping(false);
        sendWs({ type: 'typing_stop' });
      }
    }, 2000);
  };

  const getPartnerInitials = () => {
    if (!partnerData?.partner) return '?';
    const partner = partnerData.partner;
    if (partner.firstName && partner.lastName) {
      return (partner.firstName.charAt(0) + partner.lastName.charAt(0)).toUpperCase();
    }
    return partner.username.charAt(0).toUpperCase();
  };

  const getPartnerDisplayName = () => {
    if (!partnerData?.partner) return 'Партнер';
    const partner = partnerData.partner;
    if (partner.firstName && partner.lastName) {
      return `${partner.firstName} ${partner.lastName}`;
    }
    return partner.username;
  };

  const getPartnerStatusText = () => {
    if (!partnerData?.partner) return 'Не в сети';
    if (partnerTyping) return 'Печатает...';
    return partnerData.partner.isOnline ? 'В сети' : 'Не в сети';
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    if (isTyping) {
      setIsTyping(false);
      sendWs({ type: 'typing_stop' });
    }

    const messageData: { content: string; type: string; isEphemeral?: boolean } = {
      content: newMessage.trim(),
      type: 'text',
    };

    if (ephemeralMode) {
      messageData.isEphemeral = true;
    }

    sendMessageMutation.mutate(messageData);
  };

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    if (value.trim()) {
      handleTyping();
    }
  };

  const sendVoiceRecording = async (blob: Blob) => {
    try {
      const fd = new FormData();
      const ext = blob.type.includes('ogg')
        ? 'ogg'
        : blob.type.includes('wav')
          ? 'wav'
          : blob.type.includes('mp4') || blob.type.includes('m4a')
            ? 'm4a'
            : 'webm';
      fd.append('voice', blob, `voice_${Date.now()}.${ext}`);
      const res = await csrfUploadFetch('/api/upload/voice', 'POST', fd);
      const j = await res.json();
      if (!res.ok || !j?.url) throw new Error(j?.message || 'Ошибка загрузки');
      sendMessageMutation.mutate({ content: '', type: 'voice', mediaUrl: j.url });
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : 'Не удалось отправить голосовое сообщение',
        variant: 'destructive',
      });
    }
  };

  const handleVoiceMessage = async () => {
    if (isRecording) {
      const recorder = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          await sendVoiceRecording(blob);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast({
        title: 'Ошибка',
        description: 'Нет доступа к микрофону. Разрешите доступ в браузере.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden w-full" data-testid="chat-page">
      <main className="flex-1 flex flex-col overflow-hidden">
          {/* Центрированный контейнер */}
        <div className="max-w-2xl w-full mx-auto flex-1 flex flex-col overflow-hidden">
          {/* Заголовок чата */}
          <div
            className="px-3 py-2 flex-shrink-0 mt-4 mb-4 rounded-2xl border border-border-subtle bg-surface"
            data-testid="chat-header"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {partnerData?.partner?.profileImageUrl ? (
                    <img
                      src={partnerData.partner.profileImageUrl}
                      alt={getPartnerDisplayName()}
                      className="w-9 h-9 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium">
                      {getPartnerInitials()}
                    </div>
                  )}
                  {partnerData?.partner?.isOnline && (
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-online rounded-full border-2 border-card ${partnerTyping ? 'animate-pulse' : 'pulse-online'}`}
                      data-testid="partner-online-status"
                    ></div>
                  )}
                </div>
                <div>
                  <h2 className="font-medium text-sm text-foreground" data-testid="partner-name">
                    {getPartnerDisplayName()}
                  </h2>
                  <p
                    className={`text-xs ${partnerTyping ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
                    data-testid="partner-status"
                  >
                    {getPartnerStatusText()}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Настройки чата"
                  title="Настройки чата"
                  className="text-muted-foreground hover:text-foreground focus-ring h-9 w-9"
                  onClick={() => setLocation('/settings?tab=messages')}
                  data-testid="button-chat-theme"
                >
                  <Palette className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto hide-scrollbar px-3 py-4 pb-2 mb-4 rounded-2xl border border-border-subtle bg-surface"
            style={getChatBackgroundStyle(chatBgKey)}
            data-testid="messages-container"
          >
            <div className="space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-12">
                  <MessageCircle className="h-16 w-16 text-text-muted mb-4" strokeWidth={1.25} />
                  <p className="text-text-secondary text-center" data-testid="empty-chat-state">
                    Начните ваш разговор
                  </p>
                  <p className="text-text-muted text-xs text-center mt-1">
                    Отправьте первое сообщение
                  </p>
                </div>
              ) : (
                [...messages].reverse().map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={{
                      ...message,
                      content: message.content ?? '',
                      createdAt: message.createdAt ?? '',
                      mediaUrl: message.mediaUrl === null ? undefined : message.mediaUrl,
                      isEphemeral: message.isEphemeral === null ? undefined : message.isEphemeral,
                      expiresAt: message.expiresAt === null ? undefined : message.expiresAt,
                      isRead: message.isRead === null ? undefined : message.isRead,
                      reactions: (message.reactions as Record<string, string[]> | null) ?? undefined,
                    }}
                    isOwn={message.senderId === user?.id}
                    userId={user?.id}
                    dataTestId={`message-${message.id}`}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div
            className="px-3 py-2 flex-shrink-0 gap-2 mb-4 rounded-2xl border border-border-subtle bg-surface"
            data-testid="chat-input-container"
          >
            <form
              onSubmit={handleSendMessage}
              className="flex items-center gap-2 w-full"
            >
              <div className="flex flex-1 min-w-0 items-center gap-1 rounded-full border border-border-subtle bg-surface py-1 pl-1.5 pr-1.5 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-full text-text-secondary hover:text-text-primary"
                      data-testid="button-attach-file"
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuItem
                      onClick={() => fileInputImageRef.current?.click()}
                      data-testid="attach-regular-image"
                    >
                      <Image className="mr-2 h-4 w-4" />
                      <span>Изображение</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputVideoRef.current?.click()}
                      data-testid="attach-regular-video"
                    >
                      <Video className="mr-2 h-4 w-4" />
                      <span>Видео</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => fileInputDocRef.current?.click()}
                      data-testid="attach-document"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      <span>Документ</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setUploadOpen(true)}
                      data-testid="attach-ephemeral-upload"
                    >
                      <Image className="mr-2 h-4 w-4" />
                      <span>Эфемерное фото/видео</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setCaptureOpen(true)}
                      data-testid="attach-ephemeral-camera"
                    >
                      <Camera className="mr-2 h-4 w-4" />
                      <span>Эфемерная камера</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEphemeralMode(!ephemeralMode)}
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-full',
                    ephemeralMode
                      ? 'bg-accent-strong text-primary-foreground hover:bg-accent-hover'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                  data-testid="button-ephemeral-mode"
                  title="Текстовые сообщения как эфемерные"
                >
                  <Timer className="h-4 w-4" />
                </Button>
                <Textarea
                  value={newMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  // Сервер удалит через 2 минуты — отражаем это в плейсхолдере
                  placeholder={
                    ephemeralMode
                      ? 'Эфемерное сообщение (исчезнет через 2 мин)...'
                      : 'Напишите сообщение...'
                  }
                  className="min-h-[40px] max-h-32 resize-none w-full border-0 bg-transparent px-1 py-1.5 text-base focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-text-muted"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                  data-testid="input-message"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleVoiceMessage}
                  className={cn(
                    'h-9 w-9 shrink-0 rounded-full',
                    isRecording
                      ? 'text-destructive'
                      : 'text-text-secondary hover:text-text-primary',
                  )}
                  data-testid="button-voice-message"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!newMessage.trim() || sendMessageMutation.isPending}
                className="h-11 w-11 shrink-0 rounded-full bg-primary text-primary-foreground"
                data-testid="button-send-message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            {ephemeralMode && (
              <div className="flex items-center gap-2 px-1 mt-1.5 text-xs text-text-muted">
                <Timer className="h-3 w-3" />
                <span>Сообщение исчезнет автоматически через 2 минуты</span>
              </div>
            )}
          </div>
        </div>
      </main>
      {/* Скрытые input для обычных загрузок */}
      <input
        ref={fileInputImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) sendRegularUpload(f, 'image');
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={fileInputVideoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) sendRegularUpload(f, 'video');
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={fileInputDocRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) sendRegularUpload(f, 'document');
          e.currentTarget.value = '';
        }}
      />
      <EphemeralCapture
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        onCaptured={(file, kind) => sendEphemeralMedia(file, kind)}
      />
      <EphemeralUpload
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={(file, kind) => sendEphemeralMedia(file, kind)}
      />
    </div>
  );
}
