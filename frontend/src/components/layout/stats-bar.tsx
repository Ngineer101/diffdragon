import { FileText } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useAppStore } from "@/stores/app-store"

export function StatsBar() {
  const stats = useAppStore((s) => s.stats)
  const reviewedFiles = useAppStore((s) => s.reviewedFiles)

  if (!stats) return null

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-6 py-3 text-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        <span className="font-mono font-semibold text-foreground">
          {stats.totalFiles}
        </span>
        files
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono font-semibold text-[#3fb950]">
          +{stats.totalAdded}
        </span>
        added
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="font-mono font-semibold text-[#f85149]">
          &minus;{stats.totalRemoved}
        </span>
        removed
      </div>

      <Separator orientation="vertical" className="h-4" />

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-[#f85149]" />
        <span className="font-mono font-semibold text-foreground">
          {stats.riskDistribution.high}
        </span>
        high
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-[#d29922]" />
        <span className="font-mono font-semibold text-foreground">
          {stats.riskDistribution.medium}
        </span>
        medium
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-[#3fb950]" />
        <span className="font-mono font-semibold text-foreground">
          {stats.riskDistribution.low}
        </span>
        low
      </div>

      <Separator orientation="vertical" className="h-4" />

      <Badge variant="secondary" className="font-mono text-xs">
        Reviewed: {reviewedFiles.size}/{stats.totalFiles}
      </Badge>
    </div>
  )
}
