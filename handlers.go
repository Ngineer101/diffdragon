package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// DiffHolder provides mutex-protected access to the current diff data,
// allowing it to be replaced at runtime when the user changes branches.
type DiffHolder struct {
	mu   sync.RWMutex
	data *DiffData
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
		AnalyzeDiff(diffData)
		holder.Replace(diffData)
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
		AnalyzeDiff(diffData)
		holder.Replace(diffData)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(buildDiffResponse(diffData))
	})

	// API: summarize a specific file
	mux.HandleFunc("/api/summarize", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		if ai == nil {
			http.Error(w, "No AI provider configured", 400)
			return
		}

		var req struct {
			FileIndex int `json:"fileIndex"`
			HunkIndex int `json:"hunkIndex"` // -1 for file-level summary
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		data := holder.Get()
		if data == nil {
			http.Error(w, "No repository selected", 400)
			return
		}
		if req.FileIndex < 0 || req.FileIndex >= len(data.Files) {
			http.Error(w, "File index out of range", 400)
			return
		}

		file := data.Files[req.FileIndex]
		w.Header().Set("Content-Type", "application/json")

		if req.HunkIndex == -1 {
			// File-level summary
			summary, err := ai.SummarizeFile(file)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			file.Summary = summary
			json.NewEncoder(w).Encode(map[string]string{"summary": summary})
		} else {
			// Hunk-level summary
			if req.HunkIndex < 0 || req.HunkIndex >= len(file.Hunks) {
				http.Error(w, "Hunk index out of range", 400)
				return
			}
			hunk := file.Hunks[req.HunkIndex]
			summary, err := ai.SummarizeHunk(file, hunk)
			if err != nil {
				json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
				return
			}
			hunk.Summary = summary
			json.NewEncoder(w).Encode(map[string]string{"summary": summary})
		}
	})

	// API: generate review checklist for a file
	mux.HandleFunc("/api/checklist", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		if ai == nil {
			http.Error(w, "No AI provider configured", 400)
			return
		}

		var req struct {
			FileIndex int `json:"fileIndex"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", 400)
			return
		}

		data := holder.Get()
		if data == nil {
			http.Error(w, "No repository selected", 400)
			return
		}
		if req.FileIndex < 0 || req.FileIndex >= len(data.Files) {
			http.Error(w, "File index out of range", 400)
			return
		}

		file := data.Files[req.FileIndex]
		checklist, err := ai.GenerateChecklist(file)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}

		file.Checklist = checklist
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"checklist": checklist})
	})

	// API: summarize all files (runs concurrently with rate limiting)
	mux.HandleFunc("/api/summarize-all", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}

		if ai == nil {
			http.Error(w, "No AI provider configured", 400)
			return
		}

		// Parse optional concurrency limit
		concurrency := 3
		if c := r.URL.Query().Get("concurrency"); c != "" {
			if parsed, err := strconv.Atoi(c); err == nil && parsed > 0 && parsed <= 10 {
				concurrency = parsed
			}
		}

		data := holder.Get()
		if data == nil {
			http.Error(w, "No repository selected", 400)
			return
		}

		// Run summarization concurrently
		var wg sync.WaitGroup
		sem := make(chan struct{}, concurrency)
		errors := make([]string, 0)
		var mu sync.Mutex

		for i, file := range data.Files {
			if file.Summary != "" {
				continue // Already summarized
			}

			wg.Add(1)
			sem <- struct{}{} // Acquire semaphore

			go func(idx int, f *DiffFile) {
				defer wg.Done()
				defer func() { <-sem }() // Release semaphore

				summary, err := ai.SummarizeFile(f)
				mu.Lock()
				defer mu.Unlock()

				if err != nil {
					errors = append(errors, fmt.Sprintf("%s: %s", f.Path, err.Error()))
				} else {
					f.Summary = summary
				}
			}(i, file)
		}

		wg.Wait()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"completed": true,
			"errors":    errors,
			"files":     data.Files,
		})
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
			"ok":           true,
			"commitOutput": strings.TrimSpace(commitOut),
			"pushOutput":   strings.TrimSpace(pushOut),
			"gitStatus":    newStatus,
			"diff":         buildDiffResponse(holder.Get()),
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
