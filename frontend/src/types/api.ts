export interface DiffHunk {
  header: string
  content: string
  summary?: string
  linesAdded: number
  linesRemoved: number
}

export interface DiffFile {
  path: string
  oldPath?: string
  status: "added" | "modified" | "deleted" | "renamed" | "binary"
  language: string
  hunks: DiffHunk[]
  rawDiff: string
  linesAdded: number
  linesRemoved: number
  riskScore: number
  riskReasons: string[]
  semanticGroup: string
  summary?: string
  checklist?: string[]
}

export interface DiffStats {
  totalFiles: number
  totalAdded: number
  totalRemoved: number
  groupCounts: Record<string, number>
  riskDistribution: {
    high: number
    medium: number
    low: number
  }
}

export interface DiffResponse {
  baseRef: string
  headRef: string
  files: DiffFile[]
  aiProvider: string
  stats: DiffStats
  gitStatus: GitStatus
  repos: Repo[]
  currentRepoId: string
}

export interface GitStatus {
  stagedFiles: string[]
  unstagedFiles: string[]
  currentBranch: string
  upstreamBranch?: string
  hasUpstream: boolean
  ahead: number
  behind: number
}

export interface SummarizeRequest {
  fileIndex: number
  hunkIndex: number
}

export interface ChecklistRequest {
  fileIndex: number
}

export type SemanticGroup =
  | "feature"
  | "bugfix"
  | "refactor"
  | "test"
  | "config"
  | "docs"
  | "style"

export type ViewMode = "risk" | "grouped" | "flat"

export interface Branch {
  name: string
  isRemote: boolean
}

export interface Repo {
  id: string
  name: string
  path: string
}

export interface BranchesResponse {
  branches: Branch[]
  current: string
}

export interface ReposResponse {
  repos: Repo[]
  currentRepoId: string
}

export interface AddRepoRequest {
  path: string
  name?: string
}

export interface SelectRepoRequest {
  repoId: string
}

export interface ReloadDiffRequest {
  base?: string
  head?: string
  staged?: boolean
  unstaged?: boolean
}

export interface FilePathRequest {
  path: string
}

export interface CommitPushRequest {
  message: string
}

export interface CommitPushResponse {
  ok: boolean
  commitOutput: string
  pushOutput: string
  gitStatus: GitStatus
  diff: DiffResponse
}

export type DiffStyle = "unified" | "split"

export type DiffMode = "branches" | "staged" | "unstaged"
