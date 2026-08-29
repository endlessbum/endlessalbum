import { type Memory } from "@shared/schema";
import { Music as MusicIcon } from "lucide-react";
import { Calendar, User, Image as ImageIcon, Video as VideoIcon, Quote as QuoteIcon, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface MemoryCardProps {
  memory: Memory;
  onClick: () => void;
  'data-testid'?: string;
}

export default function MemoryCard({ memory, onClick, 'data-testid': testId }: MemoryCardProps) {
  const { user: me } = useAuth();
  const { data: partnerResp } = useQuery<{ partner: { id: string; username: string } | null }>({
    queryKey: ["/api/partner"],
    queryFn: async () => {
      const res = await apiRequest("/api/partner", "GET");
      if (!res.ok) return { partner: null };
      return await res.json();
    },
  });

  const formatDate = (date: Date | null) => {
    if (!date) return '';
  const s = new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
  });
  return s.replace(/[\u00A0 ]?г\.?$/, '');
  };

  const authorUsername = (() => {
    if (me && memory.authorId === me.id) return me.username;
    const p = partnerResp?.partner;
    if (p && memory.authorId === p.id) return p.username;
    return memory.authorId?.slice(0, 8) || 'user';
  })();

  const renderTypeIcon = () => {
    const className = "w-6 h-6 text-muted-foreground";
    switch (memory.type) {
      case 'photo':
        return <ImageIcon className={className} />;
      case 'video':
        return <VideoIcon className={className} />;
      case 'quote':
        return <QuoteIcon className={className} />;
      case 'text':
      default:
        return <FileText className={className} />;
    }
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
    try {
      const keys = ['music_meta_v1', 'music_meta_v1_own', 'music_meta_v1_partner'];
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const map = JSON.parse(raw) as Record<string, { title: string; artist?: string; coverUrl?: string }>;
        const m = map[url];
        if (m && m.title) return m;
      }
    } catch {}
    const titleTag = memory.tags?.find(t => t.startsWith('audio_title:'));
    const artistTag = memory.tags?.find(t => t.startsWith('audio_artist:'));
    const coverTag = memory.tags?.find(t => t.startsWith('audio_cover:'));
    return {
      title: titleTag ? titleTag.slice('audio_title:'.length) : (url.split('/').pop() || 'Аудио').replace(/\.[^.]+$/, '') || 'Аудио',
      artist: artistTag ? artistTag.slice('audio_artist:'.length) : undefined,
      coverUrl: coverTag ? coverTag.slice('audio_cover:'.length) : undefined,
    };
  };

  const renderFront = () => {
    const attachedUrl = getAttachedAudioUrl();
    const musicMeta = attachedUrl ? getMusicMeta(attachedUrl) : null;

    const getCardObjectPosition = () => {
      const tx = memory.tags?.find(t => t.startsWith('card_pos_x:'))?.slice('card_pos_x:'.length) || '';
      const ty = memory.tags?.find(t => t.startsWith('card_pos_y:'))?.slice('card_pos_y:'.length) || '';
      const x = Math.max(0, Math.min(100, parseInt(tx || '50', 10)));
      const y = Math.max(0, Math.min(100, parseInt(ty || '50', 10)));
      return `${x}% ${y}%`;
    };

    if (memory.type === 'photo' && memory.mediaUrl) {
      return (
        <div className="flip-card-front rounded-xl overflow-hidden relative border border-border-subtle bg-surface">
          <img src={memory.mediaUrl} alt={memory.title || 'Воспоминание'} className="w-full h-full object-cover" style={{ objectPosition: getCardObjectPosition() }} />
          {musicMeta && (
            <div className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-2 bg-background border border-border-subtle rounded-md px-2 py-1">
              {musicMeta.coverUrl ? (
                <img src={musicMeta.coverUrl} alt="Обложка" className="h-5 w-5 rounded object-cover" />
              ) : (
                <MusicIcon className="h-4 w-4 text-text-primary" />
              )}
              <div className="text-xs font-medium truncate text-text-primary drop-shadow-md" title={musicMeta.title}>{musicMeta.title}</div>
            </div>
          )}
        </div>
      );
    }

    if (memory.type === 'video' && memory.mediaUrl) {
      return (
        <div className="flip-card-front rounded-xl overflow-hidden relative border border-border-subtle bg-surface">
          {memory.thumbnailUrl ? (
            <img
              src={memory.thumbnailUrl}
              alt={memory.title || 'Видео'}
              className="w-full h-full object-cover bg-muted"
              style={{ objectPosition: getCardObjectPosition() }}
            />
          ) : (
            <div className="w-full h-full bg-muted" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
              <div className="w-0 h-0 border-l-[12px] border-l-primary-foreground border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1"></div>
            </div>
          </div>
          {musicMeta && (
            <div className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-2 bg-background border border-border-subtle rounded-md px-2 py-1">
              {musicMeta.coverUrl ? (
                <img src={musicMeta.coverUrl} alt="Обложка" className="h-5 w-5 rounded object-cover" />
              ) : (
                <MusicIcon className="h-4 w-4 text-text-primary" />
              )}
              <div className="text-xs font-medium truncate text-text-primary drop-shadow-md" title={musicMeta.title}>{musicMeta.title}</div>
            </div>
          )}
        </div>
      );
    }

    if (memory.type === 'quote') {
      const rawAuthorTag = memory.tags?.find(t => t?.startsWith('quote_author:')) || null;
      const authorRaw = rawAuthorTag ? rawAuthorTag.slice('quote_author:'.length).trim() : '';
      const author = authorRaw
        ? (/^\S+$/.test(authorRaw) ? `@${authorRaw}` : authorRaw)
        : '';
      return (
        <div className="flip-card-front rounded-xl p-5 flex flex-col items-center justify-center text-center relative bg-surface border border-border-subtle">
          <span className="mb-2 text-3xl leading-none text-secondary" aria-hidden="true">“</span>
          <p className="text-sm font-medium italic text-text-primary leading-relaxed">{memory.content}</p>
          {author && (
            <p className="mt-2 text-sm text-text-secondary">{author}</p>
          )}
          {musicMeta && (
            <div className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-2 bg-background border border-border-subtle rounded-md px-2 py-1">
              {musicMeta.coverUrl ? (
                <img src={musicMeta.coverUrl} alt="Обложка" className="h-5 w-5 rounded object-cover" />
              ) : (
                <MusicIcon className="h-4 w-4 text-text-primary" />
              )}
              <div className="text-xs font-medium truncate text-text-primary drop-shadow-md" title={musicMeta.title}>{musicMeta.title}</div>
            </div>
          )}
        </div>
      );
    }

    if (memory.type === 'text') {
      return (
        <div className="flip-card-front rounded-xl p-6 flex flex-col justify-center relative bg-surface border border-border-subtle">
          {memory.title && (
            <h3 className="text-lg font-semibold text-text-primary mb-2">{memory.title}</h3>
          )}
          <p className="text-sm text-text-secondary line-clamp-4 leading-relaxed">{memory.content}</p>
          {musicMeta && (
            <div className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-2 bg-background rounded-md px-2 py-1">
              {musicMeta.coverUrl ? (
                <img src={musicMeta.coverUrl} alt="Обложка" className="h-5 w-5 rounded object-cover" />
              ) : (
                <MusicIcon className="h-4 w-4 text-text-primary" />
              )}
              <div className="text-xs font-medium truncate text-text-primary drop-shadow-md" title={musicMeta.title}>{musicMeta.title}</div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flip-card-front rounded-xl p-6 flex items-center justify-center relative bg-surface border border-border-subtle">
        {renderTypeIcon()}
        {musicMeta && (
          <div className="absolute left-2 bottom-2 max-w-[85%] flex items-center gap-2 bg-background rounded-md px-2 py-1">
            {musicMeta.coverUrl ? (
              <img src={musicMeta.coverUrl} alt="Обложка" className="h-5 w-5 rounded object-cover" />
            ) : (
              <MusicIcon className="h-4 w-4 text-text-primary" />
            )}
            <div className="text-xs font-medium truncate text-text-primary drop-shadow-md" title={musicMeta.title}>{musicMeta.title}</div>
          </div>
        )}
      </div>
    );
  };

  const ratioTag = (memory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_ratio:')) as string | undefined;
  const orientTag = (memory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_orient:')) as string | undefined;
  const ratioRaw = ratioTag ? ratioTag.slice('card_ratio:'.length) : undefined; // e.g., "3:4"
  const orientRaw = orientTag ? orientTag.slice('card_orient:'.length) : undefined; // "horizontal" | "vertical"
  const allowedRatios = new Set(['9:16','4:5','5:7','3:4','3:5','2:3']);

  let sizeClass = '';
  if (ratioRaw && allowedRatios.has(ratioRaw)) {
    const rKey = ratioRaw.replace(':', '-');
    const oShort = (orientRaw === 'vertical') ? 'v' : 'h'; // default to horizontal
    sizeClass = `card-ar-${rKey}-${oShort}`;
  } else {
    const layoutTag = (memory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_layout:')) as string | undefined;
    const layout = layoutTag ? layoutTag.slice('card_layout:'.length) : undefined;
    sizeClass = layout === 'portrait' ? 'card-size-portrait' :
                layout === 'landscape' ? 'card-size-landscape' :
                layout === 'wide' ? 'card-size-wide' :
                layout === 'tall' ? 'card-size-tall' :
                layout === 'large' ? 'card-size-large' :
                'card-size-square';
  }

  let spanClass = '';
  if (ratioRaw && (orientRaw !== 'vertical')) {
    const wide = new Set(['9:16','3:5','2:3']); // -> 16:9, 5:3, 3:2
    if (wide.has(ratioRaw)) {
      spanClass = 'lg:col-span-2 xl:col-span-2 2xl:col-span-2';
    }
  } else {
    const layoutTag2 = (memory.tags || []).find(t => typeof t === 'string' && t.startsWith('card_layout:')) as string | undefined;
    const layout2 = layoutTag2 ? layoutTag2.slice('card_layout:'.length) : undefined;
    if (layout2 === 'wide') spanClass = 'lg:col-span-2 xl:col-span-2 2xl:col-span-2';
  }

  return (
    <div className={`flip-card cursor-pointer ${sizeClass} ${spanClass}`} onClick={onClick} data-testid={testId}>
      <div className="flip-card-inner">
        {renderFront()}

        <div className="flip-card-back rounded-xl p-5 flex flex-col justify-center text-center bg-surface-hover border border-border-subtle">
          <h3 className="text-base font-semibold text-text-primary mb-2">
            {memory.title || (memory.type === 'quote' ? 'Цитата' : 'Воспоминание')}
          </h3>
          <p className="text-sm text-text-secondary mb-3 line-clamp-4 leading-relaxed">
            {memory.type === 'quote'
              ? (memory.content ? `"${memory.content}"` : 'Нет описания')
              : (memory.content || 'Нет описания')}
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
            <User className="w-3 h-3" />
            <span>@{authorUsername}</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-text-muted mt-2">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(memory.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
