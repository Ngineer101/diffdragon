# DiffDragon

**A local web app for intelligently reviewing large git diffs — built for the age of AI-generated code.**

DiffDragon transforms overwhelming git diffs into prioritized, summarized, and semantically grouped review sessions. Instead of scrolling through hundreds of changed files line-by-line, you get an intelligent triage system that surfaces what matters most.

## Features

### Risk-Prioritized File List
Files are automatically scored and sorted by review priority based on heuristics:
- Security-sensitive paths (auth, crypto, permissions)
- Database/migration changes
- Public API surface modifications
- Error handling removals
- Configuration changes
- Size and complexity of changes

### AI Summaries Per File & Hunk
Each file and diff hunk gets a concise natural language summary explaining *what changed and why it matters*. Supports two AI backends:
- **Anthropic Claude API** — high-quality summaries via the Claude API
- **Ollama (local)** — fully offline summaries using any local model

### Collapsible Semantic Grouping
Files are grouped by intent rather than directory structure:
- `feature` — new functionality
- `refactor` — restructuring without behavior change
- `bugfix` — bug fixes
- `test` — test additions/modifications
- `config` — configuration and build changes
- `docs` — documentation updates
- `style` — formatting, whitespace, naming

### Review Checklist Generation
AI generates context-aware review checklists per file based on the actual changes:
- SQL injection checks for database code
- Auth middleware verification for new endpoints
- Error handling coverage
- Input validation reminders

## Prerequisites

