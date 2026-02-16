import { Compass, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAppStore } from "@/stores/app-store"

export function TopBar() {
  const baseRef = useAppStore((s) => s.baseRef)
  const headRef = useAppStore((s) => s.headRef)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const summarizeAll = useAppStore((s) => s.summarizeAll)
  const summarizingAll = useAppStore((s) => s.summarizingAll)

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border bg-card px-6 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-lg font-bold text-[#39d2c0]">
          <Compass className="h-5 w-5" />
          DiffPilot
        </div>
        <Badge
          variant="outline"
          className="font-mono text-xs text-muted-foreground"
        >
          {baseRef} <span className="mx-1 text-[#6e7681]">&rarr;</span>{" "}
          {headRef}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {aiProvider !== "none" && (
          <Button
            size="sm"
            onClick={() => summarizeAll()}
            disabled={summarizingAll}
          >
            {summarizingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {summarizingAll ? "Summarizing..." : "Summarize All"}
          </Button>
        )}
      </div>
    </header>
  )
}
