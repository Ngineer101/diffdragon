import { PatchDiff } from "@pierre/diffs/react";
import { Card } from "@/components/ui/card";

interface DiffViewerProps {
  rawDiff: string;
  filePath: string;
}

export function DiffViewer({ rawDiff, filePath }: DiffViewerProps) {
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
      className="mx-6 my-4 min-w-0 overflow-x-auto rounded-lg border border-border"
      style={{ maxWidth: "calc(100vw - 408px)" }}
    >
      <PatchDiff
        patch={patch}
        options={{
          theme: "pierre-dark",
          themeType: "dark",
          diffStyle: "unified",
          overflow: "scroll",
        }}
      />
    </div>
  );
}
