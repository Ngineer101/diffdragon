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

type SyncResult struct {
	Output  string
	Fetched bool
	Pulled  bool
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

func DiscardFileChanges(repoPath string, path string) error {
	_, restoreErr := runGit(repoPath, "restore", "--source=HEAD", "--staged", "--worktree", "--", path)
	_, cleanErr := runGit(repoPath, "clean", "-fd", "--", path)

	if restoreErr != nil && cleanErr != nil {
		return fmt.Errorf("failed to discard changes for %q: %v", path, restoreErr)
	}

	return nil
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

func SyncWithRemote(repoPath string) (SyncResult, error) {
	status, err := GetGitStatus(repoPath)
	if err != nil {
		return SyncResult{}, fmt.Errorf("failed to get git status before sync: %w", err)
	}

	if !status.HasUpstream {
		return SyncResult{}, nil
	}

	fetchOut, err := runGit(repoPath, "fetch", "--prune")
	if err != nil {
		return SyncResult{Output: strings.TrimSpace(fetchOut), Fetched: true}, fmt.Errorf("failed to fetch from remote: %w", err)
	}

	status, err = GetGitStatus(repoPath)
	if err != nil {
		return SyncResult{Output: strings.TrimSpace(fetchOut), Fetched: true}, fmt.Errorf("failed to refresh git status after fetch: %w", err)
	}

	if status.Behind == 0 {
		return SyncResult{
			Output:  strings.TrimSpace(fetchOut),
			Fetched: true,
			Pulled:  false,
		}, nil
	}

	pullOut, err := runGit(repoPath, "pull", "--rebase", "--autostash")
	if err != nil {
		return SyncResult{
			Output:  strings.TrimSpace(fetchOut + "\n" + pullOut),
			Fetched: true,
			Pulled:  true,
		}, fmt.Errorf("failed to pull remote changes before push: %w", err)
	}

	return SyncResult{
		Output:  strings.TrimSpace(fetchOut + "\n" + pullOut),
		Fetched: true,
		Pulled:  true,
	}, nil
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
