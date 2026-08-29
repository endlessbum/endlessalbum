import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, X } from "lucide-react";
import { MarqueeText } from "@/components/MarqueeText";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  const s = Math.max(0, Math.floor(n || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function IconButton({
  label,
  title,
  onClick,
  active,
  children,
  className,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors focus-ring",
        active
          ? "text-text-primary"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function MiniPlayer() {
  const player = useAudioPlayer();
  const hasTrack = !!player.current?.url;
  const currentUrl = player.current?.url || "";
  const currentTitle =
    player.current?.title || (currentUrl ? currentUrl.split("/").pop() || "Аудио" : "");
  const currentArtist = player.current?.artist || "";
  const currentCover = player.current?.coverUrl;

  if (!hasTrack) return null;

  return (
    <nav className="rounded-xl border border-border-subtle bg-surface p-3" data-testid="mini-player" aria-label="Мини-плеер">
      <div className="flex items-center gap-3">
        {currentCover ? (
          <img
            src={currentCover}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-primary-foreground">
            <span className="text-base leading-none">♪</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <MarqueeText className="w-full max-w-full">
            <span className="text-sm text-text-primary">{currentTitle}</span>
          </MarqueeText>
          {currentArtist ? (
            <div className="truncate text-[11px] text-text-muted">{currentArtist}</div>
          ) : null}
        </div>
        <IconButton
          label="Закрыть плеер"
          title="Закрыть плеер"
          onClick={() => player.close()}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(1, Math.round(player.duration))}
        value={Math.round(player.currentTime)}
        onChange={(e) => player.seek(parseInt(e.target.value || "0", 10))}
        aria-label="Прогресс"
        className="mt-3 w-full h-1 accent-primary"
      />
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-text-secondary">
        <span>{fmt(player.currentTime)}</span>
        <span>{fmt(player.duration)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <IconButton label="Перемешивание" title="Перемешивание" onClick={player.toggleShuffle} active={player.shuffle}>
          <Shuffle className="h-4 w-4" />
        </IconButton>
        <IconButton label="Предыдущий" title="Предыдущий" onClick={player.prev}>
          <SkipBack className="h-4 w-4" />
        </IconButton>
        <button
          type="button"
          aria-label={player.playing ? "Пауза" : "Воспроизвести"}
          title={player.playing ? "Пауза" : "Воспроизвести"}
          onClick={player.toggle}
          className={cn(
            "inline-flex items-center justify-center h-10 w-10 rounded-full text-primary-foreground transition-colors focus-ring",
            "bg-accent-strong hover:bg-accent-hover",
          )}
        >
          {player.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </button>
        <IconButton label="Следующий" title="Следующий" onClick={player.next}>
          <SkipForward className="h-4 w-4" />
        </IconButton>
        <IconButton
          label="Повтор"
          title={player.repeat === "none" ? "Без повтора" : player.repeat === "all" ? "Повтор всего" : "Повтор одного"}
          onClick={() =>
            player.setRepeat(player.repeat === "none" ? "all" : player.repeat === "all" ? "one" : "none")
          }
          active={player.repeat !== "none"}
        >
          {player.repeat === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
        </IconButton>
      </div>
    </nav>
  );
}
