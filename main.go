package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

//go:embed all:static
var staticFiles embed.FS

// Config holds all application configuration parsed from CLI flags and env vars.
type Config struct {
	RepoPath    string
	Base        string
	Head        string
	Staged      bool
	Unstaged    bool
	Port        int
	AIProvider  string // "none", "claude", "ollama"
	OllamaModel string
	OllamaURL   string
	AnthropicKey string
}

func main() {
	cfg := parseFlags()

	// Resolve repo path to absolute
	absRepo, err := filepath.Abs(cfg.RepoPath)
	if err != nil {
		log.Fatalf("Failed to resolve repo path: %v", err)
	}
	cfg.RepoPath = absRepo

	// Validate the repo path contains a .git directory
	if _, err := os.Stat(filepath.Join(absRepo, ".git")); os.IsNotExist(err) {
		log.Fatalf("Not a git repository: %s", absRepo)
	}

	// Pick up API key from environment if not empty
	if cfg.AnthropicKey == "" {
		cfg.AnthropicKey = os.Getenv("ANTHROPIC_API_KEY")
	}
	if envURL := os.Getenv("OLLAMA_URL"); envURL != "" && cfg.OllamaURL == "http://localhost:11434" {
		cfg.OllamaURL = envURL
	}

	// Warn if claude provider is selected but no key is set
	if cfg.AIProvider == "claude" && cfg.AnthropicKey == "" {
		log.Println("WARNING: --ai=claude selected but ANTHROPIC_API_KEY is not set. AI features will fail.")
	}

	// Parse the diff upfront so we can report errors immediately
	diffData, err := ParseGitDiff(cfg)
	if err != nil {
		log.Fatalf("Failed to parse git diff: %v", err)
	}

	// Analyze: risk scoring + semantic grouping
	AnalyzeDiff(diffData)

	// Create the AI client (may be nil if provider is "none")
	aiClient := NewAIClient(cfg)

	// Set up HTTP routes
	mux := http.NewServeMux()
	RegisterHandlers(mux, cfg, diffData, aiClient)

	addr := fmt.Sprintf("127.0.0.1:%d", cfg.Port)
	fmt.Printf("\n  🧭 DiffPilot is running at http://%s\n", addr)
	fmt.Printf("  📂 Repository: %s\n", cfg.RepoPath)
	fmt.Printf("  📊 Files changed: %d\n", len(diffData.Files))
	fmt.Printf("  🤖 AI Provider: %s\n\n", cfg.AIProvider)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func parseFlags() *Config {
	cfg := &Config{}

	flag.StringVar(&cfg.RepoPath, "repo", ".", "Path to the git repository")
	flag.StringVar(&cfg.Base, "base", "main", "Base ref to diff against")
	flag.StringVar(&cfg.Head, "head", "HEAD", "Head ref to diff")
	flag.BoolVar(&cfg.Staged, "staged", false, "Review staged changes only")
	flag.BoolVar(&cfg.Unstaged, "unstaged", false, "Review unstaged (working dir) changes")
	flag.IntVar(&cfg.Port, "port", 8384, "Port for the local web server")
	flag.StringVar(&cfg.AIProvider, "ai", "none", "AI provider: none, claude, ollama")
	flag.StringVar(&cfg.OllamaModel, "ollama-model", "llama3.1", "Ollama model name")
	flag.StringVar(&cfg.OllamaURL, "ollama-url", "http://localhost:11434", "Ollama API endpoint")

	flag.Parse()
	return cfg
}
