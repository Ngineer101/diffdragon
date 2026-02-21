import type {
  AddRepoRequest,
  BranchesResponse,
  CommitPushRequest,
  CommitPushResponse,
  DiffResponse,
  FilePathRequest,
  GitAIFileNotesResponse,
  GitAIPromptDetailResponse,
  GitHubPRCloseRequest,
  GitHubPROpenRequest,
  GitHubPROpenResponse,
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

export async function discardFile(payload: FilePathRequest): Promise<DiffResponse> {
  const resp = await fetch("/api/git/discard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to discard file changes: ${resp.statusText}`))
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

export async function openGithubPr(payload: GitHubPROpenRequest): Promise<GitHubPROpenResponse> {
  const resp = await fetch("/api/github/pr/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to open PR: ${resp.statusText}`))
  return resp.json()
}

export async function closeGithubPr(payload: GitHubPRCloseRequest): Promise<{ ok: boolean }> {
  const resp = await fetch("/api/github/pr/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) throw new Error(await readError(resp, `Failed to close PR: ${resp.statusText}`))
  return resp.json()
}

export async function fetchGitAIFileNotes(params: {
  path: string
  oldPath?: string
  base: string
  head: string
}): Promise<GitAIFileNotesResponse> {
  const search = new URLSearchParams({
    path: params.path,
    base: params.base,
    head: params.head,
  })
  if (params.oldPath) {
    search.set("oldPath", params.oldPath)
  }

  const resp = await fetch(`/api/git-ai/file-notes?${search.toString()}`)
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch Git AI notes: ${resp.statusText}`))
  return resp.json()
}

export async function fetchGitAIPromptDetail(params: {
  promptId: string
  commit: string
}): Promise<GitAIPromptDetailResponse> {
  const search = new URLSearchParams({
    promptId: params.promptId,
    commit: params.commit,
  })
  const resp = await fetch(`/api/git-ai/prompt?${search.toString()}`)
  if (!resp.ok) throw new Error(await readError(resp, `Failed to fetch Git AI prompt details: ${resp.statusText}`))
  return resp.json()
}
