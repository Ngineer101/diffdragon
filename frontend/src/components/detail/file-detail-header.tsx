import {
  Sparkles,
  ListChecks,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TriangleAlert,
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
import { toast } from "sonner"

const statusColors: Record<string, string> = {
  added: "bg-[#23863620] text-[#3fb950] border-[#23863640]",
  modified: "bg-[#58a6ff15] text-[#58a6ff] border-[#58a6ff30]",
  deleted: "bg-[#f8514920] text-[#f85149] border-[#f8514940]",
  renamed: "bg-[#bc8cff15] text-[#bc8cff] border-[#bc8cff30]",
  binary: "bg-[#8b949e20] text-[#8b949e] border-[#8b949e40]",
}

function riskBadgeClass(score: number) {
  if (score >= 50)
    return "bg-[#f8514940] text-[#ff7b72] border-[#f85149]"
  if (score >= 20)
    return "bg-[#d2992240] text-[#e3b341] border-[#d29922]"
  return "bg-[#3fb95020] text-[#3fb950] border-[#3fb95030]"
}

function riskLevel(score: number) {
  if (score >= 50) return "High"
  if (score >= 20) return "Medium"
  return "Low"
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
  const gitStatus = useAppStore((s) => s.gitStatus)
  const diffMode = useAppStore((s) => s.diffMode)
  const stageFile = useAppStore((s) => s.stageFile)
  const unstageFile = useAppStore((s) => s.unstageFile)
  const stagingPath = useAppStore((s) => s.stagingPath)

  const isReviewed = reviewedFiles.has(index)
  const hasAI = aiProvider !== "none"
  const isSummarizing = summarizingFile === index
  const isChecklistLoading = generatingChecklist === index
  const isStaged = gitStatus.stagedFiles.includes(file.path)
  const isUnstaged = gitStatus.unstagedFiles.includes(file.path)
  const canStage = diffMode === "unstaged" || isUnstaged
  const canUnstage = (diffMode === "staged" || isStaged) && !canStage
  const isMutating = stagingPath === file.path
  const level = riskLevel(file.riskScore)

  const handleStage = async () => {
    try {
      await stageFile(file.path)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stage file")
    }
  }

  const handleUnstage = async () => {
    try {
      await unstageFile(file.path)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unstage file")
    }
  }

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
                "ml-auto shrink-0 px-3 py-1 text-sm font-bold tracking-wide",
                riskBadgeClass(file.riskScore),
              )}
            >
              {level} Risk
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              Heuristic risk level based on file path and diff content
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {file.riskReasons?.length > 0 && (
        <div className={cn("mb-3 rounded-md border px-3 py-2", riskBadgeClass(file.riskScore))}>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4" />
            Why this file is marked {level.toLowerCase()} risk
          </div>
          <div className="flex flex-wrap gap-2">
          {file.riskReasons.map((reason) => (
            <Badge key={reason} variant="secondary" className="text-xs font-medium">
              {reason}
            </Badge>
          ))}
          </div>
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

        {canStage && (
          <Button variant="outline" size="sm" onClick={handleStage} disabled={isMutating}>
            {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Stage File
          </Button>
        )}
        {canUnstage && (
          <Button variant="outline" size="sm" onClick={handleUnstage} disabled={isMutating}>
            {isMutating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Unstage File
          </Button>
        )}

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
