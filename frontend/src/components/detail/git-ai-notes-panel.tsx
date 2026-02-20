import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Bot, ExternalLink, GitCommitHorizontal, Loader2, MessageSquareText, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchGitAIFileNotes, fetchGitAIPromptDetail } from "@/lib/api"
import type { DiffMode, GitAIFileNoteItem, GitAIPromptDetailResponse } from "@/types/api"

interface GitAINotesPanelProps {
  filePath: string
  oldPath?: string
  baseRef: string
  headRef: string
  diffMode: DiffMode
  className?: string
  selectedNote: GitAIFileNoteItem | null
  onSelectNote: (note: GitAIFileNoteItem | null) => void
}

export function GitAINotesPanel({
  filePath,
  oldPath,
  baseRef,
  headRef,
  diffMode,
  className,
  selectedNote,
  onSelectNote,
}: GitAINotesPanelProps) {
  const [items, setItems] = useState<GitAIFileNoteItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptError, setPromptError] = useState("")
  const [promptDetail, setPromptDetail] = useState<GitAIPromptDetailResponse | null>(null)

  useEffect(() => {
    if (diffMode !== "branches") {
      setItems([])
      setError("")
      setLoading(false)
      onSelectNote(null)
      return
    }

    let canceled = false
    setLoading(true)
    setError("")

    fetchGitAIFileNotes({
      path: filePath,
      oldPath,
      base: baseRef,
      head: headRef,
    })
      .then((result) => {
        if (canceled) return
        setItems(result.items)
        setLoading(false)
        onSelectNote(null)
        setPromptDetail(null)
        setPromptError("")
      })
      .catch((err) => {
        if (canceled) return
        setItems([])
        setError(err instanceof Error ? err.message : "Failed to load Git AI notes")
        setLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [filePath, oldPath, baseRef, headRef, diffMode])

  useEffect(() => {
    if (!selectedNote) {
      setPromptDetail(null)
      setPromptError("")
      setPromptLoading(false)
      return
    }

    let canceled = false
    setPromptLoading(true)
    setPromptError("")

    fetchGitAIPromptDetail({
      promptId: selectedNote.promptId,
      commit: selectedNote.commit,
    })
      .then((detail) => {
        if (canceled) return
        setPromptDetail(detail)
        setPromptLoading(false)
      })
      .catch((err) => {
        if (canceled) return
        setPromptDetail(null)
        setPromptError(err instanceof Error ? err.message : "Failed to load prompt details")
        setPromptLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [selectedNote])

  const groupedByCommit = useMemo(() => {
    const groups = new Map<string, GitAIFileNoteItem[]>()
    for (const item of items) {
      const list = groups.get(item.commit) ?? []
      list.push(item)
      groups.set(item.commit, list)
    }
    return [...groups.entries()]
  }, [items])

  if (diffMode !== "branches") {
    return (
      <div className={className}>
        <PanelShell>
          <p className="text-sm text-muted-foreground">
            Git AI notes are commit-based and available in branch comparison mode.
          </p>
        </PanelShell>
      </div>
    )
  }

  return (
    <div className={className}>
      <PanelShell>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notes...
          </div>
        ) : null}

        {!loading && error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!loading && !error && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Git AI notes found for this file in `{baseRef}..{headRef}`.
          </p>
        ) : null}

        {!loading && !error && groupedByCommit.length > 0 ? (
          <ScrollArea className="h-full" viewportClassName="overflow-y-auto">
            <div className="space-y-3 pb-4">
              {groupedByCommit.map(([commit, notes]) => (
                <div key={commit} className="rounded-md border border-border bg-card p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <GitCommitHorizontal className="h-3.5 w-3.5" />
                    <code>{commit.slice(0, 8)}</code>
                    <Badge variant="secondary" className="ml-auto text-[11px]">
                      {notes.length} prompt{notes.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {notes.map((note) => {
                      const isSelected = selectedNote?.commit === note.commit && selectedNote?.promptId === note.promptId && selectedNote?.lineRanges === note.lineRanges
                      return (
                      <button
                        type="button"
                        onClick={() => onSelectNote(isSelected ? null : note)}
                        key={`${commit}:${note.promptId}:${note.lineRanges}`}
                        className={`w-full rounded border p-2 text-left transition-colors ${
                          isSelected
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/70 bg-secondary/40 hover:bg-secondary/60"
                        }`}
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-[11px]">
                            {note.promptId.slice(0, 12)}
                          </Badge>
                          {note.tool ? (
                            <Badge variant="outline" className="text-[11px]">
                              <Bot className="mr-1 h-3 w-3" />
                              {note.tool}
                            </Badge>
                          ) : null}
                          {note.model ? <Badge variant="outline" className="text-[11px]">{note.model}</Badge> : null}
                        </div>

                        <p className="mb-1 font-mono text-xs text-muted-foreground">{note.lineRanges || "(no line range metadata)"}</p>

                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {note.humanAuthor ? (
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="h-3 w-3" />
                              {note.humanAuthor}
                            </span>
                          ) : null}
                          <span>+{note.totalAdditions}</span>
                          <span>-{note.totalDeletions}</span>
                          <span>accepted {note.acceptedLines}</span>
                        </div>

                        {note.messagesUrl ? (
                          <a
                            href={note.messagesUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <MessageSquareText className="h-3 w-3" />
                            Open transcript
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </button>
                    )})}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}

        {selectedNote ? (
          <div className="mt-3 rounded-md border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Prompt Details</p>
              <Badge variant="outline" className="font-mono text-[11px]">
                {selectedNote.promptId.slice(0, 12)}
              </Badge>
            </div>

            {promptLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading prompt metadata...
              </div>
            ) : null}

            {!promptLoading && promptError ? (
              <p className="text-xs text-destructive">{promptError}</p>
            ) : null}

            {!promptLoading && !promptError && promptDetail ? (
              <div className="space-y-2 text-xs text-muted-foreground">
                {promptDetail.prompt?.agent_id?.tool || promptDetail.prompt?.agent_id?.model ? (
                  <p>
                    {promptDetail.prompt?.agent_id?.tool || "unknown tool"}
                    {promptDetail.prompt?.agent_id?.model ? ` / ${promptDetail.prompt.agent_id.model}` : ""}
                  </p>
                ) : null}
                {promptDetail.prompt?.human_author ? <p>{promptDetail.prompt.human_author}</p> : null}
                {Array.isArray(promptDetail.prompt?.messages) ? (
                  <p>{promptDetail.prompt.messages.length} messages captured</p>
                ) : null}
                {promptDetail.prompt?.messages_url ? (
                  <a
                    href={promptDetail.prompt.messages_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open full transcript
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </PanelShell>
    </div>
  )
}

function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Git AI Notes</h3>
        <p className="text-xs text-muted-foreground">AI prompts linked from git notes (`refs/notes/ai`)</p>
      </div>
      <div className="min-h-0 flex-1 p-3">{children}</div>
    </div>
  )
}
