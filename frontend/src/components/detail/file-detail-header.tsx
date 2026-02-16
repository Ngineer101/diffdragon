import {
  Sparkles,
  ListChecks,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAppStore } from "@/stores/app-store"
import type { DiffFile } from "@/types/api"
import { cn } from "@/lib/utils"

const statusColors: Record<string, string> = {
  added: "bg-[#23863620] text-[#3fb950] border-[#23863640]",
  modified: "bg-[#58a6ff15] text-[#58a6ff] border-[#58a6ff30]",
  deleted: "bg-[#f8514920] text-[#f85149] border-[#f8514940]",
  renamed: "bg-[#bc8cff15] text-[#bc8cff] border-[#bc8cff30]",
  binary: "bg-[#8b949e20] text-[#8b949e] border-[#8b949e40]",
}

function riskBadgeClass(score: number) {
  if (score >= 50)
    return "bg-[#f8514930] text-[#f85149] border-[#f8514940]"
  if (score >= 20)
    return "bg-[#d2992230] text-[#d29922] border-[#d2992240]"
  return "bg-[#3fb95020] text-[#3fb950] border-[#3fb95030]"
}

interface FileDetailHeaderProps {
  file: DiffFile
  index: number
}

export function FileDetailHeader({ file, index }: FileDetailHeaderProps) {
  const aiProvider = useAppStore((s) => s.aiProvider)
  const reviewedFiles = useAppStore((s) => s.reviewedFiles)
  const toggleReviewed = useAppStore((s) => s.toggleReviewed)
  const summarizeFile = useAppStore((s) => s.summarizeFile)
  const generateChecklist = useAppStore((s) => s.generateChecklist)
  const summarizingFile = useAppStore((s) => s.summarizingFile)
  const generatingChecklist = useAppStore((s) => s.generatingChecklist)
  const nextFile = useAppStore((s) => s.nextFile)
  const prevFile = useAppStore((s) => s.prevFile)
  const activeFileIndex = useAppStore((s) => s.activeFileIndex)
  const files = useAppStore((s) => s.files)

  const isReviewed = reviewedFiles.has(index)
  const hasAI = aiProvider !== "none"
  const isSummarizing = summarizingFile === index
  const isChecklistLoading = generatingChecklist === index

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-5">
      <div className="mb-3 flex items-center gap-3">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 px-2 py-0.5 text-xs font-semibold uppercase",
            statusColors[file.status],
          )}
        >
          {file.status}
        </Badge>
        <h2 className="min-w-0 break-all font-mono text-base font-semibold">
          {file.path}
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "ml-auto shrink-0 px-2.5 py-0.5 text-xs font-semibold",
                riskBadgeClass(file.riskScore),
              )}
            >
              Risk: {file.riskScore}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Heuristic risk score (0-100) based on file path and diff content
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {file.riskReasons?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {file.riskReasons.map((reason) => (
            <Badge key={reason} variant="secondary" className="text-[11px]">
              {reason}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {hasAI && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => summarizeFile(index)}
              disabled={isSummarizing}
            >
              {isSummarizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isSummarizing ? "Summarizing..." : "Summarize"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateChecklist(index)}
              disabled={isChecklistLoading}
            >
              {isChecklistLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ListChecks className="h-3.5 w-3.5" />
              )}
              {isChecklistLoading ? "Generating..." : "Checklist"}
            </Button>
          </>
        )}
        <Button
          variant={isReviewed ? "default" : "outline"}
          size="sm"
          onClick={() => toggleReviewed(index)}
          className={cn(
            isReviewed &&
              "bg-[#3fb95020] text-[#3fb950] border-[#3fb95040] hover:bg-[#3fb95030]",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {isReviewed ? "Reviewed" : "Mark Reviewed"}
        </Button>

        <div className="ml-auto flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={prevFile}
            disabled={activeFileIndex <= 0}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextFile}
            disabled={activeFileIndex >= files.length - 1}
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
