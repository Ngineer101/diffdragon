import { create } from "zustand"
import type { Branch, DiffFile, DiffMode, DiffResponse, DiffStats, DiffStyle, GitStatus, Repo, ViewMode } from "@/types/api"
import * as api from "@/lib/api"

interface AppState {
  // Data
  data: DiffResponse | null
  files: DiffFile[]
  stats: DiffStats | null
  baseRef: string
  headRef: string
  aiProvider: string
  gitStatus: GitStatus

  // Branch state
  branches: Branch[]
  currentBranch: string
  compareRemote: boolean
  diffMode: DiffMode

  // Repository state
  repos: Repo[]
  currentRepoId: string
  prWorktreePath: string | null
  prBaseRepoId: string

  // UI state
  activeFileIndex: number
  viewMode: ViewMode
  diffStyle: DiffStyle
  searchQuery: string
  collapsedGroups: Record<string, boolean>
  reviewedFiles: Set<number>

  // Loading states
  loading: boolean
  reloading: boolean
  summarizingFile: number | null
  generatingChecklist: number | null
  summarizingAll: boolean
  stagingPath: string | null
  committingAndPushing: boolean

  // Actions
  fetchDiff: () => Promise<void>
  fetchRepos: () => Promise<void>
  fetchBranches: () => Promise<void>
  addRepo: (path: string, name?: string) => Promise<void>
  selectRepo: (repoId: string) => Promise<void>
  reloadDiff: (params: { base?: string; head?: string; staged?: boolean; unstaged?: boolean }) => Promise<void>
  setCompareRemote: (remote: boolean) => void
  setDiffMode: (mode: DiffMode) => void
  setDiffStyle: (style: DiffStyle) => void
  selectFile: (index: number) => void
  setViewMode: (mode: ViewMode) => void
  setSearchQuery: (query: string) => void
  toggleGroup: (group: string) => void
  toggleReviewed: (index: number) => void
  summarizeFile: (index: number) => Promise<void>
  generateChecklist: (index: number) => Promise<void>
  summarizeAll: () => Promise<void>
  stageFile: (path: string) => Promise<void>
  unstageFile: (path: string) => Promise<void>
  commitAndPush: (message: string) => Promise<{
    commitOutput: string
    syncOutput: string
    pushOutput: string
    syncedWithRemote: boolean
    pulledBeforePush: boolean
  }>
  openGithubPr: (pr: string) => Promise<{
    worktreePath: string
    prNumber: number
    baseOid: string
    headOid: string
    mergeBaseOid: string
  }>
  closeGithubPr: () => Promise<void>
  nextFile: () => void
  prevFile: () => void
}

const emptyGitStatus: GitStatus = {
  stagedFiles: [],
  unstagedFiles: [],
  currentBranch: "",
  hasUpstream: false,
  ahead: 0,
  behind: 0,
}

