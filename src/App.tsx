import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import { HelpCircle, Settings, Home as HomeIcon, Map as MapIcon, FileChartColumn, Target } from "lucide-react";
import { ThemeProvider } from "next-themes";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Data from "./pages/Data";
import Quota from "./pages/Quota";
import Roadmap from "./pages/Roadmap";
import Help from "./pages/Help";
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
      <Link
        to="/data"
        className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
          location.pathname === "/data" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <FileChartColumn className="h-3.5 w-3.5" />
        Data &amp; Findings
      </Link>
      <Link
        to="/quota"
        className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
          location.pathname === "/quota" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Target className="h-3.5 w-3.5" />
        Quota
      </Link>
      <Link
        to="/roadmap"
        className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap transition-colors ${
          location.pathname === "/roadmap" ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <MapIcon className="h-3.5 w-3.5" />
        Roadmap
      </Link>
      <span className="h-4 w-px bg-border shrink-0" />
      {visibleTeams.map((team, i) => {
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
              <Route path="/" element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/:pilotId" element={<Index />} />
              <Route path="/data" element={<Data />} />
              <Route path="/quota" element={<Quota />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/help" element={<Help />} />
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
