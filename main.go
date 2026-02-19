package main

import (
	"embed"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
)

//go:embed all:static
var staticFiles embed.FS

// Config holds all application configuration parsed from CLI flags and env vars.
type Config struct {
	RepoPath       string
	Base           string
	Head           string
	Staged         bool
	Unstaged       bool
	Port           int
	AIProvider     string // "none", "claude", "ollama", "lmstudio"
	OllamaModel    string
	OllamaURL      string
	LMStudioModel  string
	LMStudioURL    string
	LMStudioAPIKey string
	AnthropicKey   string
	Dev            bool   // Dev mode: proxy static files to Vite dev server
	ViteURL        string // Vite dev server URL (default http://localhost:5173)
}

func main() {
	cfg := parseFlags()
	repoManager := NewRepoManager()

	// Choose initial repository:
	// 1) --repo value (if provided), 2) persisted current repo, 3) cwd if it is a repo.
	if cfg.RepoPath != "" {
		initialRepo, err := filepath.Abs(cfg.RepoPath)
		if err != nil {
			log.Fatalf("Failed to resolve repo path: %v", err)
		}
		repo, addErr := repoManager.Add(initialRepo, "")
		if addErr != nil {
			log.Fatalf("Invalid repository path: %v", addErr)
		}
		if _, err := repoManager.Select(repo.ID); err != nil {
			log.Fatalf("Failed to select repository: %v", err)
		}
		cfg.RepoPath = repo.Path
	} else if currentRepo, ok := repoManager.Current(); ok {
		cfg.RepoPath = currentRepo.Path
	} else {
		cwd, err := filepath.Abs(".")
		if err != nil {
			log.Fatalf("Failed to resolve current directory: %v", err)
		}
		if repo, addErr := repoManager.Add(cwd, ""); addErr == nil {
			cfg.RepoPath = repo.Path
		} else {
			cfg.RepoPath = ""
			log.Println("No git repository selected. Add repositories in the UI.")
		}
	}

	// Pick up API key from environment if not empty
	if cfg.AnthropicKey == "" {
		cfg.AnthropicKey = os.Getenv("ANTHROPIC_API_KEY")
	}
	if envURL := os.Getenv("OLLAMA_URL"); envURL != "" && cfg.OllamaURL == "http://localhost:11434" {
		cfg.OllamaURL = envURL
	}
	if envURL := os.Getenv("LMSTUDIO_URL"); envURL != "" && cfg.LMStudioURL == "http://localhost:1234/v1" {
		cfg.LMStudioURL = envURL
	}
	if envModel := os.Getenv("LMSTUDIO_MODEL"); envModel != "" && cfg.LMStudioModel == "local-model" {
		cfg.LMStudioModel = envModel
	}
	if cfg.LMStudioAPIKey == "" {
		cfg.LMStudioAPIKey = os.Getenv("LMSTUDIO_API_KEY")
	}

	// Warn if claude provider is selected but no key is set
	if cfg.AIProvider == "claude" && cfg.AnthropicKey == "" {
		log.Println("WARNING: --ai=claude selected but ANTHROPIC_API_KEY is not set. AI features will fail.")
	}
	if cfg.AIProvider == "lmstudio" && cfg.LMStudioModel == "" {
		log.Println("WARNING: --ai=lmstudio selected but no model was configured. AI features may fail.")
	}

	// Create the AI client (may be nil if provider is "none")
	aiClient := NewAIClient(cfg)

	var diffData *DiffData
	if cfg.RepoPath != "" {
		parsedDiff, err := ParseGitDiff(cfg)
		if err != nil && !cfg.Staged && !cfg.Unstaged {
			cfg.Base = ResolveDefaultBaseRef(cfg.RepoPath)
			cfg.Head = "HEAD"
			parsedDiff, err = ParseGitDiff(cfg)
		}
		if err != nil {
			log.Fatalf("Failed to parse git diff: %v", err)
		}
		diffData = parsedDiff
		AnalyzeDiff(diffData, aiClient)
	}

	// Wrap diff data in a mutex-protected holder for dynamic reloading
	holder := NewDiffHolder(diffData)

	// Set up HTTP routes
	mux := http.NewServeMux()
	RegisterHandlers(mux, cfg, holder, repoManager, aiClient)

	// In dev mode, proxy non-API requests to Vite dev server for HMR
	if cfg.Dev {
		viteTarget, err := url.Parse(cfg.ViteURL)
		if err != nil {
			log.Fatalf("Invalid vite-url: %v", err)
		}
		viteProxy := httputil.NewSingleHostReverseProxy(viteTarget)
		mux.Handle("/", viteProxy)
	}

	addr := fmt.Sprintf("127.0.0.1:%d", cfg.Port)
	fmt.Printf("\n  🧭 DiffDragon is running at http://%s\n", addr)
	if cfg.RepoPath != "" {
		fmt.Printf("  📂 Repository: %s\n", cfg.RepoPath)
		fmt.Printf("  📊 Files changed: %d\n", len(diffData.Files))
	} else {
		fmt.Printf("  📂 Repository: none selected\n")
		fmt.Printf("  📊 Files changed: 0\n")
	}
	fmt.Printf("  🤖 AI Provider: %s\n", cfg.AIProvider)
	if cfg.Dev {
		fmt.Printf("  🔧 Dev mode: proxying to Vite at %s\n", cfg.ViteURL)
	}
	fmt.Println()

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func parseFlags() *Config {
	cfg := &Config{}
	portExplicit := false

	flag.StringVar(&cfg.RepoPath, "repo", "", "Optional initial git repository path")
	flag.StringVar(&cfg.Base, "base", "main", "Base ref to diff against")
	flag.StringVar(&cfg.Head, "head", "HEAD", "Head ref to diff")
	flag.IntVar(&cfg.Port, "port", 8384, "Port for the local web server")
	flag.StringVar(&cfg.AIProvider, "ai", "none", "AI provider: none, claude, ollama, lmstudio")
	flag.StringVar(&cfg.OllamaModel, "ollama-model", "llama3.1", "Ollama model name")
	flag.StringVar(&cfg.OllamaURL, "ollama-url", "http://localhost:11434", "Ollama API endpoint")
	flag.StringVar(&cfg.LMStudioModel, "lmstudio-model", "local-model", "LM Studio model name")
	flag.StringVar(&cfg.LMStudioURL, "lmstudio-url", "http://localhost:1234/v1", "LM Studio OpenAI-compatible endpoint")
	flag.BoolVar(&cfg.Dev, "dev", false, "Dev mode: proxy static files to Vite dev server for HMR")
	flag.StringVar(&cfg.ViteURL, "vite-url", "http://localhost:5173", "Vite dev server URL (used with --dev)")

	flag.Parse()
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "port" {
			portExplicit = true
		}
	})

	if cfg.Dev && !portExplicit {
		cfg.Port = 8385
	}

	return cfg
}