export const useAppStore = create<AppState>((set, get) => ({
  data: null,
  files: [],
  stats: null,
  baseRef: "",
  headRef: "",
  aiProvider: "none",
  gitStatus: emptyGitStatus,
  branches: [],
  currentBranch: "",
  compareRemote: false,
  diffMode: "branches",
  repos: [],
  currentRepoId: "",
  prWorktreePath: null,
  prBaseRepoId: "",
  activeFileIndex: -1,
  viewMode: "risk",
  diffStyle: "unified",
  searchQuery: "",
  collapsedGroups: {},
  reviewedFiles: new Set(),
  loading: true,
  reloading: false,
  summarizingFile: null,
  generatingChecklist: null,
  summarizingAll: false,
  stagingPath: null,
  committingAndPushing: false,

  fetchDiff: async () => {
    set({ loading: true })
    try {
      const data = await api.fetchDiff()
      set({
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

  fetchRepos: async () => {
    try {
      const result = await api.fetchRepos()
      set({
        repos: result.repos,
        currentRepoId: result.currentRepoId,
      })
    } catch {
      // Silently fail
    }
  },

  fetchBranches: async () => {
    if (!get().currentRepoId) {
      set({ branches: [], currentBranch: "" })
      return
    }

    try {
      const result = await api.fetchBranches()
      set({
        branches: result.branches,
        currentBranch: result.current,
      })
    } catch {
      // Silently fail — branch selector just won't populate
    }
  },

  addRepo: async (path, name) => {
    set({ reloading: true })
    try {
      const reposResult = await api.addRepo({ path, name })
      const data = await api.fetchDiff()
      set({
        repos: reposResult.repos,
        currentRepoId: reposResult.currentRepoId,
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        activeFileIndex: -1,
        reviewedFiles: new Set(),
        reloading: false,
      })
      await get().fetchBranches()
    } catch (err) {
      set({ reloading: false })
      throw err
    }
  },

  selectRepo: async (repoId) => {
    set({ reloading: true })
    try {
      const data = await api.selectRepo({ repoId })
      set({
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        activeFileIndex: -1,
        reviewedFiles: new Set(),
        reloading: false,
      })
      await get().fetchBranches()
    } catch (err) {
      set({ reloading: false })
      throw err
    }
  },

  reloadDiff: async (params) => {
    set({ reloading: true })
    try {
      const data = await api.reloadDiff(params)
      set({
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        activeFileIndex: -1,
        reviewedFiles: new Set(),
        reloading: false,
      })
    } catch {
      set({ reloading: false })
    }
  },

  setCompareRemote: (remote) => {
    const { baseRef } = get()
    set({ compareRemote: remote })
    // Reload with origin/ prefix or stripped
    let base = baseRef
    if (remote && !base.startsWith("origin/")) {
      base = `origin/${base}`
    } else if (!remote && base.startsWith("origin/")) {
      base = base.replace(/^origin\//, "")
    }
    get().reloadDiff({ base, head: "HEAD" })
  },

  setDiffMode: (mode) => {
    set({ diffMode: mode })
    if (mode === "staged") {
      get().reloadDiff({ staged: true })
    } else if (mode === "unstaged") {
      get().reloadDiff({ unstaged: true })
    } else {
      // Switch back to branch comparison
      const { baseRef, headRef } = get()
      const base = baseRef === "staged" || baseRef === "index" ? "main" : baseRef
      const head = headRef === "index" || headRef === "working tree" ? "HEAD" : headRef
      get().reloadDiff({ base, head })
    }
  },

  setDiffStyle: (style) => set({ diffStyle: style }),

  selectFile: (index) => set({ activeFileIndex: index }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  toggleGroup: (group) =>
    set((state) => ({
      collapsedGroups: {
        ...state.collapsedGroups,
        [group]: !state.collapsedGroups[group],
      },
    })),

  toggleReviewed: (index) =>
    set((state) => {
      const next = new Set(state.reviewedFiles)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return { reviewedFiles: next }
    }),

  summarizeFile: async (index) => {
    set({ summarizingFile: index })
    try {
      const result = await api.summarizeFile(index)
      if (result.error) throw new Error(result.error)
      set((state) => {
        const files = [...state.files]
        files[index] = { ...files[index], summary: result.summary }
        return { files, summarizingFile: null }
      })
    } catch (err) {
      set({ summarizingFile: null })
      throw err
    }
  },

  generateChecklist: async (index) => {
    set({ generatingChecklist: index })
    try {
      const result = await api.generateChecklist(index)
      if (result.error) throw new Error(result.error)
      set((state) => {
        const files = [...state.files]
        files[index] = { ...files[index], checklist: result.checklist }
        return { files, generatingChecklist: null }
      })
    } catch (err) {
      set({ generatingChecklist: null })
      throw err
    }
  },

  summarizeAll: async () => {
    set({ summarizingAll: true })
    try {
      const result = await api.summarizeAll()
      if (result.files) {
        set({ files: result.files, summarizingAll: false })
      } else {
        set({ summarizingAll: false })
      }
    } catch {
      set({ summarizingAll: false })
    }
  },

  stageFile: async (path) => {
    set({ stagingPath: path })
    try {
      const data = await api.stageFile({ path })
      set({
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        stagingPath: null,
      })
    } catch (err) {
      set({ stagingPath: null })
      throw err
    }
  },

  unstageFile: async (path) => {
    set({ stagingPath: path })
    try {
      const data = await api.unstageFile({ path })
      set({
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        stagingPath: null,
      })
    } catch (err) {
      set({ stagingPath: null })
      throw err
    }
  },

  commitAndPush: async (message) => {
    set({ committingAndPushing: true })
    try {
      const result = await api.commitAndPush({ message })
      const data = result.diff
      set({
        data,
        files: data.files,
        stats: data.stats,
        baseRef: data.baseRef,
        headRef: data.headRef,
        aiProvider: data.aiProvider,
        gitStatus: data.gitStatus,
        repos: data.repos,
        currentRepoId: data.currentRepoId,
        activeFileIndex: -1,
        reviewedFiles: new Set(),
        committingAndPushing: false,
      })
      return {
        commitOutput: result.commitOutput,
        syncOutput: result.syncOutput,
        pushOutput: result.pushOutput,
        syncedWithRemote: result.syncedWithRemote,
        pulledBeforePush: result.pulledBeforePush,
      }
    } catch (err) {
      set({ committingAndPushing: false })
      throw err
    }
  },

  openGithubPr: async (pr) => {
    const existingWorktree = get().prWorktreePath
    if (existingWorktree) {
      await get().closeGithubPr()
    }

    const baseRepoId = get().currentRepoId
    const result = await api.openGithubPr({ pr })
    await get().addRepo(result.worktreePath)
    set({ prWorktreePath: result.worktreePath, prBaseRepoId: baseRepoId })
    return result
  },

  closeGithubPr: async () => {
    const worktreePath = get().prWorktreePath
    if (!worktreePath) return

    const baseRepoId = get().prBaseRepoId
    if (baseRepoId) {
      try {
        await get().selectRepo(baseRepoId)
      } catch {
        // Ignore and still attempt cleanup
      }
    }

    await api.closeGithubPr({ worktreePath })
    set({ prWorktreePath: null, prBaseRepoId: "" })
  },

  nextFile: () => {
    const { activeFileIndex, files } = get()
    if (activeFileIndex < files.length - 1) {
      set({ activeFileIndex: activeFileIndex + 1 })
    }
  },

  prevFile: () => {
    const { activeFileIndex } = get()
    if (activeFileIndex > 0) {
      set({ activeFileIndex: activeFileIndex - 1 })
    }
  },
}))
