import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAppStore } from "@/stores/app-store"
import type { ViewMode } from "@/types/api"

export function ViewToggle() {
  const viewMode = useAppStore((s) => s.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)

  return (
    <Tabs
      value={viewMode}
      onValueChange={(v) => setViewMode(v as ViewMode)}
    >
      <TabsList className="w-full">
        <TabsTrigger value="risk" className="flex-1 text-xs">
          By Risk
        </TabsTrigger>
        <TabsTrigger value="grouped" className="flex-1 text-xs">
          By Type
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
