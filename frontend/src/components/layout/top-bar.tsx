import { useEffect } from "react";
import {
  Compass,
  Sparkles,
  Loader2,
  Globe,
  Laptop,
  Columns2,
  AlignJustify,
  GitBranch,
  FileCheck,
  FileDiff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";

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

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches, currentRepoId]);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  const branchMode = diffMode === "branches";
  const hasRepo = !!currentRepoId;

  const handleBaseChange = (value: string) => {
    reloadDiff({ base: value, head: headRef });
  };

  const handleHeadChange = (value: string) => {
    reloadDiff({ base: baseRef, head: value });
  };

  const handleAddRepo = async () => {
    const path = window.prompt(
      "Enter absolute or relative path to a git repository:",
    );
    if (!path) return;

    try {
      await addRepo(path);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to add repository",
      );
    }
  };

  const handleRepoChange = async (repoId: string) => {
    if (!repoId || repoId === currentRepoId) return;
    try {
      await selectRepo(repoId);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Failed to switch repository",
      );
    }
  };

  return (
    <header className="sticky top-0 z-50 flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 text-lg font-bold text-[#39d2c0]">
          <Compass className="h-5 w-5" />
          DiffDragon
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <select
            value={currentRepoId}
            onChange={(e) => handleRepoChange(e.target.value)}
            className="h-7 w-[180px] rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {!currentRepoId && <option value="">Select repository</option>}
            {repos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name}
              </option>
            ))}
          </select>
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
          <Button size="sm" onClick={() => summarizeAll()} disabled={summarizingAll || !hasRepo}>
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
  localBranches: { name: string; isRemote: boolean }[];
  remoteBranches: { name: string; isRemote: boolean }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-7 w-[120px] rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      {/* Current value as fallback if not in list */}
      {![...localBranches, ...remoteBranches].some((b) => b.name === value) && (
        <option value={value}>{value}</option>
      )}
      {localBranches.length > 0 && (
        <optgroup label="Local">
          {localBranches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
      {remoteBranches.length > 0 && (
        <optgroup label="Remote">
          {remoteBranches.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
