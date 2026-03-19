import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { HelpCircle, Settings, Home as HomeIcon, Map as MapIcon, FileChartColumn, Target, Lock, LockOpen } from "lucide-react";
import { ThemeProvider } from "next-themes";
import { TeamsProvider, useTeams, pilotNameToSlug } from "./contexts/TeamsContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PasswordModal } from "@/components/PasswordModal";
import { usePasswordAuth } from "@/hooks/usePasswordAuth";

const Home = lazy(() => import("./pages/Home"));
const Index = lazy(() => import("./pages/Index"));
const Data = lazy(() => import("./pages/Data"));
const Quota = lazy(() => import("./pages/Quota"));
const Roadmap = lazy(() => import("./pages/Roadmap"));
const Help = lazy(() => import("./pages/Help"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type NavProps = {
  isUnlocked: boolean;
  onLockClick: () => void;
};

function Nav({ isUnlocked, onLockClick }: NavProps) {
  const location = useLocation();
  const { teams } = useTeams();
  const visibleTeams = teams.filter((t) => t.isActive);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card px-4 py-2 flex items-center gap-4 overflow-x-auto">
      <Link
        to="/home"
        className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
          location.pathname === "/home" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <HomeIcon className="h-3.5 w-3.5" />
        Home
      </Link>
      <span className="h-4 w-px bg-border shrink-0" />

      {isUnlocked ? (
        <Link
          to="/data"
          className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
            location.pathname === "/data" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileChartColumn className="h-3.5 w-3.5" />
          Data
        </Link>
      ) : null}

      {isUnlocked ? (
        <Link
          to="/quota"
          className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
            location.pathname === "/quota" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          Quota
        </Link>
      ) : null}

      {isUnlocked ? (
        <Link
          to="/roadmap"
          className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
            location.pathname === "/roadmap" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MapIcon className="h-3.5 w-3.5" />
          Roadmap
        </Link>
      ) : null}

      {isUnlocked ? <span className="h-4 w-px bg-border shrink-0" /> : null}

      {visibleTeams.map((team) => {
        const slug = pilotNameToSlug(team.name);
        const isCurrent = location.pathname === `/${slug}`;
        return (
          <Link
            key={team.id}
            to={`/${slug}`}
            className={`text-sm font-medium whitespace-nowrap transition-colors ${
              isCurrent ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {team.name}
          </Link>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onLockClick}
          title={isUnlocked ? "Lock protected pages" : "Unlock protected pages"}
          className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={isUnlocked ? "Lock protected pages" : "Unlock protected pages"}
        >
          {isUnlocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
        </button>

        <Link
          to="/help"
          className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
            location.pathname === "/help" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Help
        </Link>

        <ThemeToggle />

        {isUnlocked ? (
          <Link
            to="/settings"
            className={`flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              location.pathname === "/settings" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

const App = () => {
  const { isUnlocked, unlock, lock } = usePasswordAuth();
  const [isPasswordModalOpen, setPasswordModalOpen] = useState(false);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <TeamsProvider>
            <BrowserRouter>
              <Nav
                isUnlocked={isUnlocked}
                onLockClick={() => {
                  if (isUnlocked) {
                    lock();
                    setPasswordModalOpen(false);
                  } else {
                    setPasswordModalOpen(true);
                  }
                }}
              />
              <Suspense
                fallback={<div className="flex items-center justify-center h-[60vh] text-muted-foreground">Loading…</div>}
              >
                <Routes>
                  <Route path="/" element={<Navigate to="/home" replace />} />
                  <Route path="/home" element={<Home isUnlocked={isUnlocked} />} />
                  <Route path="/:pilotId" element={<Index />} />
                  <Route path="/data" element={isUnlocked ? <Data /> : <Navigate to="/home" replace />} />
                  <Route path="/quota" element={isUnlocked ? <Quota /> : <Navigate to="/home" replace />} />
                  <Route path="/roadmap" element={isUnlocked ? <Roadmap /> : <Navigate to="/home" replace />} />
                  <Route path="/help" element={<Help />} />
                  <Route path="/settings" element={isUnlocked ? <SettingsPage /> : <Navigate to="/home" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>

              <PasswordModal
                open={isPasswordModalOpen}
                onOpenChange={setPasswordModalOpen}
                onUnlock={unlock}
              />
            </BrowserRouter>
          </TeamsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
