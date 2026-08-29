import { Link, useLocation } from "wouter";
import { Gamepad2, Home, Mail, Music, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/music", label: "Музыка", icon: Music },
  { href: "/games", label: "Игры", icon: Gamepad2 },
  { href: "/messages", label: "Сообщения", icon: Mail },
  { href: "/profile", label: "Профиль", icon: User },
  { href: "/settings", label: "Настройки", icon: Settings },
] as const;

function isActivePath(location: string, href: string) {
  if (href === "/") return location === "/";
  return location.startsWith(href);
}

export function SidebarNav({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const [location] = useLocation();
  return (
    <ul className={cn("flex flex-col gap-1", compact && "flex-row gap-0.5")}>
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(location, item.href);
        if (compact) {
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-label={item.label}
                title={item.label}
                onClick={onNavigate}
                className={cn(
                  "inline-flex items-center justify-center h-10 w-10 rounded-full transition-colors focus-ring",
                  active
                    ? "bg-sidebar-active text-sidebar-foreground"
                    : "text-text-secondary hover:text-text-primary hover:bg-sidebar-hover",
                )}
              >
                <Icon className="h-5 w-5" />
              </Link>
            </li>
          );
        }
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-ring",
                active
                  ? "bg-sidebar-active text-sidebar-foreground"
                  : "text-text-secondary hover:text-text-primary hover:bg-sidebar-hover",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-accent-strong")} />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
