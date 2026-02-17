package main

import (
	"fmt"
	"os/exec"
	"path/filepath"
	"strings"
)

// DiffData holds the complete parsed diff result.
type DiffData struct {
	BaseRef string      `json:"baseRef"`
	HeadRef string      `json:"headRef"`
	Files   []*DiffFile `json:"files"`
}

// DiffFile represents a single changed file in the diff.
type DiffFile struct {
	Path         string      `json:"path"`
	OldPath      string      `json:"oldPath,omitempty"` // Set if file was renamed
	Status       string      `json:"status"`            // added, modified, deleted, renamed
	Language     string      `json:"language"`
	Hunks        []*DiffHunk `json:"hunks"`
	RawDiff      string      `json:"rawDiff"`
	LinesAdded   int         `json:"linesAdded"`
	LinesRemoved int         `json:"linesRemoved"`

	// Populated by analysis phase
	RiskScore     int      `json:"riskScore"`
	RiskReasons   []string `json:"riskReasons"`
	SemanticGroup string   `json:"semanticGroup"`

	// Populated by AI phase
	Summary   string   `json:"summary,omitempty"`
	Checklist []string `json:"checklist,omitempty"`
}

// DiffHunk represents a single hunk within a file diff.
type DiffHunk struct {
	Header  string `json:"header"`            // @@ line
	Content string `json:"content"`           // The actual diff content
	Summary string `json:"summary,omitempty"` // AI-generated summary

	LinesAdded   int `json:"linesAdded"`
	LinesRemoved int `json:"linesRemoved"`
}

// ParseGitDiff executes git diff and parses the output into structured data.
func ParseGitDiff(cfg *Config) (*DiffData, error) {
	raw, err := runGitDiff(cfg)
	if err != nil {
		return nil, err
	}

	data := &DiffData{
		BaseRef: cfg.Base,
		HeadRef: cfg.Head,
	}

	if cfg.Staged {
		data.BaseRef = "staged"
		data.HeadRef = "index"
	} else if cfg.Unstaged {
		data.BaseRef = "index"
		data.HeadRef = "working tree"
	}

	data.Files = parseDiffOutput(raw)
	if data.Files == nil {
		data.Files = []*DiffFile{}
	}
	return data, nil
}

// runGitDiff executes the appropriate git diff command and returns raw output.
func runGitDiff(cfg *Config) (string, error) {
	var args []string

	if cfg.Staged {
		args = []string{"diff", "--staged"}
	} else if cfg.Unstaged {
		args = []string{"diff"}
	} else {
		args = []string{"diff", fmt.Sprintf("%s...%s", cfg.Base, cfg.Head)}
	}

	// Add unified context and detect renames
	args = append(args, "-U3", "--find-renames")
	// Force a parseable diff regardless of user git config
	args = append(args, "--no-color", "--no-ext-diff")

	cmd := exec.Command("git", args...)
	cmd.Dir = cfg.RepoPath

	out, err := cmd.Output()
	if err != nil {
		// git diff returns exit code 1 if there are differences, which is fine
		if ee, ok := err.(*exec.ExitError); ok && ee.ExitCode() == 1 {
			return string(out), nil
		}
		return "", fmt.Errorf("git diff failed: %w\nstderr: %s", err, string(exitErr(err)))
	}

	return string(out), nil
}

// exitErr extracts stderr from an exec error.
func exitErr(err error) []byte {
	if exitErr, ok := err.(*exec.ExitError); ok {
		return exitErr.Stderr
	}
	return []byte("unknown error")
}

// parseDiffOutput splits raw git diff output into structured DiffFile and DiffHunk objects.
func parseDiffOutput(raw string) []*DiffFile {
	var files []*DiffFile

	// Split by "diff --git" markers
	parts := strings.Split(raw, "diff --git ")
	for _, part := range parts[1:] { // Skip the first empty element
		file := parseFileDiff("diff --git " + part)
		if file != nil {
			files = append(files, file)
		}
	}

	return files
}

// parseFileDiff parses a single file's diff section.
func parseFileDiff(section string) *DiffFile {
	lines := strings.Split(section, "\n")
	if len(lines) < 1 {
		return nil
	}

	file := &DiffFile{}

	// Parse the "diff --git a/path b/path" header
	header := lines[0]
	parts := strings.Fields(header)
	if len(parts) >= 4 {
		file.Path = normalizeGitDiffPath(parts[3])
		oldPath := normalizeGitDiffPath(parts[2])
		if oldPath != file.Path {
			file.OldPath = oldPath
		}
	}

	// Determine file status and parse metadata lines
	file.Status = "modified"
	var diffBodyStart int

	for i, line := range lines[1:] {
		idx := i + 1
		if strings.HasPrefix(line, "new file") {
			file.Status = "added"
		} else if strings.HasPrefix(line, "deleted file") {
			file.Status = "deleted"
		} else if strings.HasPrefix(line, "rename from") {
			file.Status = "renamed"
		} else if strings.HasPrefix(line, "@@") {
			diffBodyStart = idx
			break
		} else if strings.HasPrefix(line, "Binary files") {
			file.Status = "binary"
			diffBodyStart = idx
			break
		}
	}

	// Detect language from file extension
	file.Language = detectLanguage(file.Path)

	// Parse hunks from the diff body
	if diffBodyStart > 0 {
		hunkLines := lines[diffBodyStart:]
		file.Hunks = parseHunks(hunkLines)
		file.RawDiff = strings.Join(hunkLines, "\n")
	}

	// Count total lines added/removed
	for _, h := range file.Hunks {
		file.LinesAdded += h.LinesAdded
		file.LinesRemoved += h.LinesRemoved
	}

	return file
}

