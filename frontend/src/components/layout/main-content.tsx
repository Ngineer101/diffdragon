import { useEffect, useRef, useState } from "react"
import { Eye, FileSearch } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore } from "@/stores/app-store"
import { FileDetailHeader } from "@/components/detail/file-detail-header"
import { DiffViewer } from "@/components/detail/diff-viewer"
import { GitAINotesPanel } from "@/components/detail/git-ai-notes-panel"
import type { GitAIFileNoteItem } from "@/types/api"

export function MainContent() {
  const activeFileIndex = useAppStore((s) => s.activeFileIndex)
  const files = useAppStore((s) => s.files)
  const baseRef = useAppStore((s) => s.baseRef)
  const headRef = useAppStore((s) => s.headRef)
  const diffMode = useAppStore((s) => s.diffMode)
  const gitAINotesCollapsed = useAppStore((s) => s.gitAINotesCollapsed)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [notesWidth, setNotesWidth] = useState(() => {
    if (typeof window === "undefined") return 360
    const raw = window.localStorage.getItem("diffdragon:git-ai-notes-width")
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? Math.max(280, Math.min(parsed, 680)) : 360
  })
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)
  const [selectedNote, setSelectedNote] = useState<GitAIFileNoteItem | null>(null)

  const file = activeFileIndex >= 0 ? files[activeFileIndex] : null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setSelectedNote(null)
  }, [activeFileIndex])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragState.current) return
      const deltaX = event.clientX - dragState.current.startX
      const next = dragState.current.startWidth - deltaX
      setNotesWidth(Math.max(280, Math.min(next, 680)))
    }

    const onUp = () => {
      dragState.current = null
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("diffdragon:git-ai-notes-width", String(notesWidth))
  }, [notesWidth])

  if (files.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/25 text-muted-foreground">
          <FileSearch className="mb-3 h-10 w-10 opacity-50" />
          <p className="text-base font-medium text-foreground">
            No changes found for the selected comparison.
          </p>
          <p className="mt-1 text-sm">
            Try another branch, diff mode, or repository.
          </p>
        </div>
      </div>
    )
  }

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
    <div className="flex min-w-0 flex-1 flex-col">
      <FileDetailHeader file={file} index={activeFileIndex} />
      <div className="flex min-h-0 flex-1">
        <ScrollArea
          className="min-w-0 flex-1"
          viewportClassName="min-w-0 overflow-x-auto"
          ref={scrollRef}
        >
          <div className="pb-8">
            <DiffViewer
              rawDiff={file.rawDiff}
              filePath={file.path}
              highlightedLineRanges={selectedNote?.lineRanges}
            />
            <div className="mx-6 mt-4 rounded-lg border border-border lg:hidden">
              <GitAINotesPanel
                filePath={file.path}
                oldPath={file.oldPath}
                baseRef={baseRef}
                headRef={headRef}
                diffMode={diffMode}
                className="h-[340px]"
                selectedNote={selectedNote}
                onSelectNote={setSelectedNote}
              />
            </div>
          </div>
        </ScrollArea>

        <div className="hidden min-h-0 lg:flex">
          {!gitAINotesCollapsed ? (
            <>
          <button
            type="button"
            aria-label="Resize Git AI notes panel"
            className="w-1 cursor-col-resize border-l border-border bg-muted/40 hover:bg-muted"
            onMouseDown={(event) => {
              dragState.current = {
                startX: event.clientX,
                startWidth: notesWidth,
              }
            }}
          />
          <div style={{ width: `${notesWidth}px` }} className="min-h-0 border-l border-border bg-card">
            <GitAINotesPanel
              filePath={file.path}
              oldPath={file.oldPath}
              baseRef={baseRef}
              headRef={headRef}
              diffMode={diffMode}
              className="h-full"
              selectedNote={selectedNote}
              onSelectNote={setSelectedNote}
            />
          </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
