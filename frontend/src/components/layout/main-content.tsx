import { useEffect, useRef } from "react"
import { Eye } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore } from "@/stores/app-store"
import { FileDetailHeader } from "@/components/detail/file-detail-header"
import { AISummaryPanel } from "@/components/detail/ai-summary-panel"
import { ReviewChecklist } from "@/components/detail/review-checklist"
import { DiffViewer } from "@/components/detail/diff-viewer"

export function MainContent() {
  const activeFileIndex = useAppStore((s) => s.activeFileIndex)
  const files = useAppStore((s) => s.files)
  const scrollRef = useRef<HTMLDivElement>(null)

  const file = activeFileIndex >= 0 ? files[activeFileIndex] : null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [activeFileIndex])

  if (!file) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <Eye className="h-12 w-12 opacity-30" />
        <p className="text-[15px]">Select a file to review</p>
        <p className="text-xs">
          Use <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">j</kbd>/<kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">k</kbd> to navigate,{" "}
          <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">r</kbd> to mark reviewed,{" "}
          <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">/</kbd> to search
        </p>
      </div>
    )
  }

  return (
    <ScrollArea
      className="flex-1 min-w-0"
      viewportClassName="min-w-0 overflow-x-auto"
      ref={scrollRef}
    >
      <div className="pb-8">
        <FileDetailHeader file={file} index={activeFileIndex} />
        <AISummaryPanel summary={file.summary} fileIndex={activeFileIndex} />
        <ReviewChecklist
          checklist={file.checklist}
          fileIndex={activeFileIndex}
        />
        <DiffViewer rawDiff={file.rawDiff} filePath={file.path} />
      </div>
    </ScrollArea>
  )
}
