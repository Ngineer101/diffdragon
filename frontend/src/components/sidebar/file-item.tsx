import type { MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/app-store";
import type { DiffFile } from "@/types/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  added: "bg-[#23863620] text-[#3fb950] border-[#23863640]",
  modified: "bg-[#58a6ff15] text-[#58a6ff] border-[#58a6ff30]",
  deleted: "bg-[#f8514920] text-[#f85149] border-[#f8514940]",
  renamed: "bg-[#bc8cff15] text-[#bc8cff] border-[#bc8cff30]",
  binary: "bg-[#8b949e20] text-[#8b949e] border-[#8b949e40]",
};

function riskClass(score: number) {
  if (score >= 50) return "bg-[#f8514930] text-[#f85149] border-[#f8514940]";
  if (score >= 20) return "bg-[#d2992230] text-[#d29922] border-[#d2992240]";
  return "bg-[#3fb95020] text-[#3fb950] border-[#3fb95030]";
}

function riskLevel(score: number) {
  if (score >= 50) return "High";
  if (score >= 20) return "Medium";
  return "Low";
}

interface FileItemProps {
  file: DiffFile;
  index: number;
}

export function FileItem({ file, index }: FileItemProps) {
  const activeFileIndex = useAppStore((s) => s.activeFileIndex);
  const reviewedFiles = useAppStore((s) => s.reviewedFiles);
  const selectFile = useAppStore((s) => s.selectFile);
  const gitStatus = useAppStore((s) => s.gitStatus);
  const diffMode = useAppStore((s) => s.diffMode);
  const stageFile = useAppStore((s) => s.stageFile);
  const unstageFile = useAppStore((s) => s.unstageFile);
  const stagingPath = useAppStore((s) => s.stagingPath);
  const discardFile = useAppStore((s) => s.discardFile);
  const discardingPath = useAppStore((s) => s.discardingPath);

  const isActive = index === activeFileIndex;
  const isReviewed = reviewedFiles.has(index);
  const isStaged = gitStatus.stagedFiles.includes(file.path);
  const isUnstaged = gitStatus.unstagedFiles.includes(file.path);
  const canStage = diffMode === "unstaged" || isUnstaged;
  const canUnstage = (diffMode === "staged" || isStaged) && !canStage;
  const isMutating = stagingPath === file.path || discardingPath === file.path;
  const level = riskLevel(file.riskScore);

  const handleStage = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await stageFile(file.path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stage file");
    }
  };

  const handleUnstage = async (event: MouseEvent) => {
    event.stopPropagation();
    try {
      await unstageFile(file.path);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to unstage file",
      );
    }
  };

  const handleDiscard = async () => {
    try {
      await discardFile(file.path);
      toast.success("Changes discarded", { description: file.path });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to discard changes",
      );
    }
  };

  const lastSlash = file.path.lastIndexOf("/");
  const name = lastSlash >= 0 ? file.path.slice(lastSlash + 1) : file.path;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => selectFile(index)}
          className={cn(
            "flex w-full min-w-0 overflow-hidden flex-col gap-1 rounded-lg border-2 px-3 py-2.5 text-left transition-colors",
            "hover:bg-accent/60",
            isActive && "border-primary bg-secondary",
            isReviewed && "opacity-50",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase",
                statusColors[file.status],
              )}
            >
              {file.status.slice(0, 3)}
            </Badge>
            <span className="min-w-0 flex-1 truncate font-mono text-[13px] font-medium">
              {name}
            </span>
            {canStage && (
              <Button
                size="xs"
                variant="outline"
                onClick={handleStage}
                disabled={isMutating}
                className="h-5 px-1.5 text-[10px]"
              >
                {isMutating ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  "Stage"
                )}
              </Button>
            )}
            {canUnstage && (
              <Button
                size="xs"
                variant="outline"
                onClick={handleUnstage}
                disabled={isMutating}
                className="h-5 px-1.5 text-[10px]"
              >
                {isMutating ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  "Unstage"
                )}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={(event) => event.stopPropagation()}
                  disabled={isMutating}
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  title="Discard file changes"
                >
                  {isMutating ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Undo2 className="h-2.5 w-2.5" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(event) => event.stopPropagation()}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Discard file changes?</AlertDialogTitle>
                  <AlertDialogDescription className="break-all">
                    Discard all staged and unstaged changes for {file.path}? This
                    cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={(event) => event.stopPropagation()}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleDiscard();
                    }}
                  >
                    Discard
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 px-2 py-0 text-[10px] font-semibold",
                riskClass(file.riskScore),
              )}
            >
              {level}
            </Badge>
          </div>
          <div className="flex min-w-0 items-center gap-2.5 pl-0.5">
            <span className="shrink-0 font-mono text-[11px]">
              <span className="text-[#3fb950]">+{file.linesAdded}</span>{" "}
              <span className="text-[#f85149]">&minus;{file.linesRemoved}</span>
            </span>
            <span
              className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-muted-foreground"
              title={file.path}
            >
              {file.path}
            </span>
          </div>
          {file.summary && (
            <p className="truncate pl-0.5 text-xs text-muted-foreground">
              {file.summary}
            </p>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <p className="font-mono text-xs">{file.path}</p>
      </TooltipContent>
    </Tooltip>
  );
}
