import { useState } from "react";
import {
  Sparkles,
  Loader2,
  GitCommitHorizontal,
  Upload,
  GitPullRequest,
  X,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxInput,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/stores/app-store";
import * as api from "@/lib/api";
import { toast } from "sonner";
import type { Repo } from "@/types/api";

export function TopBar() {
  const aiProvider = useAppStore((s) => s.aiProvider);
  const summarizeAll = useAppStore((s) => s.summarizeAll);
  const summarizingAll = useAppStore((s) => s.summarizingAll);
  const reloading = useAppStore((s) => s.reloading);
  const repos = useAppStore((s) => s.repos);
  const currentRepoId = useAppStore((s) => s.currentRepoId);
  const addRepo = useAppStore((s) => s.addRepo);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const gitStatus = useAppStore((s) => s.gitStatus);
  const commitAndPush = useAppStore((s) => s.commitAndPush);
  const committingAndPushing = useAppStore((s) => s.committingAndPushing);
  const prWorktreePath = useAppStore((s) => s.prWorktreePath);
  const openGithubPr = useAppStore((s) => s.openGithubPr);
  const closeGithubPr = useAppStore((s) => s.closeGithubPr);
  const [commitMessage, setCommitMessage] = useState("");
  const [prInput, setPrInput] = useState("");
  const [openingPR, setOpeningPR] = useState(false);
  const [closingPR, setClosingPR] = useState(false);

  const hasRepo = !!currentRepoId;
  const stagedCount = gitStatus.stagedFiles.length;

  const handleAddRepo = async () => {
    try {
      const { path } = await api.pickRepoDirectory();
      if (!path) return;
      await addRepo(path);
      toast.success("Repository added", {
        description: path,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add repository",
      );
    }
  };

  const handleRepoChange = async (repoId: string) => {
    if (!repoId || repoId === currentRepoId) return;
    try {
      await selectRepo(repoId);
      const repoName = repos.find((repo) => repo.id === repoId)?.name ?? "Repository switched";
      toast.success("Repository switched", {
        description: repoName,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to switch repository",
      );
    }
  };

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim()) {
      toast.error("Enter a commit message first.");
      return;
    }

    const toastId = toast.loading("Committing, syncing with remote, and pushing...");

    try {
      const result = await commitAndPush(commitMessage.trim());
      setCommitMessage("");

      let syncMessage = "Pushed to remote.";
      if (result.pulledBeforePush) {
        syncMessage = "Pulled outstanding remote changes, then pushed.";
      } else if (result.syncedWithRemote) {
        syncMessage = "Synced with remote, then pushed.";
      }

      const output = [result.commitOutput, result.syncOutput, result.pushOutput]
        .filter(Boolean)
        .join("\n");
      const preview = output.length > 180 ? `${output.slice(0, 180)}...` : output;
      toast.success("Commit and push completed", {
        id: toastId,
        description: preview ? `${syncMessage} ${preview}` : syncMessage,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to commit and push",
        { id: toastId },
      );
    }
  };

  const handleOpenPR = async () => {
    const value = prInput.trim();
    if (!value) {
      toast.error("Enter a PR number, URL, or selector.");
      return;
    }

    const toastId = toast.loading("Opening GitHub PR...");
    setOpeningPR(true);
    try {
      const result = await openGithubPr(value);
      setPrInput("");
      toast.success("PR opened", {
        id: toastId,
        description: `PR #${result.prNumber} ready at ${result.worktreePath}`,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to open GitHub PR",
        { id: toastId },
      );
    } finally {
      setOpeningPR(false);
    }
  };

  const handleClosePR = async () => {
    if (!prWorktreePath) return;
    const toastId = toast.loading("Closing GitHub PR...");
    setClosingPR(true);
    try {
      await closeGithubPr();
      toast.success("PR closed", { id: toastId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to close GitHub PR",
        { id: toastId },
      );
    } finally {
      setClosingPR(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card px-3 py-2 backdrop-blur-sm">
      <div className="flex w-full min-w-0 items-center gap-2">
        <div className="flex items-center">
          <img
            src="/logo.png"
            alt="DiffDragon"
            className="h-10 w-auto shrink-0 rounded-md object-contain"
          />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <div className="flex shrink-0 items-center gap-1">
          <RepoSelect
            repos={repos}
            value={currentRepoId}
            onChange={handleRepoChange}
            disabled={reloading}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddRepo}
            disabled={reloading}
          >
            Add
          </Button>
          </div>

          {reloading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">

        {aiProvider !== "none" && hasRepo && (
          <Button
            size="sm"
            onClick={() => summarizeAll()}
            disabled={summarizingAll || !hasRepo}
          >
            {summarizingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden md:inline">
              {summarizingAll ? "Summarizing..." : "Summarize"}
            </span>
          </Button>
        )}

        {hasRepo && (
          <details className="relative">
            <summary className="inline-flex list-none cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Actions</span>
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,420px)] rounded-md border border-border bg-card p-3 shadow-lg">
              <div className="mb-3 flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                <span>{stagedCount} staged</span>
              </div>

              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={prInput}
                  onChange={(e) => setPrInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleOpenPR();
                    }
                  }}
                  placeholder="Open GitHub PR"
                  className="h-8 flex-1 font-mono text-xs"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    onClick={handleOpenPR}
                    disabled={openingPR || reloading || !hasRepo}
                  >
                    {openingPR ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GitPullRequest className="h-4 w-4" />
                    )}
                    {openingPR ? "Opening..." : "Open PR"}
                  </Button>
                  {prWorktreePath && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClosePR}
                      disabled={closingPR}
                    >
                      {closingPR ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      {closingPR ? "Closing..." : "Close PR"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleCommitAndPush();
                    }
                  }}
                  placeholder="Commit message"
                  className="h-8 flex-1 font-mono text-xs"
                />
                <Button
                  size="sm"
                  onClick={handleCommitAndPush}
                  disabled={
                    committingAndPushing ||
                    stagedCount === 0 ||
                    !commitMessage.trim()
                  }
                >
                  {committingAndPushing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {committingAndPushing ? "Pushing..." : "Commit & Push"}
                </Button>
              </div>
            </div>
          </details>
        )}
      </div>
      </div>
    </header>
  );
}

function RepoSelect({
  repos,
  value,
  onChange,
  disabled,
}: {
  repos: Repo[];
  value: string;
  onChange: (repoId: string) => void;
  disabled?: boolean;
}) {
  const repoLabel = (repo?: Repo) => {
    if (!repo) return "";
    const raw = (repo.name || repo.path || "").trim();
    if (!raw) return "";
    return raw.split(/[\\/]/).filter(Boolean).pop() ?? raw;
  };

  const repoById = new Map(repos.map((repo) => [repo.id, repo]));
  const repoIds = repos.map((repo) => repo.id);
  const allItems = value && !repoById.has(value) ? [value, ...repoIds] : repoIds;

  return (
    <Combobox
      items={allItems}
      itemToStringLabel={(repoId) => repoLabel(repoById.get(repoId)) || repoId}
      itemToStringValue={(repoId) => repoLabel(repoById.get(repoId)) || repoId}
      value={value}
      onValueChange={(repoId) => {
        if (repoId && repoId !== value) {
          onChange(repoId);
        }
      }}
      disabled={disabled}
    >
      <ComboboxInput
        placeholder="Select repository"
        className="h-7 w-[140px] sm:w-[220px] [&_[data-slot=input-group-control]]:h-7 [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:font-mono [&_[data-slot=input-group-control]]:text-xs"
      />
      <ComboboxContent>
        <ComboboxEmpty>No repositories found.</ComboboxEmpty>
        <ComboboxList>
          {(repoId) => (
            <ComboboxItem key={repoId} value={repoId} className="font-mono text-xs">
              {repoLabel(repoById.get(repoId)) || repoId}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
