package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

type Repo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"path"`
}

type RepoManager struct {
	mu            sync.RWMutex
	repos         []Repo
	currentRepoID string
	storePath     string
}

func NewRepoManager() *RepoManager {
	manager := &RepoManager{repos: []Repo{}, storePath: defaultRepoStorePath()}
	manager.load()
	return manager
}

func (m *RepoManager) Add(path string, name string) (Repo, error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return Repo{}, fmt.Errorf("failed to resolve repository path: %w", err)
	}

	if err := validateGitRepo(absPath); err != nil {
		return Repo{}, err
	}

	if name == "" {
		name = filepath.Base(absPath)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	for _, repo := range m.repos {
		if repo.Path == absPath {
			if m.currentRepoID == "" {
				m.currentRepoID = repo.ID
			}
			return repo, nil
		}
	}

	repo := Repo{
		ID:   absPath,
		Name: name,
		Path: absPath,
	}
	m.repos = append(m.repos, repo)
	if m.currentRepoID == "" {
		m.currentRepoID = repo.ID
	}
	m.persist()

	return repo, nil
}

func (m *RepoManager) List() []Repo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	repos := make([]Repo, len(m.repos))
	copy(repos, m.repos)
	return repos
}

func (m *RepoManager) CurrentID() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.currentRepoID
}

func (m *RepoManager) Select(repoID string) (Repo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, repo := range m.repos {
		if repo.ID == repoID {
			m.currentRepoID = repo.ID
			m.persist()
			return repo, nil
		}
	}

	return Repo{}, fmt.Errorf("repository not found")
}

func (m *RepoManager) Current() (Repo, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.currentRepoID == "" {
		return Repo{}, false
	}

	for _, repo := range m.repos {
		if repo.ID == m.currentRepoID {
			return repo, true
		}
	}

	return Repo{}, false
}

func validateGitRepo(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("repository path does not exist: %s", path)
	}

	cmd := exec.Command("git", "rev-parse", "--git-dir")
	cmd.Dir = path
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("not a git repository: %s", path)
	}

	return nil
}

func (m *RepoManager) load() {
	if m.storePath == "" {
		return
	}

	bytes, err := os.ReadFile(m.storePath)
	if err != nil {
		return
	}

	var stored struct {
		Repos         []Repo `json:"repos"`
		CurrentRepoID string `json:"currentRepoId"`
	}
	if err := json.Unmarshal(bytes, &stored); err != nil {
		return
	}

	valid := make([]Repo, 0, len(stored.Repos))
	for _, repo := range stored.Repos {
		if err := validateGitRepo(repo.Path); err == nil {
			valid = append(valid, repo)
		}
	}

	m.repos = valid
	if stored.CurrentRepoID != "" {
		for _, repo := range valid {
			if repo.ID == stored.CurrentRepoID {
				m.currentRepoID = stored.CurrentRepoID
				return
			}
		}
	}

	if len(valid) > 0 {
		m.currentRepoID = valid[0].ID
	}
}

func (m *RepoManager) persist() {
	if m.storePath == "" {
		return
	}

	data := struct {
		Repos         []Repo `json:"repos"`
		CurrentRepoID string `json:"currentRepoId"`
	}{
		Repos:         m.repos,
		CurrentRepoID: m.currentRepoID,
	}

	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return
	}

	if err := os.MkdirAll(filepath.Dir(m.storePath), 0o755); err != nil {
		return
	}

	_ = os.WriteFile(m.storePath, bytes, 0o644)
}

func defaultRepoStorePath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return ""
	}

	return filepath.Join(configDir, "diffdragon", "repos.json")
}
