import type { DiffResponse } from "@/types/api"

export async function fetchDiff(): Promise<DiffResponse> {
  const resp = await fetch("/api/diff")
  if (!resp.ok) throw new Error(`Failed to fetch diff: ${resp.statusText}`)
  return resp.json()
}

export async function summarizeFile(
  fileIndex: number,
): Promise<{ summary?: string; error?: string }> {
  const resp = await fetch("/api/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIndex, hunkIndex: -1 }),
  })
  return resp.json()
}

export async function generateChecklist(
  fileIndex: number,
): Promise<{ checklist?: string[]; error?: string }> {
  const resp = await fetch("/api/checklist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileIndex }),
  })
  return resp.json()
}

export async function summarizeAll(): Promise<{
  completed: boolean
  errors: string[]
  files: DiffResponse["files"]
}> {
  const resp = await fetch("/api/summarize-all", { method: "POST" })
  return resp.json()
}