// parseHunks splits the diff body into individual hunks.
func parseHunks(lines []string) []*DiffHunk {
	var hunks []*DiffHunk
	var current *DiffHunk

	for _, line := range lines {
		if strings.HasPrefix(line, "@@") {
			// Start a new hunk
			if current != nil {
				hunks = append(hunks, current)
			}
			current = &DiffHunk{
				Header: line,
			}
		} else if current != nil {
			current.Content += line + "\n"

			if strings.HasPrefix(line, "+") && !strings.HasPrefix(line, "+++") {
				current.LinesAdded++
			} else if strings.HasPrefix(line, "-") && !strings.HasPrefix(line, "---") {
				current.LinesRemoved++
			}
		}
	}

	if current != nil {
		hunks = append(hunks, current)
	}

	return hunks
}

// Branch represents a git branch.
type Branch struct {
	Name     string `json:"name"`
	IsRemote bool   `json:"isRemote"`
}

// ListBranches returns all local and remote branches plus the current branch name.
func ListBranches(repoPath string) ([]Branch, string, error) {
	// Get current branch
	currentCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	currentCmd.Dir = repoPath
	currentOut, err := currentCmd.Output()
	if err != nil {
		return nil, "", fmt.Errorf("failed to get current branch: %w", err)
	}
	current := strings.TrimSpace(string(currentOut))

	// Get all branches
	branchCmd := exec.Command("git", "branch", "-a", "--format=%(refname:short)")
	branchCmd.Dir = repoPath
	branchOut, err := branchCmd.Output()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list branches: %w", err)
	}

	seen := make(map[string]bool)
	var branches []Branch
	for _, line := range strings.Split(strings.TrimSpace(string(branchOut)), "\n") {
		name := strings.TrimSpace(line)
		if name == "" || seen[name] {
			continue
		}
		// Skip HEAD pointer entries like "origin/HEAD"
		if strings.HasSuffix(name, "/HEAD") {
			continue
		}
		seen[name] = true
		isRemote := strings.Contains(name, "/")
		branches = append(branches, Branch{Name: name, IsRemote: isRemote})
	}

	return branches, current, nil
}

// ResolveDefaultBaseRef picks a sensible base branch for a repository.
// Preference order: main, master, then current branch.
func ResolveDefaultBaseRef(repoPath string) string {
	for _, candidate := range []string{"main", "master"} {
		if branchExists(repoPath, candidate) {
			return candidate
		}
	}

	currentCmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	currentCmd.Dir = repoPath
	if out, err := currentCmd.Output(); err == nil {
		current := strings.TrimSpace(string(out))
		if current != "" && current != "HEAD" {
			return current
		}
	}

	return "HEAD"
}

func branchExists(repoPath string, branch string) bool {
	cmd := exec.Command("git", "show-ref", "--verify", "--quiet", fmt.Sprintf("refs/heads/%s", branch))
	cmd.Dir = repoPath
	if err := cmd.Run(); err == nil {
		return true
	}

	cmd = exec.Command("git", "show-ref", "--verify", "--quiet", fmt.Sprintf("refs/remotes/origin/%s", branch))
	cmd.Dir = repoPath
	return cmd.Run() == nil
}

// detectLanguage guesses the programming language from the file extension.
func detectLanguage(path string) string {
	ext := strings.ToLower(filepath.Ext(path))

	langMap := map[string]string{
		".go":         "go",
		".py":         "python",
		".js":         "javascript",
		".ts":         "typescript",
		".tsx":        "typescript",
		".jsx":        "javascript",
		".rs":         "rust",
		".rb":         "ruby",
		".java":       "java",
		".kt":         "kotlin",
		".swift":      "swift",
		".c":          "c",
		".cpp":        "cpp",
		".h":          "c",
		".cs":         "csharp",
		".php":        "php",
		".sql":        "sql",
		".sh":         "bash",
		".bash":       "bash",
		".zsh":        "bash",
		".yaml":       "yaml",
		".yml":        "yaml",
		".json":       "json",
		".toml":       "toml",
		".xml":        "xml",
		".html":       "html",
		".css":        "css",
		".scss":       "css",
		".md":         "markdown",
		".proto":      "protobuf",
		".tf":         "terraform",
		".dockerfile": "dockerfile",
	}

	if lang, ok := langMap[ext]; ok {
		return lang
	}

	// Check filename-based detection
	base := strings.ToLower(filepath.Base(path))
	if base == "dockerfile" {
		return "dockerfile"
	}
	if base == "makefile" {
		return "makefile"
	}

	return "plaintext"
}

func normalizeGitDiffPath(token string) string {
	token = strings.Trim(token, "\"")
	if token == "/dev/null" {
		return token
	}
	if slash := strings.Index(token, "/"); slash >= 0 && slash < len(token)-1 {
		return token[slash+1:]
	}
	return token
}
