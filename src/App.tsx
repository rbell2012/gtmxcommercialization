import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import Data from "./pages/Data";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function Nav() {
  const location = useLocation();
  return (
    <nav className="border-b border-border bg-card px-4 py-2 flex gap-4">
      <Link
        to="/"
        className={`text-sm font-medium ${location.pathname === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        Pilots
      </Link>
      <Link
        to="/data"
        className={`text-sm font-medium ${location.pathname === "/data" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      >
        Data &amp; Findings
      </Link>
    </nav>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/data" element={<Data />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
