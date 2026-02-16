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

  const filtered: FileWithIndex[] = useMemo(() => {
    const withIndex = files.map((f, i) => ({ ...f, _origIndex: i }))
    if (!searchQuery) return withIndex
    const q = searchQuery.toLowerCase()
    return withIndex.filter((f) => f.path.toLowerCase().includes(q))
  }, [files, searchQuery])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <p className="text-sm">No files match</p>
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
      <div className="flex flex-col gap-0.5">
        {GROUP_ORDER.filter((g) => groups[g]?.length).map((g) => (
          <FileGroup key={g} group={g} files={groups[g]} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {filtered.map((f) => (
        <FileItem key={f._origIndex} file={f} index={f._origIndex} />
      ))}
    </div>
  )
}
