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

function riskClass(score: number) {
  if (score >= 50)
    return "bg-[#f8514930] text-[#f85149] border-[#f8514940]"
  if (score >= 20)
    return "bg-[#d2992230] text-[#d29922] border-[#d2992240]"
  return "bg-[#3fb95020] text-[#3fb950] border-[#3fb95030]"
}

interface FileItemProps {
  file: DiffFile
  index: number
}

export function FileItem({ file, index }: FileItemProps) {
  const activeFileIndex = useAppStore((s) => s.activeFileIndex)
  const reviewedFiles = useAppStore((s) => s.reviewedFiles)
  const selectFile = useAppStore((s) => s.selectFile)

  const isActive = index === activeFileIndex
  const isReviewed = reviewedFiles.has(index)

  const lastSlash = file.path.lastIndexOf("/")
  const dir = lastSlash >= 0 ? file.path.slice(0, lastSlash + 1) : ""
  const name = lastSlash >= 0 ? file.path.slice(lastSlash + 1) : file.path

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => selectFile(index)}
          className={cn(
            "flex w-full flex-col gap-1 rounded-lg border-l-[3px] border-l-transparent px-3 py-2.5 text-left transition-colors",
            "hover:bg-accent/60",
            isActive && "border-l-primary bg-secondary",
            isReviewed && "opacity-50",
          )}
        >
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase",
                statusColors[file.status],
              )}
            >
              {file.status.slice(0, 3)}
            </Badge>
            <span className="min-w-0 truncate font-mono text-[13px] font-medium">
              {dir && (
                <span className="text-muted-foreground font-normal">{dir}</span>
              )}
              {name}
            </span>
          </div>
          <div className="flex items-center gap-2.5 pl-0.5">
            <span className="font-mono text-[11px]">
              <span className="text-[#3fb950]">+{file.linesAdded}</span>{" "}
              <span className="text-[#f85149]">&minus;{file.linesRemoved}</span>
            </span>
            <Badge
              variant="outline"
              className={cn(
                "ml-auto shrink-0 px-2 py-0 text-[10px] font-semibold",
                riskClass(file.riskScore),
              )}
            >
              {file.riskScore}
            </Badge>
          </div>
          {file.summary && (
            <p className="truncate pl-0.5 text-xs text-muted-foreground">
              {file.summary}
            </p>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="font-mono text-xs">{file.path}</p>
      </TooltipContent>
    </Tooltip>
  )
}
