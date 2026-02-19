package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type GitHubRepository struct {
	Name  string `json:"name"`
	Owner struct {
		Login string `json:"login"`
	} `json:"owner"`
	SSHUrl string `json:"sshUrl"`
}

type GitHubPRInfo struct {
	Number            int              `json:"number"`
	HeadRefName       string           `json:"headRefName"`
	BaseRefName       string           `json:"baseRefName"`
	HeadRepository    GitHubRepository `json:"headRepository"`
	IsCrossRepository bool             `json:"isCrossRepository"`
	HeadRefOid        string           `json:"headRefOid"`
	BaseRefOid        string           `json:"baseRefOid"`
}

type GitHubPROpenResult struct {
	WorktreePath string `json:"worktreePath"`
	PRNumber     int    `json:"prNumber"`
	BaseOid      string `json:"baseOid"`
	HeadOid      string `json:"headOid"`
	MergeBaseOid string `json:"mergeBaseOid"`
}

func OpenGitHubPR(repoPath string, pr string) (GitHubPROpenResult, error) {
	info, err := getGitHubPRInfo(repoPath, pr)
	if err != nil {
		return GitHubPROpenResult{}, err
	}

	owner, name := repoOwnerAndName(info.HeadRepository)
	if owner == "" || name == "" {
		owner, name, err = originRepoOwnerAndName(repoPath)
		if err != nil {
			return GitHubPROpenResult{}, err
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return GitHubPROpenResult{}, fmt.Errorf("failed to resolve home directory: %w", err)
	}

	worktreePath := filepath.Join(home, ".diffdragon", "worktrees", owner, name, fmt.Sprintf("pr-%d", info.Number))
	if err := removeExistingWorktree(repoPath, worktreePath); err != nil {
		return GitHubPROpenResult{}, err
	}

	if err := os.MkdirAll(filepath.Dir(worktreePath), 0o755); err != nil {
		return GitHubPROpenResult{}, fmt.Errorf("failed to create worktree directory: %w", err)
	}

	if err := fetchPROids(repoPath, info); err != nil {
		return GitHubPROpenResult{}, err
	}

	if _, err := runGit(repoPath, "worktree", "add", "--detach", worktreePath, info.HeadRefOid); err != nil {
		return GitHubPROpenResult{}, fmt.Errorf("failed to add worktree: %w", err)
	}

	mergeBaseOut, err := runGit(repoPath, "merge-base", info.BaseRefOid, info.HeadRefOid)
	if err != nil {
		return GitHubPROpenResult{}, fmt.Errorf("failed to compute merge base: %w", err)
	}

	return GitHubPROpenResult{
		WorktreePath: worktreePath,
		PRNumber:     info.Number,
		BaseOid:      info.BaseRefOid,
		HeadOid:      info.HeadRefOid,
		MergeBaseOid: strings.TrimSpace(mergeBaseOut),
	}, nil
}

func CloseGitHubPR(repoPath string, worktreePath string) error {
	worktreePath = strings.TrimSpace(worktreePath)
	if worktreePath == "" {
		return fmt.Errorf("worktree path is required")
	}

	if _, err := os.Stat(worktreePath); err != nil {
		if os.IsNotExist(err) {
			_, _ = runGit(repoPath, "worktree", "prune")
			return nil
		}
		return fmt.Errorf("failed to stat worktree path: %w", err)
	}

	if _, err := runGit(repoPath, "worktree", "remove", "--force", worktreePath); err != nil {
		return fmt.Errorf("failed to remove worktree: %w", err)
	}

	_ = os.RemoveAll(worktreePath)
	if _, err := runGit(repoPath, "worktree", "prune"); err != nil {
		return fmt.Errorf("failed to prune worktrees: %w", err)
	}

	return nil
}

func getGitHubPRInfo(repoPath string, pr string) (GitHubPRInfo, error) {
	out, err := runGH(repoPath, "pr", "view", pr, "--json", "number,headRefName,baseRefName,headRepository,isCrossRepository,headRefOid,baseRefOid")
	if err != nil {
		return GitHubPRInfo{}, err
	}

	var info GitHubPRInfo
	if err := json.Unmarshal([]byte(out), &info); err != nil {
		return GitHubPRInfo{}, fmt.Errorf("failed to parse gh output: %w", err)
	}
	if info.Number == 0 {
		return GitHubPRInfo{}, fmt.Errorf("invalid PR number from gh output")
	}
	if info.HeadRefOid == "" || info.BaseRefOid == "" {
		return GitHubPRInfo{}, fmt.Errorf("missing base/head oid in gh output")
	}
	return info, nil
}

func runGH(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("gh", args...)
	cmd.Dir = repoPath
	out, err := cmd.CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("gh %s failed: %w\n%s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func repoOwnerAndName(repo GitHubRepository) (string, string) {
	return strings.TrimSpace(repo.Owner.Login), strings.TrimSpace(repo.Name)
}

func originRepoOwnerAndName(repoPath string) (string, string, error) {
	url, err := runGit(repoPath, "remote", "get-url", "origin")
	if err != nil {
		return "", "", fmt.Errorf("missing repository owner/name from GitHub response and failed to read origin remote: %w", err)
	}

	owner, name := parseGitHubRepoURL(strings.TrimSpace(url))
	if owner == "" || name == "" {
		return "", "", fmt.Errorf("missing repository owner/name from GitHub response and failed to parse origin remote URL")
	}
	return owner, name, nil
}

func parseGitHubRepoURL(url string) (string, string) {
	url = strings.TrimSuffix(strings.TrimSpace(url), ".git")
	if url == "" {
		return "", ""
	}

	if strings.HasPrefix(url, "git@github.com:") {
		path := strings.TrimPrefix(url, "git@github.com:")
		parts := strings.Split(path, "/")
		if len(parts) == 2 {
			return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		}
		return "", ""
	}

	if strings.HasPrefix(url, "https://github.com/") {
		path := strings.TrimPrefix(url, "https://github.com/")
		parts := strings.Split(path, "/")
		if len(parts) >= 2 {
			return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		}
		return "", ""
	}

	if strings.HasPrefix(url, "ssh://git@github.com/") {
		path := strings.TrimPrefix(url, "ssh://git@github.com/")
		parts := strings.Split(path, "/")
		if len(parts) >= 2 {
			return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		}
		return "", ""
	}

	return "", ""
}

func fetchPROids(repoPath string, info GitHubPRInfo) error {
	if _, err := runGit(repoPath, "fetch", "origin", info.BaseRefOid); err != nil {
		return fmt.Errorf("failed to fetch base oid: %w", err)
	}

	if _, err := runGit(repoPath, "fetch", "origin", info.HeadRefOid); err == nil {
		return nil
	}

	pullRef := fmt.Sprintf("pull/%d/head", info.Number)
	if _, err := runGit(repoPath, "fetch", "origin", pullRef); err == nil {
		return nil
	}

	if !info.IsCrossRepository {
		return fmt.Errorf("failed to fetch head oid from origin")
	}

	remoteName := fmt.Sprintf("diffdragon-pr-%d", info.Number)
	url := strings.TrimSpace(info.HeadRepository.SSHUrl)
	if url == "" {
		owner, name := repoOwnerAndName(info.HeadRepository)
		if owner == "" || name == "" {
			return fmt.Errorf("missing head repository URL")
		}
		url = fmt.Sprintf("https://github.com/%s/%s.git", owner, name)
	}

	if err := ensureRemote(repoPath, remoteName, url); err != nil {
		return err
	}
	if _, err := runGit(repoPath, "fetch", remoteName, info.HeadRefOid); err != nil {
		return fmt.Errorf("failed to fetch head oid from %s: %w", remoteName, err)
	}
	return nil
}

func ensureRemote(repoPath string, name string, url string) error {
	out, err := runGit(repoPath, "remote", "get-url", name)
	if err != nil {
		if _, addErr := runGit(repoPath, "remote", "add", name, url); addErr != nil {
			return fmt.Errorf("failed to add remote %s: %w", name, addErr)
		}
		return nil
	}

	if strings.TrimSpace(out) != url {
		if _, setErr := runGit(repoPath, "remote", "set-url", name, url); setErr != nil {
			return fmt.Errorf("failed to update remote %s: %w", name, setErr)
		}
	}
	return nil
}

func removeExistingWorktree(repoPath string, worktreePath string) error {
	if _, err := os.Stat(worktreePath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to stat worktree path: %w", err)
	}

	if _, err := runGit(repoPath, "worktree", "remove", "--force", worktreePath); err != nil {
		return fmt.Errorf("failed to remove existing worktree: %w", err)
	}

	if err := os.RemoveAll(worktreePath); err != nil {
		return fmt.Errorf("failed to delete existing worktree directory: %w", err)
	}

	if _, err := runGit(repoPath, "worktree", "prune"); err != nil {
		return fmt.Errorf("failed to prune worktrees: %w", err)
	}

	return nil
}
