import type {
  AddRepoRequest,
  BranchesResponse,
  CommitPushRequest,
  CommitPushResponse,
  DiffResponse,
  FilePathRequest,
  GitStatus,
  ReloadDiffRequest,
  RepoPickerResponse,
  ReposResponse,
  SelectRepoRequest,
} from "@/types/api"

async function readError(resp: Response, fallback: string): Promise<string> {
  try {
    const text = await resp.text()
    return text || fallback
  } catch {
    return fallback
  }
}

export async function fetchDiff(): Promise<DiffResponse> {
  const resp = await fetch("/api/diff")
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch diff: ${resp.statusText}`))
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

export async function fetchBranches(): Promise<BranchesResponse> {
  const resp = await fetch("/api/branches")
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch branches: ${resp.statusText}`))
  return resp.json()
}

export async function fetchRepos(): Promise<ReposResponse> {
  const resp = await fetch("/api/repos")
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch repositories: ${resp.statusText}`))
  return resp.json()
}

export async function pickRepoDirectory(): Promise<RepoPickerResponse> {
  const resp = await fetch("/api/repos/pick")
  if (!resp.ok) throw new Error(await readError(resp, `Failed to open folder picker: ${resp.statusText}`))
  return resp.json()
}

export async function addRepo(payload: AddRepoRequest): Promise<ReposResponse> {
  const resp = await fetch("/api/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to add repository: ${resp.statusText}`))
  return resp.json()
}

export async function selectRepo(payload: SelectRepoRequest): Promise<DiffResponse> {
  const resp = await fetch("/api/repos/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to switch repository: ${resp.statusText}`))
  return resp.json()
}

export async function reloadDiff(params: ReloadDiffRequest): Promise<DiffResponse> {
  const resp = await fetch("/api/diff/reload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to reload diff: ${resp.statusText}`))
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

export async function fetchGitStatus(): Promise<GitStatus> {
  const resp = await fetch("/api/git/status")
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch git status: ${resp.statusText}`))
  return resp.json()
}

export async function stageFile(payload: FilePathRequest): Promise<DiffResponse> {
  const resp = await fetch("/api/git/stage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to stage file: ${resp.statusText}`))
  return resp.json()
}

export async function unstageFile(payload: FilePathRequest): Promise<DiffResponse> {
  const resp = await fetch("/api/git/unstage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to unstage file: ${resp.statusText}`))
  return resp.json()
}

export async function commitAndPush(payload: CommitPushRequest): Promise<CommitPushResponse> {
  const resp = await fetch("/api/git/commit-push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to commit and push: ${resp.statusText}`))
  return resp.json()
}
