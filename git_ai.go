package main

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
)

type GitAIFileNoteItem struct {
	Commit          string `json:"commit"`
	PromptID        string `json:"promptId"`
	LineRanges      string `json:"lineRanges"`
	Tool            string `json:"tool"`
	Model           string `json:"model"`
	HumanAuthor     string `json:"humanAuthor"`
	MessagesURL     string `json:"messagesUrl"`
	AcceptedLines   int    `json:"acceptedLines"`
	OverriddenLines int    `json:"overriddenLines"`
	TotalAdditions  int    `json:"totalAdditions"`
	TotalDeletions  int    `json:"totalDeletions"`
}

type gitAINotePromptMeta struct {
	AgentID struct {
		Tool  string `json:"tool"`
		Model string `json:"model"`
	} `json:"agent_id"`
	HumanAuthor   string `json:"human_author"`
	MessagesURL   string `json:"messages_url"`
	AcceptedLines int    `json:"accepted_lines"`
	Overridden    int    `json:"overriden_lines"`
	Additions     int    `json:"total_additions"`
	Deletions     int    `json:"total_deletions"`
}

type gitAINoteJSON struct {
	Prompts map[string]gitAINotePromptMeta `json:"prompts"`
}

type gitAINoteRange struct {
	PromptID   string
	LineRanges string
}

type GitAIPromptDetail struct {
	Commit   string          `json:"commit"`
	PromptID string          `json:"prompt_id"`
	Prompt   json.RawMessage `json:"prompt"`
}

func GetGitAIFileNotes(repoPath string, base string, head string, filePath string, oldPath string) ([]GitAIFileNoteItem, error) {
	base = strings.TrimSpace(base)
	head = strings.TrimSpace(head)
	filePath = strings.TrimSpace(filePath)
	oldPath = strings.TrimSpace(oldPath)

	if base == "" || head == "" {
		return nil, fmt.Errorf("base and head are required")
	}
	if filePath == "" {
		return nil, fmt.Errorf("file path is required")
	}

	commitSet := make(map[string]struct{})
	orderedCommits := make([]string, 0)

	collectCommits := func(path string) error {
		if path == "" {
			return nil
		}
		out, err := runGit(repoPath, "log", "--format=%H", fmt.Sprintf("%s..%s", base, head), "--", path)
		if err != nil {
			return fmt.Errorf("failed to list commits for %q: %w", path, err)
		}
		for _, commit := range splitGitLines(out) {
			if _, exists := commitSet[commit]; exists {
				continue
			}
			commitSet[commit] = struct{}{}
			orderedCommits = append(orderedCommits, commit)
		}
		return nil
	}

	if err := collectCommits(filePath); err != nil {
		return nil, err
	}
	if oldPath != "" && oldPath != filePath {
		if err := collectCommits(oldPath); err != nil {
			return nil, err
		}
	}

	items := make([]GitAIFileNoteItem, 0)
	for _, commit := range orderedCommits {
		note, err := runGit(repoPath, "notes", "--ref=ai", "show", commit)
		if err != nil {
			continue
		}

		fileRanges, prompts, parseErr := parseGitAINote(note)
		if parseErr != nil {
			continue
		}

		ranges := append([]gitAINoteRange{}, fileRanges[filePath]...)
		if oldPath != "" && oldPath != filePath {
			ranges = append(ranges, fileRanges[oldPath]...)
		}

		for _, r := range ranges {
			meta := prompts[r.PromptID]
			items = append(items, GitAIFileNoteItem{
				Commit:          commit,
				PromptID:        r.PromptID,
				LineRanges:      r.LineRanges,
				Tool:            meta.AgentID.Tool,
				Model:           meta.AgentID.Model,
				HumanAuthor:     meta.HumanAuthor,
				MessagesURL:     meta.MessagesURL,
				AcceptedLines:   meta.AcceptedLines,
				OverriddenLines: meta.Overridden,
				TotalAdditions:  meta.Additions,
				TotalDeletions:  meta.Deletions,
			})
		}
	}

	return items, nil
}

func parseGitAINote(note string) (map[string][]gitAINoteRange, map[string]gitAINotePromptMeta, error) {
	note = strings.TrimSpace(note)
	if note == "" {
		return map[string][]gitAINoteRange{}, map[string]gitAINotePromptMeta{}, nil
	}

	parts := strings.SplitN(note, "\n---\n", 2)
	top := ""
	jsonPart := ""

	if len(parts) == 2 {
		top = strings.TrimSpace(parts[0])
		jsonPart = strings.TrimSpace(parts[1])
	} else if strings.HasPrefix(note, "---") {
		jsonPart = strings.TrimSpace(strings.TrimPrefix(note, "---"))
	} else {
		top = strings.TrimSpace(note)
	}

	fileRanges := parseGitAINoteTop(top)

	prompts := map[string]gitAINotePromptMeta{}
	if jsonPart != "" {
		payload := gitAINoteJSON{}
		if err := json.Unmarshal([]byte(jsonPart), &payload); err != nil {
			return nil, nil, err
		}
		if payload.Prompts != nil {
			prompts = payload.Prompts
		}
	}

	return fileRanges, prompts, nil
}

func parseGitAINoteTop(top string) map[string][]gitAINoteRange {
	result := map[string][]gitAINoteRange{}
	if top == "" {
		return result
	}

	currentPath := ""
	for _, raw := range strings.Split(top, "\n") {
		line := strings.TrimRight(raw, "\r")
		if strings.TrimSpace(line) == "" {
			continue
		}

		trimmedLeft := strings.TrimLeft(line, " \t")
		isIndented := len(trimmedLeft) < len(line)
		if !isIndented {
			currentPath = strings.TrimSpace(line)
			if _, ok := result[currentPath]; !ok {
				result[currentPath] = []gitAINoteRange{}
			}
			continue
		}

		if currentPath == "" {
			continue
		}

		fields := strings.Fields(trimmedLeft)
		if len(fields) == 0 {
			continue
		}
		promptID := fields[0]
		lineRanges := strings.TrimSpace(strings.TrimPrefix(trimmedLeft, promptID))
		result[currentPath] = append(result[currentPath], gitAINoteRange{
			PromptID:   promptID,
			LineRanges: lineRanges,
		})
	}

	for path := range result {
		sort.SliceStable(result[path], func(i int, j int) bool {
			return result[path][i].PromptID < result[path][j].PromptID
		})
	}

	return result
}

func GetGitAIPromptDetail(repoPath string, promptID string, commit string) (*GitAIPromptDetail, error) {
	promptID = strings.TrimSpace(promptID)
	commit = strings.TrimSpace(commit)
	if promptID == "" {
		return nil, fmt.Errorf("prompt id is required")
	}
	if commit == "" {
		return nil, fmt.Errorf("commit is required")
	}

	out, err := runGitAI(repoPath, "show-prompt", promptID, "--commit", commit)
	if err != nil {
		return nil, err
	}

	var detail GitAIPromptDetail
	if err := json.Unmarshal([]byte(strings.TrimSpace(out)), &detail); err != nil {
		return nil, fmt.Errorf("failed to parse git-ai show-prompt output: %w", err)
	}
	return &detail, nil
}

func runGitAI(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git-ai", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git-ai %s failed: %w\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}
