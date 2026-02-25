import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { Settings } from "lucide-react";
import { ThemeProvider } from "next-themes";
import Index from "./pages/Index";
import Data from "./pages/Data";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import { TeamsProvider, useTeams, pilotNameToSlug } from "./contexts/TeamsContext";
import { ThemeToggle } from "@/components/ThemeToggle";

const queryClient = new QueryClient();

function Nav() {
  const location = useLocation();
  const { teams } = useTeams();
  const visibleTeams = teams.filter((t) => t.isActive);
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card px-4 py-2 flex items-center gap-4 overflow-x-auto">
      {visibleTeams.map((team, i) => {
        const slug = pilotNameToSlug(team.name);
        const isCurrent =
          location.pathname === `/Pilots/${slug}` ||
          (location.pathname === "/Pilots" && i === 0);
        return (
          <Link
            key={team.id}
            to={i === 0 ? "/Pilots" : `/Pilots/${slug}`}
            className={`text-sm font-medium whitespace-nowrap transition-colors ${
              isCurrent ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {team.name}
          </Link>
        );
      })}
      <Link
        to="/data"
        className={`text-sm font-medium whitespace-nowrap transition-colors ${
          location.pathname === "/data" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Data &amp; Findings
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <Link
          to="/settings"
          className={`flex items-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
            location.pathname === "/settings" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
      </div>
    </nav>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <TeamsProvider>
          <BrowserRouter>
            <Nav />
            <Routes>
              <Route path="/" element={<Navigate to="/Pilots" replace />} />
              <Route path="/Pilots" element={<Index />} />
              <Route path="/Pilots/:pilotId" element={<Index />} />
              <Route path="/data" element={<Data />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TeamsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
