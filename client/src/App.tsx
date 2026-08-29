import React, { Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import GlobalErrorToasts from "@/components/GlobalErrorToasts";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { ThemeProvider } from "@/components/theme-provider";
import { ProtectedRoute } from "./lib/protected-route";
import AppShell from "@/components/layout/app-shell";
import { Loader2 } from "lucide-react";

const NotFound = React.lazy(() => import("@/pages/not-found"));
const AuthPage = React.lazy(() => import("@/pages/auth-page"));
const PrivacyPolicyPage = React.lazy(() => import("@/pages/privacy-policy"));
const TermsPage = React.lazy(() => import("@/pages/terms"));
const HomePage = React.lazy(() => import("@/pages/home-page"));
const ChatPage = React.lazy(() => import("@/pages/chat-page"));
const ProfilePage = React.lazy(() => import("@/pages/profile-page"));
const SettingsPage = React.lazy(() => import("@/pages/settings-page"));
const GamesPage = React.lazy(() => import("@/pages/games-page"));
const MusicPage = React.lazy(() => import("@/pages/music-page"));

import { AudioPlayerProvider } from "./hooks/use-audio-player";

function Fallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Loader2 className="h-6 w-6 animate-spin text-border" />
    </div>
  );
}

// Stable component references so ProtectedRoute doesn't remount the page
// subtree when the parent re-renders (an inline arrow would create a new
// element type on every Router render, resetting form state).
function AuthRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuthPage />
    </Suspense>
  );
}
function PrivacyRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <PrivacyPolicyPage />
    </Suspense>
  );
}
function TermsRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <TermsPage />
    </Suspense>
  );
}
function HomeRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <HomePage />
    </Suspense>
  );
}
function MusicRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <MusicPage />
    </Suspense>
  );
}
function GamesRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <GamesPage />
    </Suspense>
  );
}
function MessagesRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <ChatPage />
    </Suspense>
  );
}
function SettingsRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <SettingsPage />
    </Suspense>
  );
}
function ProfileRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <ProfilePage />
    </Suspense>
  );
}
function NotFoundRoute() {
  return (
    <Suspense fallback={<Fallback />}>
      <NotFound />
    </Suspense>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/auth" component={AuthRoute} />
      <Route path="/privacy" component={PrivacyRoute} />
      <Route path="/terms" component={TermsRoute} />
      <ProtectedRoute path="/" component={HomeRoute} />
      <ProtectedRoute path="/music" component={MusicRoute} />
      <ProtectedRoute path="/games" component={GamesRoute} />
      <ProtectedRoute path="/messages" component={MessagesRoute} />
      <ProtectedRoute path="/settings" component={SettingsRoute} />
      <ProtectedRoute path="/profile" component={ProfileRoute} />
      <Route component={NotFoundRoute} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="app-theme">
        <AuthProvider>
          <TooltipProvider>
            <AudioPlayerProvider>
              <AppContent />
            </AudioPlayerProvider>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

function AppContent() {
  const { user } = useAuth();
  return (
    <>
      <Toaster />
      <GlobalErrorToasts />
      <ErrorBoundary
        fallback={
          <div className="flex flex-col items-center justify-center min-h-[50vh] p-6">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">Что-то пошло не так</h2>
            <p className="text-muted-foreground mb-4">Попробуйте перезагрузить страницу</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-accent-hover transition-colors"
            >
              Перезагрузить
            </button>
          </div>
        }
      >
        {user ? (
          <AppShell>
            <Router />
          </AppShell>
        ) : (
          <Router />
        )}
      </ErrorBoundary>
    </>
  );
}
