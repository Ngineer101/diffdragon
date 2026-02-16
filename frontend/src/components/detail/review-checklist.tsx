import { useState } from "react"
import { Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useAppStore } from "@/stores/app-store"
import { cn } from "@/lib/utils"

interface ReviewChecklistProps {
  checklist?: string[]
  fileIndex: number
}

export function ReviewChecklist({ checklist, fileIndex }: ReviewChecklistProps) {
  const generatingChecklist = useAppStore((s) => s.generatingChecklist)
  const isLoading = generatingChecklist === fileIndex
  const [checked, setChecked] = useState<Set<number>>(new Set())

  if (!checklist?.length && !isLoading) return null

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <Card className="mx-6 mt-4 border-border bg-secondary">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#d29922]">
          <Shield className="h-3.5 w-3.5" />
          Review Checklist
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {checklist?.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <Checkbox
                  id={`cl-${i}`}
                  checked={checked.has(i)}
                  onCheckedChange={() => toggle(i)}
                  className="mt-0.5"
                />
                <label
                  htmlFor={`cl-${i}`}
                  className={cn(
                    "cursor-pointer text-sm text-muted-foreground",
                    checked.has(i) && "text-muted-foreground/50 line-through",
                  )}
                >
                  {item}
                </label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
