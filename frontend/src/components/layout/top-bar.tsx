import { useEffect, useState } from "react";
import {
  Sparkles,
  Loader2,
  Globe,
  Laptop,
  Columns2,
  AlignJustify,
  GitBranch,
  FileCheck,
  FileDiff,
  GitCommitHorizontal,
  Upload,
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
import type { Branch, Repo } from "@/types/api";

export function TopBar() {
  const baseRef = useAppStore((s) => s.baseRef);
  const headRef = useAppStore((s) => s.headRef);
  const aiProvider = useAppStore((s) => s.aiProvider);
  const summarizeAll = useAppStore((s) => s.summarizeAll);
  const summarizingAll = useAppStore((s) => s.summarizingAll);
  const branches = useAppStore((s) => s.branches);
  const fetchBranches = useAppStore((s) => s.fetchBranches);
  const reloadDiff = useAppStore((s) => s.reloadDiff);
  const reloading = useAppStore((s) => s.reloading);
  const compareRemote = useAppStore((s) => s.compareRemote);
  const setCompareRemote = useAppStore((s) => s.setCompareRemote);
  const diffMode = useAppStore((s) => s.diffMode);
  const setDiffMode = useAppStore((s) => s.setDiffMode);
  const diffStyle = useAppStore((s) => s.diffStyle);
  const setDiffStyle = useAppStore((s) => s.setDiffStyle);
  const repos = useAppStore((s) => s.repos);
  const currentRepoId = useAppStore((s) => s.currentRepoId);
  const addRepo = useAppStore((s) => s.addRepo);
  const selectRepo = useAppStore((s) => s.selectRepo);
  const gitStatus = useAppStore((s) => s.gitStatus);
  const commitAndPush = useAppStore((s) => s.commitAndPush);
  const committingAndPushing = useAppStore((s) => s.committingAndPushing);
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches, currentRepoId]);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const branchMode = diffMode === "branches";
  const hasRepo = !!currentRepoId;
  const stagedCount = gitStatus.stagedFiles.length;

  const handleBaseChange = (value: string) => {
    reloadDiff({ base: value, head: headRef });
  };

  const handleHeadChange = (value: string) => {
    reloadDiff({ base: baseRef, head: value });
  };

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

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <img
            src="/logo.png"
            alt="DiffDragon"
            className="h-12 w-auto shrink-0 rounded-md object-contain"
          />
        </div>

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
            Add Repo
          </Button>
        </div>

        {/* Diff mode selector: Branches / Staged / Unstaged */}
        <div className="flex shrink-0 items-center rounded-md border border-border">
          <ToggleButton
            active={diffMode === "branches"}
            onClick={() => setDiffMode("branches")}
            icon={<GitBranch className="h-3 w-3" />}
            label="Branches"
            position="left"
            disabled={reloading || !hasRepo}
          />
          <ToggleButton
            active={diffMode === "staged"}
            onClick={() => setDiffMode("staged")}
            icon={<FileCheck className="h-3 w-3" />}
            label="Staged"
            position="middle"
            disabled={reloading || !hasRepo}
          />
          <ToggleButton
            active={diffMode === "unstaged"}
            onClick={() => setDiffMode("unstaged")}
            icon={<FileDiff className="h-3 w-3" />}
            label="Unstaged"
            position="right"
            disabled={reloading || !hasRepo}
          />
        </div>

        {/* Branch selectors — only active in branch mode */}
        <div
          className={`flex shrink-0 items-center gap-1 ${!branchMode || !hasRepo ? "opacity-40 pointer-events-none" : ""}`}
        >
          <BranchSelect
            value={baseRef}
            onChange={handleBaseChange}
            localBranches={localBranches}
            remoteBranches={remoteBranches}
            disabled={reloading || !branchMode || !hasRepo}
          />
          <span className="text-xs text-[#6e7681]">&rarr;</span>
          <BranchSelect
            value={headRef}
            onChange={handleHeadChange}
            localBranches={localBranches}
            remoteBranches={remoteBranches}
            disabled={reloading || !branchMode || !hasRepo}
          />
        </div>

        {reloading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}

        {/* Local/Remote toggle — only relevant in branch mode */}
        {branchMode && hasRepo && (
          <div className="flex shrink-0 items-center rounded-md border border-border">
            <ToggleButton
              active={!compareRemote}
              onClick={() => setCompareRemote(false)}
              icon={<Laptop className="h-3 w-3" />}
              label="Local"
              position="left"
              disabled={reloading || !hasRepo}
            />
            <ToggleButton
              active={compareRemote}
              onClick={() => setCompareRemote(true)}
              icon={<Globe className="h-3 w-3" />}
              label="Remote"
              position="right"
              disabled={reloading || !hasRepo}
            />
          </div>
        )}
      </div>

      <div className="ml-auto flex w-full items-center justify-end gap-1.5 sm:w-auto">
        {hasRepo && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
              <GitCommitHorizontal className="h-3.5 w-3.5" />
              <span>{stagedCount} staged</span>
            </div>
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
              className="h-8 w-[230px] font-mono text-xs"
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
        )}

        {/* Split/Unified diff toggle */}
        <div className="flex items-center rounded-md border border-border">
          <ToggleButton
            active={diffStyle === "unified"}
            onClick={() => setDiffStyle("unified")}
            icon={<AlignJustify className="h-3 w-3" />}
            label="Unified"
            position="left"
          />
          <ToggleButton
            active={diffStyle === "split"}
            onClick={() => setDiffStyle("split")}
            icon={<Columns2 className="h-3 w-3" />}
            label="Split"
            position="right"
          />
        </div>

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
            {summarizingAll ? "Summarizing..." : "Summarize"}
          </Button>
        )}
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
  position,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  position: "left" | "middle" | "right";
  disabled?: boolean;
}) {
  const rounded =
    position === "left"
      ? "rounded-l-md"
      : position === "right"
        ? "rounded-r-md"
        : "";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground"
      } ${rounded}`}
    >
      {icon}
      {label}
    </button>
  );
}

function BranchSelect({
  value,
  onChange,
  localBranches,
  remoteBranches,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  localBranches: Branch[];
  remoteBranches: Branch[];
  disabled?: boolean;
}) {
  const branches = [...localBranches, ...remoteBranches];
  const branchNames = branches.map((branch) => branch.name);
  const containsValue = branchNames.includes(value);
  const remoteBranchNames = new Set(remoteBranches.map((branch) => branch.name));
  const allItems = containsValue || !value
    ? branchNames
    : [value, ...branchNames];

  return (
    <Combobox
      items={allItems}
      value={value}
      onValueChange={(branchName) => {
        if (branchName && branchName !== value) {
          onChange(branchName);
        }
      }}
      disabled={disabled}
    >
      <ComboboxInput
        placeholder="Select branch"
        className="h-7 w-[170px] [&_[data-slot=input-group-control]]:h-7 [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:font-mono [&_[data-slot=input-group-control]]:text-xs"
      />
      <ComboboxContent>
        <ComboboxEmpty>No branches found.</ComboboxEmpty>
        <ComboboxList>
          {(branchName) => (
            <ComboboxItem
              key={branchName}
              value={branchName}
              className="justify-between font-mono text-xs"
            >
              <span>{branchName}</span>
              <span className="text-[10px] text-muted-foreground">
                {remoteBranchNames.has(branchName) ? "remote" : "local"}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
  const repoById = new Map(repos.map((repo) => [repo.id, repo]));
  const repoIds = repos.map((repo) => repo.id);
  const allItems = value && !repoById.has(value) ? [value, ...repoIds] : repoIds;

  return (
    <Combobox
      items={allItems}
      itemToStringValue={(repoId) => repoById.get(repoId)?.name ?? repoId}
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
        className="h-7 w-[220px] [&_[data-slot=input-group-control]]:h-7 [&_[data-slot=input-group-control]]:px-2 [&_[data-slot=input-group-control]]:font-mono [&_[data-slot=input-group-control]]:text-xs"
      />
      <ComboboxContent>
        <ComboboxEmpty>No repositories found.</ComboboxEmpty>
        <ComboboxList>
          {(repoId) => (
            <ComboboxItem key={repoId} value={repoId} className="font-mono text-xs">
              {repoById.get(repoId)?.name ?? repoId}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
