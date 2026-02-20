import { useEffect, useMemo, useRef } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/stores/app-store";

interface DiffViewerProps {
  rawDiff: string;
  filePath: string;
  highlightedLineRanges?: string;
}

export function DiffViewer({ rawDiff, filePath, highlightedLineRanges }: DiffViewerProps) {
  const diffStyle = useAppStore((s) => s.diffStyle);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const highlightedLines = useMemo(() => parseLineRanges(highlightedLineRanges), [highlightedLineRanges]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const previous = root.querySelectorAll(".git-ai-line-highlight");
    previous.forEach((el) => el.classList.remove("git-ai-line-highlight"));

    if (highlightedLines.length === 0) return;

    let first: HTMLElement | null = null;
    for (const line of highlightedLines) {
      const nodes = root.querySelectorAll<HTMLElement>(`[data-line=\"${line}\"]`);
      for (const node of nodes) {
        node.classList.add("git-ai-line-highlight");
        if (!first) {
          first = node;
        }
      }
    }

    if (first) {
      first.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlightedLines, rawDiff, diffStyle]);

  if (!rawDiff) {
    return (
      <Card className="mx-6 my-4 border-border bg-card">
        <div className="p-4 font-mono text-sm italic text-muted-foreground">
          No diff content (binary file?)
        </div>
      </Card>
    );
  }

  // Reconstruct a minimal unified diff header so PatchDiff can parse it
  const patch = `--- a/${filePath}\n+++ b/${filePath}\n${rawDiff}`;

  return (
    <div
      ref={containerRef}
      className="mx-6 my-4 min-w-0 overflow-x-auto rounded-lg border border-border"
    >
      <PatchDiff
        patch={patch}
        options={{
          theme: "pierre-dark",
          themeType: "dark",
          diffStyle,
          overflow: "scroll",
        }}
      />
    </div>
  );
}

function parseLineRanges(raw?: string): number[] {
  if (!raw) return [];

  const values = new Set<number>();
  const parts = raw.split(",");
  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;

    const rangeMatch = piece.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let line = low; line <= high && values.size < 5000; line += 1) {
        values.add(line);
      }
      continue;
    }

    const line = Number(piece);
    if (Number.isFinite(line)) {
      values.add(line);
    }
  }

  return [...values].sort((a, b) => a - b);
}
