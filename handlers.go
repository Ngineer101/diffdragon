package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strings"
	"sync"
)

// DiffHolder provides mutex-protected access to the current diff data,
// allowing it to be replaced at runtime when the user changes branches.
type DiffHolder struct {
	mu          sync.RWMutex
	data        *DiffData
	aiAnalyzing bool
	aiLastError string
}

func NewDiffHolder(data *DiffData) *DiffHolder {
	return &DiffHolder{data: data}
}

func (h *DiffHolder) Get() *DiffData {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.data
}

func (h *DiffHolder) Replace(data *DiffData) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.data = data
}

func (h *DiffHolder) SetAIAnalyzing(v bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.aiAnalyzing = v
}

func (h *DiffHolder) IsAIAnalyzing() bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.aiAnalyzing
}

func (h *DiffHolder) SetAILastError(err string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.aiLastError = strings.TrimSpace(err)
}

func (h *DiffHolder) GetAILastError() string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.aiLastError
}

// RegisterHandlers sets up all HTTP routes on the given mux.
// In dev mode, the "/" handler is NOT registered here — main.go sets up a Vite proxy instead.
func RegisterHandlers(mux *http.ServeMux, cfg *Config, holder *DiffHolder, repos *RepoManager, ai *AIClient) {
	buildDiffResponse := func(data *DiffData) map[string]interface{} {
		gitStatus := GitStatus{
			StagedFiles:   []string{},
			UnstagedFiles: []string{},
		}
		if repo, ok := repos.Current(); ok {
			status, err := GetGitStatus(repo.Path)
			if err == nil {
				gitStatus = status
			}
		}

		if data == nil {
			return map[string]interface{}{
				"baseRef":       "",
				"headRef":       "",
				"files":         []*DiffFile{},
				"aiProvider":    cfg.AIProvider,
				"stats":         computeStats(nil),
				"gitStatus":     gitStatus,
				"repos":         repos.List(),
				"currentRepoId": repos.CurrentID(),
				"aiAnalyzing":   holder.IsAIAnalyzing(),
				"aiError":       holder.GetAILastError(),
			}
		}

		return map[string]interface{}{
			"baseRef":       data.BaseRef,
			"headRef":       data.HeadRef,
			"files":         data.Files,
			"aiProvider":    cfg.AIProvider,
			"stats":         computeStats(data),
			"gitStatus":     gitStatus,
			"repos":         repos.List(),
			"currentRepoId": repos.CurrentID(),
			"aiAnalyzing":   holder.IsAIAnalyzing(),
			"aiError":       holder.GetAILastError(),
		}
	}

	reloadCurrentRepo := func() error {
		repo, ok := repos.Current()
		if !ok {
			holder.Replace(nil)
			return nil
		}

		cfg.RepoPath = repo.Path
		diffData, err := ParseGitDiff(cfg)
		if err != nil && !cfg.Staged && !cfg.Unstaged {
			cfg.Base = ResolveDefaultBaseRef(repo.Path)
			cfg.Head = "HEAD"
			diffData, err = ParseGitDiff(cfg)
		}
		if err != nil {
			return err
		}
		// Analyze with heuristics immediately for fast UI response
		AnalyzeDiffHeuristics(diffData)
		holder.Replace(diffData)
		// Enrich with AI in the background so repo switching isn't blocked
		if ai != nil {
			holder.SetAIAnalyzing(true)
			holder.SetAILastError("")
			go func() {
				AnalyzeDiffAI(diffData, ai, holder)
				holder.SetAIAnalyzing(false)
			}()
		}
		return nil
	}
	if !cfg.Dev {
		// Serve the embedded static frontend (production mode only)
		staticFS, err := fs.Sub(staticFiles, "static")
		if err != nil {
			log.Fatalf("Failed to set up static files: %v", err)
		}
		mux.Handle("/", spaHandler(staticFS))
	}

	// API: return the full diff data
	mux.HandleFunc("/api/diff", func(w http.ResponseWriter, r *http.Request) {
		data := holder.Get()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(data))
	})

	// API: list repositories and current selection
	mux.HandleFunc("/api/repos", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method == "GET" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"repos":         repos.List(),
				"currentRepoId": repos.CurrentID(),
			})
			return
		}

		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		var req struct {
			Path string `json:"path"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		repo, err := repos.Add(req.Path, req.Name)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if _, err := repos.Select(repo.ID); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to parse diff: %v", err), 500)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"repos":         repos.List(),
			"currentRepoId": repos.CurrentID(),
		})
	})

	// API: open a native folder picker and return selected path.
	mux.HandleFunc("/api/repos/pick", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		path, err := pickFolderPath()
		if err != nil {
			if err == errFolderPickerCanceled {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]string{"path": ""})
				return
			}
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"path": path})
	})

	// API: switch active repository
	mux.HandleFunc("/api/repos/select", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		var req struct {
			RepoID string `json:"repoId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		if _, err := repos.Select(req.RepoID); err != nil {
			http.Error(w, err.Error(), 404)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to parse diff: %v", err), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(holder.Get()))
	})

	// API: list all branches
	mux.HandleFunc("/api/branches", func(w http.ResponseWriter, r *http.Request) {
		repo, ok := repos.Current()
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"branches": []Branch{},
				"current":  "",
			})
			return
		}

		cfg.RepoPath = repo.Path
		branches, current, err := ListBranches(cfg.RepoPath)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"branches": branches,
			"current":  current,
		})
	})

	// API: open a GitHub PR into a worktree.
	mux.HandleFunc("/api/github/pr/open", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		var req struct {
			PR string `json:"pr"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		if strings.TrimSpace(req.PR) == "" {
			http.Error(w, "PR is required", 400)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		result, err := OpenGitHubPR(repo.Path, strings.TrimSpace(req.PR))
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})

	// API: close a GitHub PR worktree.
	mux.HandleFunc("/api/github/pr/close", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		var req struct {
			WorktreePath string `json:"worktreePath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		if err := CloseGitHubPR(repo.Path, req.WorktreePath); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})

	// API: reload diff with new refs
	mux.HandleFunc("/api/diff/reload", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		var req struct {
			Base     string `json:"base"`
			Head     string `json:"head"`
			Staged   *bool  `json:"staged"`
			Unstaged *bool  `json:"unstaged"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}
		cfg.RepoPath = repo.Path

		// Update config
		cfg.Staged = req.Staged != nil && *req.Staged
		cfg.Unstaged = req.Unstaged != nil && *req.Unstaged
		if !cfg.Staged && !cfg.Unstaged {
			if req.Base != "" {
				cfg.Base = req.Base
			}
			if req.Head != "" {
				cfg.Head = req.Head
			}
		}

		// Re-parse the diff
		diffData, err := ParseGitDiff(cfg)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to parse diff: %v", err), 500)
			return
		}
		// Analyze with heuristics immediately for fast response
		AnalyzeDiffHeuristics(diffData)
		holder.Replace(diffData)
		// Enrich with AI in the background
		if ai != nil {
			holder.SetAIAnalyzing(true)
			holder.SetAILastError("")
			go func() {
				AnalyzeDiffAI(diffData, ai, holder)
				holder.SetAIAnalyzing(false)
			}()
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(diffData))
	})

	// API: return git status for the selected repository.
	mux.HandleFunc("/api/git/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		status, err := GetGitStatus(repo.Path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	})

	// API: return Git AI notes for a file between base/head refs.
	mux.HandleFunc("/api/git-ai/file-notes", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		path := strings.TrimSpace(r.URL.Query().Get("path"))
		oldPath := strings.TrimSpace(r.URL.Query().Get("oldPath"))
		base := strings.TrimSpace(r.URL.Query().Get("base"))
		head := strings.TrimSpace(r.URL.Query().Get("head"))

		if path == "" {
			http.Error(w, "path is required", 400)
			return
		}
		if base == "" || head == "" {
			http.Error(w, "base and head are required", 400)
			return
		}

		items, err := GetGitAIFileNotes(repo.Path, base, head, path, oldPath)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"items": items,
		})
	})

	// API: return Git AI prompt details for a commit/prompt id.
	mux.HandleFunc("/api/git-ai/prompt", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		promptID := strings.TrimSpace(r.URL.Query().Get("promptId"))
		commit := strings.TrimSpace(r.URL.Query().Get("commit"))
		if promptID == "" {
			http.Error(w, "promptId is required", 400)
			return
		}
		if commit == "" {
			http.Error(w, "commit is required", 400)
			return
		}

		detail, err := GetGitAIPromptDetail(repo.Path, promptID, commit)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(detail)
	})

	// API: stage a full file path.
	mux.HandleFunc("/api/git/stage", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}
		if strings.TrimSpace(req.Path) == "" {
			http.Error(w, "Path is required", 400)
			return
		}

		if err := StageFile(repo.Path, req.Path); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to reload diff: %v", err), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(holder.Get()))
	})

	// API: unstage a full file path.
	mux.HandleFunc("/api/git/unstage", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}
		if strings.TrimSpace(req.Path) == "" {
			http.Error(w, "Path is required", 400)
			return
		}

		if err := UnstageFile(repo.Path, req.Path); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to reload diff: %v", err), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(holder.Get()))
	})

	// API: discard all staged/unstaged changes for a file path.
	mux.HandleFunc("/api/git/discard", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}
		if strings.TrimSpace(req.Path) == "" {
			http.Error(w, "Path is required", 400)
			return
		}

		if err := DiscardFileChanges(repo.Path, req.Path); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Failed to reload diff: %v", err), 500)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(holder.Get()))
	})

	// API: commit all staged changes and push.
	mux.HandleFunc("/api/git/commit-push", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		repo, ok := repos.Current()
		if !ok {
			http.Error(w, "No repository selected", 400)
			return
		}

		var req struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		message := strings.TrimSpace(req.Message)
		if message == "" {
			http.Error(w, "Commit message is required", 400)
			return
		}

		status, err := GetGitStatus(repo.Path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		if len(status.StagedFiles) == 0 {
			http.Error(w, "No staged files to commit", 400)
			return
		}

		commitOut, err := Commit(repo.Path, message)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		syncResult, err := SyncWithRemote(repo.Path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		status, err = GetGitStatus(repo.Path)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		pushOut, err := Push(repo.Path, status)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}

		if err := reloadCurrentRepo(); err != nil {
			http.Error(w, fmt.Sprintf("Commit pushed but failed to reload diff: %v", err), 500)
			return
		}

		newStatus, _ := GetGitStatus(repo.Path)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"ok":               true,
			"commitOutput":     strings.TrimSpace(commitOut),
			"syncOutput":       strings.TrimSpace(syncResult.Output),
			"pushOutput":       strings.TrimSpace(pushOut),
			"syncedWithRemote": syncResult.Fetched,
			"pulledBeforePush": syncResult.Pulled,
			"gitStatus":        newStatus,
			"diff":             buildDiffResponse(holder.Get()),
		})
	})
}

// spaHandler serves static files from the embedded FS, falling back to
// index.html for any path that doesn't match a real file (SPA routing).
func spaHandler(fsys fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(fsys))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to open the requested file
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Strip leading slash for fs.Open
		name := path[1:]
		if _, err := fs.Stat(fsys, name); err != nil {
			// File not found — serve index.html for client-side routing
			r.URL.Path = "/"
			fileServer.ServeHTTP(w, r)
			return
		}

		fileServer.ServeHTTP(w, r)
	})
}

// computeStats calculates aggregate statistics about the diff.
func computeStats(data *DiffData) map[string]interface{} {
	if data == nil {
		return map[string]interface{}{
			"totalFiles":   0,
			"totalAdded":   0,
			"totalRemoved": 0,
			"groupCounts":  map[string]int{},
			"riskDistribution": map[string]int{
				"high":   0,
				"medium": 0,
				"low":    0,
			},
		}
	}

	totalAdded := 0
	totalRemoved := 0
	groupCounts := make(map[string]int)
	riskDistribution := map[string]int{
		"high":   0, // 50+
		"medium": 0, // 20-49
		"low":    0, // 0-19
	}

	for _, f := range data.Files {
		totalAdded += f.LinesAdded
		totalRemoved += f.LinesRemoved
		groupCounts[f.SemanticGroup]++

		switch {
		case f.RiskScore >= 50:
			riskDistribution["high"]++
		case f.RiskScore >= 20:
			riskDistribution["medium"]++
		default:
			riskDistribution["low"]++
		}
	}

	return map[string]interface{}{
		"totalFiles":       len(data.Files),
		"totalAdded":       totalAdded,
		"totalRemoved":     totalRemoved,
		"groupCounts":      groupCounts,
		"riskDistribution": riskDistribution,
	}
}
