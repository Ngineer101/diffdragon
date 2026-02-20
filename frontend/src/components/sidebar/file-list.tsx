import { useMemo } from "react"
import { useAppStore } from "@/stores/app-store"
import { FileItem } from "./file-item"
import { FileGroup } from "./file-group"
import type { DiffFile } from "@/types/api"

type FileWithIndex = DiffFile & { _origIndex: number }

const GROUP_ORDER = [
  "feature",
  "bugfix",
  "refactor",
  "test",
  "config",
  "docs",
  "style",
]

export function FileList() {
  const files = useAppStore((s) => s.files)
  const viewMode = useAppStore((s) => s.viewMode)
  const searchQuery = useAppStore((s) => s.searchQuery)
  const fileStageFilter = useAppStore((s) => s.fileStageFilter)
  const gitStatus = useAppStore((s) => s.gitStatus)

  const filtered: FileWithIndex[] = useMemo(() => {
    const stagedSet = new Set(gitStatus.stagedFiles)
    const unstagedSet = new Set(gitStatus.unstagedFiles)
    const withIndex = files.map((f, i) => ({ ...f, _origIndex: i }))

    const stageFiltered = withIndex.filter((f) => {
      if (fileStageFilter === "all") return true

      const pathMatches =
        fileStageFilter === "staged"
          ? stagedSet.has(f.path) || (!!f.oldPath && stagedSet.has(f.oldPath))
          : unstagedSet.has(f.path) || (!!f.oldPath && unstagedSet.has(f.oldPath))

      return pathMatches
    })

    if (!searchQuery) return stageFiltered
    const q = searchQuery.toLowerCase()
    return stageFiltered.filter((f) => f.path.toLowerCase().includes(q))
  }, [files, searchQuery, fileStageFilter, gitStatus.stagedFiles, gitStatus.unstagedFiles])

  if (filtered.length === 0) {
    const isSearching = searchQuery.trim().length > 0
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <p className="text-sm">{isSearching ? "No files match" : "No changed files"}</p>
      </div>
    )
  }

  if (viewMode === "grouped") {
    const groups: Record<string, FileWithIndex[]> = {}
    for (const f of filtered) {
      const g = f.semanticGroup || "feature"
      if (!groups[g]) groups[g] = []
      groups[g].push(f)
    }

    return (
      <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
        {GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => (
          <FileGroup key={g} group={g} files={groups[g]} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
      {filtered.map((f) => (
        <FileItem key={f._origIndex} file={f} index={f._origIndex} />
      ))}
    </div>
  )
}