- **Go 1.21+** — [Install Go](https://go.dev/dl/)
- **Node.js 18+** and **pnpm** — for building the frontend
- **Git** — must be available on your PATH
- **Anthropic API Key** (optional) — for Claude-powered summaries. Get one at [console.anthropic.com](https://console.anthropic.com)
- **Ollama** (optional) — for local AI summaries. Install from [ollama.com](https://ollama.com)

## Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd diffdragon

# Build (frontend + Go binary)
make build
```

This builds the React frontend into `static/`, then compiles a single Go binary with everything embedded. No runtime dependencies needed — the binary is fully self-contained.

## Usage

### Basic — Review branch diff against main

```bash
./diffdragon --repo /path/to/your/repo --base main
```

Then open **http://127.0.0.1:8384** in your browser.

### With Claude AI summaries

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./diffdragon --repo /path/to/your/repo --base main --ai claude
```

### With Ollama (local AI)

```bash
# Make sure Ollama is running with a model pulled
ollama pull llama3.1
./diffdragon --repo /path/to/your/repo --base main --ai ollama --ollama-model llama3.1
```

### With LM Studio (local AI, OpenAI-compatible server)

```bash
# In LM Studio, load your model and start local server first
export LMSTUDIO_URL=http://127.0.0.1:1234/v1
export LMSTUDIO_MODEL=your-loaded-model-id
./diffdragon --repo /path/to/your/repo --base main --ai lmstudio
```

### Compare specific refs

```bash
./diffdragon --repo /path/to/your/repo --base main --head feature/my-branch
```

### Review staged changes

```bash
./diffdragon --repo /path/to/your/repo --staged
```

### Review unstaged changes (working directory)

```bash
./diffdragon --repo /path/to/your/repo --unstaged
```

### Custom port

```bash
./diffdragon --repo /path/to/your/repo --base main --port 9090
```

## Install Once and Run Anywhere

Yes, this is possible.

DiffDragon builds to a single self-contained binary, so you can:
1. clone and build once,
2. move/copy the binary to a folder on your `PATH`,
3. run it from any terminal, and
4. optionally register it as a background service so it keeps running without an open terminal.

### 1) Build once

```bash
git clone <your-repo-url>
cd diffdragon
make build
```

This produces a `diffdragon` binary in the repo root.

### 2) Add to PATH

#### macOS / Linux

```bash
sudo install -m 755 ./diffdragon /usr/local/bin/diffdragon
```

Now you can run:

```bash
diffdragon
```

#### Windows (PowerShell)

1. Build `diffdragon.exe`
2. Copy it to a stable folder, for example `C:\Tools\diffdragon\diffdragon.exe`
3. Add `C:\Tools\diffdragon` to your User PATH

Then open a new terminal and run:

```powershell
diffdragon.exe
```

### 3) Run as a local background service (no terminal required)

You can host DiffDragon as a local service on any PC.

#### macOS (launchd)

Create `~/Library/LaunchAgents/com.diffdragon.app.plist` pointing to:
- executable: `/usr/local/bin/diffdragon`
- args: `--port 8384` (and any other flags you want)

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.diffdragon.app.plist
```

#### Linux (systemd --user)

Create `~/.config/systemd/user/diffdragon.service` with:

```ini
[Unit]
Description=DiffDragon local service

[Service]
ExecStart=/usr/local/bin/diffdragon --port 8384
Restart=on-failure

[Install]
WantedBy=default.target
```

Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable --now diffdragon
```

Single-command install/setup/update for LM Studio service (installs binary, launcher, user service, enables + starts it):

```bash
make release-service-update
```

Before starting, create your LM Studio config file at `~/.config/diffdragon/lmstudio.env` (not generated by Make):

```bash
LMSTUDIO_URL=http://127.0.0.1:1234/v1
LMSTUDIO_MODEL=your-loaded-model-id
# optional:
# LMSTUDIO_API_KEY=
# DIFFDRAGON_REPO=/path/to/repo
# DIFFDRAGON_BASE=main
# DIFFDRAGON_PORT=8384
```

Run again any time to update/reinstall and restart with the latest build:

```bash
make release-service-update
```

If your service name differs, override it:

```bash
make release-service-update SERVICE=diffdragon
```

#### Windows (Task Scheduler)

Use Task Scheduler to create a task that starts `diffdragon.exe` at login.
Run whether user is logged in or not if you want it always available.

After setup, open `http://127.0.0.1:8384` in your browser.

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--repo` | *(empty)* | Optional initial git repository path |
| `--base` | `main` | Base ref to diff against |
| `--head` | `HEAD` | Head ref to diff |
| `--staged` | `false` | Review staged changes only |
| `--unstaged` | `false` | Review unstaged (working dir) changes |
| `--port` | `8384` | Port for the local web server |
| `--ai` | `none` | AI provider: `none`, `claude`, `ollama`, `lmstudio` |
| `--ollama-model` | `llama3.1` | Ollama model to use |
| `--ollama-url` | `http://localhost:11434` | Ollama API endpoint |
| `--lmstudio-model` | `local-model` | LM Studio model ID to use |
| `--lmstudio-url` | `http://localhost:1234/v1` | LM Studio OpenAI-compatible endpoint |
| `--dev` | `false` | Dev mode: proxy static files to Vite dev server |
| `--vite-url` | `http://localhost:5173` | Vite dev server URL (used with `--dev`) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Claude-powered summaries |
| `OLLAMA_URL` | Override Ollama endpoint (default: `http://localhost:11434`) |
| `LMSTUDIO_URL` | Override LM Studio endpoint (default: `http://localhost:1234/v1`) |
| `LMSTUDIO_MODEL` | LM Studio model ID to use |
| `LMSTUDIO_API_KEY` | Optional API key for LM Studio server |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `ArrowDown` | Next file |
| `k` / `ArrowUp` | Previous file |
| `r` | Toggle file as reviewed |
| `/` | Focus search input |

## Development

Run the frontend dev server and Go backend in two separate terminals:

```bash
# Terminal 1: Frontend with hot reload (proxies /api to Go backend)
make dev-frontend

# Terminal 2: Go backend
make dev-backend
```

The frontend dev server runs on `http://localhost:5173` with HMR and proxies all `/api` requests to the Go backend on `:8384`.

Other useful commands:

```bash
# Full production build
make build

# Run Go tests
go test ./...

# Clean build artifacts
make clean
```

## Architecture

```
diffdragon/
├── main.go              # Entry point, CLI flags, server startup
├── git.go               # Git diff parsing and file extraction
├── analysis.go          # Risk scoring and semantic grouping
├── ai.go                # AI provider abstraction (Claude + Ollama)
├── handlers.go          # HTTP API handlers + SPA fallback
├── go.mod               # Go module definition
├── Makefile             # Build automation
├── frontend/            # React + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── components/  # React components (shadcn/ui)
│   │   ├── stores/      # Zustand state management
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # API client and utilities
│   │   └── types/       # TypeScript interfaces
│   ├── package.json
│   └── vite.config.ts
├── static/              # Built frontend output (embedded in binary)
└── README.md
```

### How It Works

1. **Parse** — Runs `git diff` on your repo and parses it into structured file/hunk data
2. **Analyze** — Each file is risk-scored (0-100) and semantically categorized using pattern matching heuristics
3. **Serve** — Starts a local HTTP server with the React SPA and JSON API endpoints
4. **Review** — The frontend renders files in a prioritized, collapsible interface with diff viewer
5. **Summarize** — If an AI provider is configured, files can be summarized on-demand via the UI

### Tech Stack

- **Backend:** Go standard library only (zero external Go dependencies)
- **Frontend:** React + TypeScript, Vite, shadcn/ui, Tailwind CSS, Zustand, Lucide icons
- **Fonts:** DM Sans (UI) and JetBrains Mono (code), bundled via `@fontsource` for offline use
- **Distribution:** Single binary with embedded frontend via `embed.FS`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the React SPA |
| `GET` | `/api/diff` | Returns the full parsed, analyzed diff |
| `POST` | `/api/summarize` | AI summarization for a specific file or hunk |
| `POST` | `/api/checklist` | Generates review checklist for a specific file |
| `POST` | `/api/summarize-all` | Batch AI summarization for all files |

## Contributing

Thanks for your interest in improving DiffDragon. Contributions are welcome.

1. Fork the repository and create a feature branch.
2. Keep changes focused and add context in the PR description.
3. Run `go test ./...` before opening a PR.
4. If you update the frontend, run the relevant frontend build/dev commands and mention any UI changes.

## License

MIT. See `LICENSE`.
