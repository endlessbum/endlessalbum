import { useState } from "react";
import { Link } from "wouter";
import { LogOut, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import MiniPlayer from "@/components/layout/mini-player";
import CreateMemoryModal from "@/components/create-memory-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-strong text-primary-foreground">
        <span className="text-sm leading-none">∞</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-text-primary">Endlessalbum</div>
        <div className="text-[10px] uppercase tracking-widest text-text-muted">Альбом</div>
      </div>
    </div>
  );
}

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logoutMutation } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const initials = user?.firstName && user?.lastName
    ? (user.firstName.charAt(0) + user.lastName.charAt(0)).toUpperCase()
    : (user?.username?.charAt(0) || "?").toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border-subtle p-4">
        <Link href="/" className="inline-block focus-ring rounded-md" aria-label="Endlessalbum">
          <AppLogo />
        </Link>
        <Button
          className="mt-4 w-full justify-start gap-2 rounded-lg border border-border-subtle bg-surface text-text-primary hover:bg-surface-hover"
          variant="ghost"
          aria-label="Добавить воспоминание"
          title="Добавить"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Основная навигация">
        <SidebarNav onNavigate={onNavigate} />
      </nav>

      <div className="shrink-0 border-t border-border-subtle p-3">
        <MiniPlayer />
        <div className="mt-3 flex items-center gap-3">
          {user?.profileImageUrl ? (
            <img
              src={user.profileImageUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full object-cover border border-border-subtle"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-strong text-sm font-medium text-primary-foreground">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm text-text-primary">
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : user?.username}
            </div>
            <div className="truncate text-xs text-text-muted">@ {user?.username}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Выйти"
            title="Выйти"
            onClick={() => logoutMutation.mutate()}
            className="text-text-secondary hover:text-text-primary"
            data-testid="sidebar-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CreateMemoryModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        data-testid="create-memory-modal-from-sidebar"
      />
    </div>
  );
}
