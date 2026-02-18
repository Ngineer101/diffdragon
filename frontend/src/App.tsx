import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/app-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { TopBar } from "@/components/layout/top-bar";
import { StatsBar } from "@/components/layout/stats-bar";
import { Sidebar } from "@/components/layout/sidebar";
import { MainContent } from "@/components/layout/main-content";

export default function App() {
  const fetchDiff = useAppStore((s) => s.fetchDiff);
  const loading = useAppStore((s) => s.loading);
  const currentRepoId = useAppStore((s) => s.currentRepoId);

  useKeyboardShortcuts();

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Loading diff data...</p>
      </div>
    );
  }

  if (!currentRepoId) {
    return (
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen flex-col">
          <TopBar />
          <Toaster position="bottom-right" closeButton={false} />
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <p className="text-lg font-semibold text-foreground">
              No repository selected
            </p>
            <p className="text-sm">
              Add a git repository from the top bar to start reviewing diffs.
            </p>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col">
        <TopBar />
        <Toaster position="bottom-right" closeButton={false} />
        <StatsBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </TooltipProvider>
  );
}
