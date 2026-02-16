import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAppStore } from "@/stores/app-store"

export function FileSearch() {
  const searchQuery = useAppStore((s) => s.searchQuery)
  const setSearchQuery = useAppStore((s) => s.setSearchQuery)

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-search-input
        placeholder="Filter files..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-8 text-sm"
      />
    </div>
  )
}
