import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppStore } from "@/stores/app-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { TopBar } from "@/components/layout/top-bar"
import { StatsBar } from "@/components/layout/stats-bar"
import { Sidebar } from "@/components/layout/sidebar"
import { MainContent } from "@/components/layout/main-content"

export default function App() {
  const fetchDiff = useAppStore((s) => s.fetchDiff)
  const loading = useAppStore((s) => s.loading)
  const files = useAppStore((s) => s.files)

  useKeyboardShortcuts()

  useEffect(() => {
    fetchDiff()
  }, [fetchDiff])

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p>Loading diff data...</p>
      </div>
    )
  }

  if (!files.length) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-lg font-semibold text-foreground">No changes found</p>
        <p className="text-sm">The diff is empty.</p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen flex-col">
        <TopBar />
        <StatsBar />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </TooltipProvider>
  )
}
