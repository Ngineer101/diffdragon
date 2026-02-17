import { ScrollArea } from "@/components/ui/scroll-area"
import { ViewToggle } from "@/components/sidebar/view-toggle"
import { FileSearch } from "@/components/sidebar/file-search"
import { FileList } from "@/components/sidebar/file-list"

export function Sidebar() {
  return (
    <aside className="flex w-[360px] min-w-[320px] overflow-hidden flex-col border-r border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border p-3">
        <ViewToggle />
        <FileSearch />
      </div>
      <ScrollArea
        className="flex-1"
        viewportClassName="overflow-x-hidden [&>div]:!block [&>div]:!min-w-0"
      >
        <div className="p-2">
          <FileList />
        </div>
      </ScrollArea>
    </aside>
  )
}
