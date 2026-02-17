# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DiffDragon is a local web app for reviewing large git diffs. It parses git diffs, risk-scores and semantically groups files, optionally summarizes them with AI (Claude API or Ollama), and displays everything in a prioritized web UI.

## Build & Run Commands

```bash
# Build frontend + backend
cd frontend && pnpm build && cd .. && go build -o diffdragon .

# Run (production mode — serves embedded static assets)
go run . --base main --ai claude

# Run in dev mode (frontend hot-reload via Vite)
# Terminal 1: start Vite dev server
cd frontend && pnpm dev
# Terminal 2: start Go backend with --dev (proxies to Vite for HMR)
go run . --dev --base main

# Run tests
go test ./...
```

## Architecture

Single Go module (`diffdragon`, Go 1.21+) with zero external dependencies — everything uses the Go standard library.

**Source files (all in root package `main`):**

- `main.go` — Entry point, CLI flag parsing, `Config` struct, server startup. Validates git repo, loads env vars, orchestrates parse → analyze → serve pipeline.
- `git.go` — Executes `git diff` and parses output into `DiffData` / `DiffFile` / `DiffHunk` structs. Handles renames, language detection, line counting.
- `analysis.go` — Heuristic risk scoring (0-100) based on path patterns (security, crypto, DB, API, config, etc.) and diff characteristics. Semantic grouping into categories: test, docs, config, style, bugfix, feature, refactor.
- `ai.go` — `AIClient` abstraction over two backends: Anthropic Claude API (`claude-sonnet-4-20250514`) and Ollama. Methods: `SummarizeFile()`, `SummarizeHunk()`, `GenerateChecklist()`.
- `handlers.go` — HTTP handlers using `net/http` + `http.ServeMux`. `DiffHolder` provides mutex-protected diff data for concurrent access. Routes: `GET /` (embedded SPA), `GET /api/diff`, `GET /api/branches`, `POST /api/diff/reload`, `POST /api/summarize`, `POST /api/checklist`, `POST /api/summarize-all`.
- `frontend/` — React + TypeScript SPA built with Vite. Builds to `static/` which is embedded into the Go binary via `embed.FS`.

**Key data flow:** CLI flags → `ParseGitDiff()` → `AnalyzeDiff()` → start HTTP server → frontend fetches `/api/diff` → user triggers AI summaries on demand via POST endpoints.

## Environment Variables

- `ANTHROPIC_API_KEY` — Required when using `--ai claude`
- `OLLAMA_URL` — Override Ollama endpoint (default: `http://localhost:11434`)

## Key Design Decisions

- No external Go dependencies; standard library only
- Static assets embedded in binary via `embed.FS` (single binary distribution)
- AI summarization is on-demand per file/hunk, not automatic at startup
- `/api/summarize-all` uses goroutines with a semaphore for concurrency control (default 3, max 10)
- Risk scoring is purely heuristic (pattern matching on paths and diff content), not AI-driven
