import { ChevronDown } from "lucide-react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useAppStore } from "@/stores/app-store"
import { FileItem } from "./file-item"
import type { DiffFile } from "@/types/api"

const groupLabels: Record<string, string> = {
  feature: "Features",
  bugfix: "Bug Fixes",
  refactor: "Refactors",
  test: "Tests",
  config: "Configuration",
  docs: "Documentation",
  style: "Styling",
}

const groupIcons: Record<string, string> = {
  feature: "\u2728",
  bugfix: "\uD83D\uDC1B",
  refactor: "\u267B\uFE0F",
  test: "\uD83E\uDDEA",
  config: "\u2699\uFE0F",
  docs: "\uD83D\uDCDD",
  style: "\uD83C\uDFA8",
}

interface FileGroupProps {
  group: string
  files: (DiffFile & { _origIndex: number })[]
}

export function FileGroup({ group, files }: FileGroupProps) {
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const toggleGroup = useAppStore((s) => s.toggleGroup)

  const isOpen = !collapsedGroups[group]

  return (
    <Collapsible open={isOpen} onOpenChange={() => toggleGroup(group)}>
      <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/60">
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 data-[state=closed]:-rotate-90"
          data-state={isOpen ? "open" : "closed"}
        />
        <span className="text-sm">{groupIcons[group] || "\uD83D\uDCC1"}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {groupLabels[group] || group}
        </span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {files.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="min-w-0 overflow-hidden">
        {files.map((f) => (
          <FileItem key={f._origIndex} file={f} index={f._origIndex} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}
