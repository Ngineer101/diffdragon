import { create } from "zustand"
import type { DiffFile, DiffResponse, DiffStats, ViewMode } from "@/types/api"
import * as api from "@/lib/api"

interface AppState {
  // Data
  data: DiffResponse | null
  files: DiffFile[]
  stats: DiffStats | null
  baseRef: string
  headRef: string
  aiProvider: string

  // UI state
  activeFileIndex: number
  viewMode: ViewMode
  searchQuery: string
  collapsedGroups: Record<string, boolean>
  reviewedFiles: Set<number>

  // Loading states
  loading: boolean
  summarizingFile: number | null
  generatingChecklist: number | null
  summarizingAll: boolean

  // Actions
  fetchDiff: () => Promise<void>
  selectFile: (index: number) => void
  setViewMode: (mode: ViewMode) => void
  setSearchQuery: (query: string) => void
  toggleGroup: (group: string) => void
  toggleReviewed: (index: number) => void
  summarizeFile: (index: number) => Promise<void>
  generateChecklist: (index: number) => Promise<void>
  summarizeAll: () => Promise<void>
  nextFile: () => void
  prevFile: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  data: null,
  files: [],
  stats: null,
  baseRef: "",
  headRef: "",
  aiProvider: "none",
  activeFileIndex: -1,
  viewMode: "risk",
  searchQuery: "",
  collapsedGroups: {},
  reviewedFiles: new Set(),
  loading: true,
  summarizingFile: null,
  generatingChecklist: null,
  summarizingAll: false,

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
        loading: false,
      })
    } catch {
      set({ loading: false })
    }
  },

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
