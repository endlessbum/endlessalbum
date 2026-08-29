import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Menu } from "lucide-react";
import Sidebar, { AppLogo } from "@/components/layout/sidebar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { Button } from "@/components/ui/button";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r border-border-subtle bg-sidebar lg:flex">
        <Sidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-40 flex flex-col border-b border-border-subtle bg-sidebar lg:hidden">
          <div className="flex h-14 items-center justify-between px-3">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Открыть меню"
              title="Открыть меню"
              className="text-text-primary"
              onClick={() => setDrawerOpen(true)}
              data-testid="mobile-menu-button"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <AppLogo />
            <div className="w-10" aria-hidden="true" />
          </div>
          <nav className="overflow-x-auto px-2 pb-2 no-scrollbar" aria-label="Основная навигация">
            <div className="flex w-max min-w-full justify-start gap-0.5">
              <SidebarNav compact />
            </div>
          </nav>
        </header>

        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </div>

      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
