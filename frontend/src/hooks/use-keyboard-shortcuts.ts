import { useEffect } from "react"
import { useAppStore } from "@/stores/app-store"

export function useKeyboardShortcuts() {
  const nextFile = useAppStore((s) => s.nextFile)
  const prevFile = useAppStore((s) => s.prevFile)
  const toggleReviewed = useAppStore((s) => s.toggleReviewed)
  const activeFileIndex = useAppStore((s) => s.activeFileIndex)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault()
          nextFile()
          break
        case "k":
        case "ArrowUp":
          e.preventDefault()
          prevFile()
          break
        case "r":
          if (activeFileIndex >= 0) {
            toggleReviewed(activeFileIndex)
          }
          break
        case "/":
          e.preventDefault()
          document.querySelector<HTMLInputElement>("[data-search-input]")?.focus()
          break
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [nextFile, prevFile, toggleReviewed, activeFileIndex])
}
