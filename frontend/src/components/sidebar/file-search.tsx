import { useEffect, useRef, useState } from "react"
import { Filter, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppStore } from "@/stores/app-store"

export function FileSearch() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)
  const fileStageFilter = useAppStore((s) => s.fileStageFilter)
  const setFileStageFilter = useAppStore((s) => s.setFileStageFilter)
  const gitStatus = useAppStore((s) => s.gitStatus)

  const label =
    fileStageFilter === "all"
      ? "All files"
      : fileStageFilter === "staged"
        ? "Staged"
        : "Unstaged"

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onEscape)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onEscape)
    }
  }, [])

  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-search-input
          placeholder="Filter files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      <div className="relative" ref={rootRef}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 px-2.5 text-xs"
          onClick={() => setOpen((value) => !value)}
        >
            <Filter className="h-3.5 w-3.5" />
            {label}
        </Button>
        {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-44 rounded-md border border-border bg-card p-1.5 shadow-lg">
          <button
            onClick={() => {
              setFileStageFilter("all")
              setOpen(false)
            }}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${fileStageFilter === "all" ? "bg-accent" : ""}`}
          >
            <span>All files</span>
            <span className="text-muted-foreground">--</span>
          </button>
          <button
            onClick={() => {
              setFileStageFilter("staged")
              setOpen(false)
            }}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${fileStageFilter === "staged" ? "bg-accent" : ""}`}
          >
            <span>Staged</span>
            <span className="text-muted-foreground">{gitStatus.stagedFiles.length}</span>
          </button>
          <button
            onClick={() => {
              setFileStageFilter("unstaged")
              setOpen(false)
            }}
            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent ${fileStageFilter === "unstaged" ? "bg-accent" : ""}`}
          >
            <span>Unstaged</span>
            <span className="text-muted-foreground">{gitStatus.unstagedFiles.length}</span>
          </button>
        </div>
        ) : null}
      </div>
    </div>
  )
}
