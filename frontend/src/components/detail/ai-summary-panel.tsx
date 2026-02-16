import { Sparkles } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAppStore } from "@/stores/app-store"

interface AISummaryPanelProps {
  summary?: string
  fileIndex: number
}

export function AISummaryPanel({ summary, fileIndex }: AISummaryPanelProps) {
  const summarizingFile = useAppStore((s) => s.summarizingFile)
  const isLoading = summarizingFile === fileIndex

  if (!summary && !isLoading) return null

  return (
    <Card className="mx-6 mt-4 border-border bg-secondary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#39d2c0]">
          <Sparkles className="h-3.5 w-3.5" />
          AI Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
