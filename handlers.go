package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"sync"
)

// RegisterHandlers sets up all HTTP routes on the given mux.
func RegisterHandlers(mux *http.ServeMux, cfg *Config, data *DiffData, ai *AIClient) {
	// Serve the embedded static frontend
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatalf("Failed to set up static files: %v", err)
	}
	mux.Handle("/", spaHandler(staticFS))

	// API: return the full diff data
	mux.HandleFunc("/api/diff", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		response := map[string]interface{}{
			"baseRef":    data.BaseRef,
			"headRef":    data.HeadRef,
			"files":      data.Files,
			"aiProvider": cfg.AIProvider,
			"stats":      computeStats(data),
		}

		json.NewEncoder(w).Encode(response)
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
