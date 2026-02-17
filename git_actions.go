package main

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type GitStatus struct {
	StagedFiles    []string `json:"stagedFiles"`
	UnstagedFiles  []string `json:"unstagedFiles"`
	CurrentBranch  string   `json:"currentBranch"`
	UpstreamBranch string   `json:"upstreamBranch,omitempty"`
	HasUpstream    bool     `json:"hasUpstream"`
	Ahead          int      `json:"ahead"`
	Behind         int      `json:"behind"`
}

func GetGitStatus(repoPath string) (GitStatus, error) {
	stagedOut, err := runGit(repoPath, "diff", "--name-only", "--cached")
	if err != nil {
		return GitStatus{}, fmt.Errorf("failed to get staged files: %w", err)
	}

	unstagedOut, err := runGit(repoPath, "diff", "--name-only")
	if err != nil {
		return GitStatus{}, fmt.Errorf("failed to get unstaged files: %w", err)
	}

	branchOut, err := runGit(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return GitStatus{}, fmt.Errorf("failed to get current branch: %w", err)
	}

	status := GitStatus{
		StagedFiles:   splitGitLines(stagedOut),
		UnstagedFiles: splitGitLines(unstagedOut),
		CurrentBranch: strings.TrimSpace(branchOut),
	}

	upstreamOut, upstreamErr := runGit(repoPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}")
	if upstreamErr != nil {
		return status, nil
	}

	status.UpstreamBranch = strings.TrimSpace(upstreamOut)
	status.HasUpstream = status.UpstreamBranch != ""

	if status.HasUpstream {
		countsOut, err := runGit(repoPath, "rev-list", "--left-right", "--count", status.UpstreamBranch+"...HEAD")
		if err == nil {
			parts := strings.Fields(strings.TrimSpace(countsOut))
			if len(parts) == 2 {
				if behind, parseErr := strconv.Atoi(parts[0]); parseErr == nil {
					status.Behind = behind
				}
				if ahead, parseErr := strconv.Atoi(parts[1]); parseErr == nil {
					status.Ahead = ahead
				}
			}
		}
	}

	return status, nil
}

func StageFile(repoPath string, path string) error {
	_, err := runGit(repoPath, "add", "--", path)
	if err != nil {
		return fmt.Errorf("failed to stage file: %w", err)
	}
	return nil
}

func UnstageFile(repoPath string, path string) error {
	if _, err := runGit(repoPath, "restore", "--staged", "--", path); err == nil {
		return nil
	}

	if _, err := runGit(repoPath, "rm", "--cached", "--quiet", "--ignore-unmatch", "--", path); err == nil {
		return nil
	}

	return fmt.Errorf("failed to unstage file %q", path)
}

func Commit(repoPath string, message string) (string, error) {
	out, err := runGit(repoPath, "commit", "-m", message)
	if err != nil {
		return out, fmt.Errorf("failed to create commit: %w", err)
	}
	return out, nil
}

func Push(repoPath string, status GitStatus) (string, error) {
	if status.HasUpstream {
		out, err := runGit(repoPath, "push")
		if err != nil {
			return out, fmt.Errorf("failed to push to upstream: %w", err)
		}
		return out, nil
	}

	out, err := runGit(repoPath, "push", "-u", "origin", "HEAD")
	if err != nil {
		return out, fmt.Errorf("failed to push and set upstream: %w", err)
	}
	return out, nil
}

func runGit(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("git %s failed: %w\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func splitGitLines(raw string) []string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return []string{}
	}
	lines := strings.Split(trimmed, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		value := strings.TrimSpace(line)
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}
