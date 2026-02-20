package main

import (
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// riskPattern defines a pattern to match against file paths or diff content,
// along with the risk score contribution and a human-readable reason.
type riskPattern struct {
	pathContains    []string // Any of these substrings in the file path
	contentContains []string // Any of these substrings in the diff content
	score           int
	reason          string
}

// riskPatterns is the ordered list of heuristic patterns for risk scoring.
var riskPatterns = []riskPattern{
	{
		pathContains: []string{"auth", "login", "session", "token", "oauth", "jwt", "credential", "password", "secret"},
		score:        30,
		reason:       "Touches authentication/authorization code",
	},
	{
		pathContains: []string{"crypto", "encrypt", "decrypt", "hash", "cert", "tls", "ssl"},
		score:        30,
		reason:       "Touches cryptography/security code",
	},
	{
		pathContains:    []string{"migration", "schema", "database", "db"},
		contentContains: []string{"CREATE TABLE", "ALTER TABLE", "DROP TABLE", "CREATE INDEX", "DROP INDEX"},
		score:           25,
		reason:          "Database schema or migration change",
	},
	{
		contentContains: []string{"SELECT ", "INSERT ", "UPDATE ", "DELETE ", "exec(", "raw(", "rawQuery", "execute("},
		score:           20,
		reason:          "Contains raw SQL or query execution",
	},
	{
		pathContains: []string{"api/", "routes", "handler", "controller", "endpoint", "middleware"},
		score:        20,
		reason:       "Modifies public API surface or middleware",
	},
	{
		pathContains: []string{"permission", "rbac", "role", "access", "policy", "acl"},
		score:        25,
		reason:       "Touches permission/access control logic",
	},
	{
		contentContains: []string{"panic(", "os.Exit", "log.Fatal", "process.exit"},
		score:           15,
		reason:          "Contains abrupt termination calls",
	},
	{
		pathContains: []string{".env", "config", "setting"},
		score:        15,
		reason:       "Configuration file change",
	},
	{
		pathContains: []string{"docker", "k8s", "kubernetes", "deploy", "ci", "cd", "pipeline", "terraform", ".tf"},
		score:        15,
		reason:       "Infrastructure/deployment configuration change",
	},
	{
		pathContains: []string{"payment", "billing", "invoice", "stripe", "subscription", "charge"},
		score:        25,
		reason:       "Touches payment/billing code",
	},
}

// AnalyzeDiff performs risk scoring and semantic grouping on all files in the diff.
// It sorts files by risk score (highest first) after analysis.
func AnalyzeDiff(data *DiffData, ai *AIClient) {
	for _, file := range data.Files {
		scoreFileRiskHeuristic(file)
		classifySemanticGroupHeuristic(file)
	}

	if ai != nil {
		enrichRiskWithAI(data.Files, ai)
	}

	// Sort files: highest risk first
	sort.Slice(data.Files, func(i, j int) bool {
		return data.Files[i].RiskScore > data.Files[j].RiskScore
	})
}

// scoreFileRisk calculates a risk score for a file based on heuristic patterns.
func scoreFileRiskHeuristic(file *DiffFile) {
	pathLower := strings.ToLower(file.Path)
	contentLower := strings.ToLower(file.RawDiff)
	score := 0
	var reasons []string

	for _, pattern := range riskPatterns {
		matched := false

		// Check path patterns
		for _, p := range pattern.pathContains {
			if strings.Contains(pathLower, p) {
				matched = true
				break
			}
		}

		// Check content patterns (only if path didn't match)
		if !matched {
			for _, c := range pattern.contentContains {
				if strings.Contains(contentLower, strings.ToLower(c)) {
					matched = true
					break
				}
			}
		}

		if matched {
			score += pattern.score
			reasons = append(reasons, pattern.reason)
		}
	}

	// Bonus: large diffs are riskier (more surface area for bugs)
	totalLines := file.LinesAdded + file.LinesRemoved
	if totalLines > 200 {
		score += 15
		reasons = append(reasons, "Large change (200+ lines)")
	} else if totalLines > 100 {
		score += 10
		reasons = append(reasons, "Medium-large change (100+ lines)")
	} else if totalLines > 50 {
		score += 5
		reasons = append(reasons, "Moderate change (50+ lines)")
	}

	// Penalty: deletions without additions (removing error handling, etc.)
	if file.LinesRemoved > file.LinesAdded*2 && file.LinesRemoved > 10 {
		score += 10
		reasons = append(reasons, "Significant code removal")
	}

	// Check for removed error handling patterns
	if strings.Contains(contentLower, "-\tif err") || strings.Contains(contentLower, "- if err") ||
		strings.Contains(contentLower, "-\tcatch") || strings.Contains(contentLower, "- catch") ||
		strings.Contains(contentLower, "-\texcept") || strings.Contains(contentLower, "- except") {
		score += 15
		reasons = append(reasons, "Removes error handling")
	}

	// Cap score at 100
	if score > 100 {
		score = 100
	}

	file.RiskScore = score
	file.RiskReasons = reasons
}

// classifySemanticGroup assigns a semantic category to a file based on its path and content.
func classifySemanticGroupHeuristic(file *DiffFile) {
	pathLower := strings.ToLower(file.Path)
	baseName := strings.ToLower(filepath.Base(file.Path))

	// Test files
	if strings.Contains(pathLower, "_test.") || strings.Contains(pathLower, ".test.") ||
		strings.Contains(pathLower, ".spec.") || strings.Contains(pathLower, "test/") ||
		strings.Contains(pathLower, "tests/") || strings.Contains(pathLower, "__tests__/") ||
		strings.HasPrefix(baseName, "test_") {
		file.SemanticGroup = "test"
		return
	}

	// Documentation
	ext := strings.ToLower(filepath.Ext(file.Path))
	if ext == ".md" || ext == ".txt" || ext == ".rst" || ext == ".adoc" ||
		strings.Contains(pathLower, "docs/") || strings.Contains(pathLower, "doc/") ||
		baseName == "readme" || baseName == "changelog" || baseName == "license" {
		file.SemanticGroup = "docs"
		return
	}

	// Configuration
	configExts := map[string]bool{
		".yaml": true, ".yml": true, ".toml": true, ".json": true, ".ini": true,
		".cfg": true, ".conf": true, ".env": true, ".tf": true,
	}
	configFiles := map[string]bool{
		"dockerfile": true, "makefile": true, ".gitignore": true, ".dockerignore": true,
		"docker-compose.yml": true, "docker-compose.yaml": true,
	}

	if configExts[ext] || configFiles[baseName] ||
		strings.Contains(pathLower, "config/") || strings.Contains(pathLower, ".github/") {
		file.SemanticGroup = "config"
		return
	}

	// Style (CSS, formatting)
	if ext == ".css" || ext == ".scss" || ext == ".less" || ext == ".sass" {
		file.SemanticGroup = "style"
		return
	}

	// For source code files, try to classify by diff content
	contentLower := strings.ToLower(file.RawDiff)

	// Bug fix signals
	if strings.Contains(contentLower, "fix") || strings.Contains(contentLower, "bug") ||
		strings.Contains(contentLower, "patch") || strings.Contains(contentLower, "hotfix") {
		file.SemanticGroup = "bugfix"
		return
	}

	// New file = likely a feature
	if file.Status == "added" {
		file.SemanticGroup = "feature"
		return
	}

	// If mostly additions with few deletions, likely a feature
	if file.LinesAdded > 0 && file.LinesRemoved == 0 {
		file.SemanticGroup = "feature"
		return
	}

	// If roughly equal additions and deletions, likely a refactor
	if file.LinesAdded > 0 && file.LinesRemoved > 0 {
		ratio := float64(file.LinesAdded) / float64(file.LinesAdded+file.LinesRemoved)
		if ratio > 0.3 && ratio < 0.7 {
			file.SemanticGroup = "refactor"
			return
		}
	}

	// Default to feature
	file.SemanticGroup = "feature"
}

func enrichRiskWithAI(files []*DiffFile, ai *AIClient) {
	const concurrency = 3
	sem := make(chan struct{}, concurrency)
	var wg sync.WaitGroup

	for _, file := range files {
		wg.Add(1)
		sem <- struct{}{}

		go func(f *DiffFile) {
			defer wg.Done()
			defer func() { <-sem }()

			assessment, err := ai.AssessRisk(f)
			if err != nil || assessment == nil {
				return
			}

			f.RiskScore = blendRiskScores(f.RiskScore, assessment.RiskScore, assessment.Confidence)
			f.RiskReasons = mergeReasons(assessment.Reasons, f.RiskReasons)

			group := normalizeSemanticGroup(assessment.SemanticGroup)
			if group != "" {
				f.SemanticGroup = group
			}
		}(file)
	}

	wg.Wait()
}

func blendRiskScores(heuristic int, ai int, confidence string) int {
	aiWeight := 0.55
	switch strings.ToLower(strings.TrimSpace(confidence)) {
	case "high":
		aiWeight = 0.7
	case "low":
		aiWeight = 0.4
	}

	blended := int(float64(heuristic)*(1-aiWeight) + float64(ai)*aiWeight + 0.5)
	if blended < 0 {
		return 0
	}
	if blended > 100 {
		return 100
	}
	return blended
}

func mergeReasons(primary []string, secondary []string) []string {
	seen := make(map[string]bool)
	merged := make([]string, 0, len(primary)+len(secondary))

	addReason := func(reason string) {
		reason = strings.TrimSpace(reason)
		if reason == "" {
			return
		}
		key := strings.ToLower(reason)
		if seen[key] {
			return
		}
		seen[key] = true
		merged = append(merged, reason)
	}

	for _, reason := range primary {
		addReason(reason)
	}
	for _, reason := range secondary {
		addReason(reason)
	}

	if len(merged) > 6 {
		return merged[:6]
	}

	return merged
}

func normalizeSemanticGroup(group string) string {
	group = strings.ToLower(strings.TrimSpace(group))
	switch group {
	case "feature", "bugfix", "refactor", "test", "config", "docs", "style":
		return group
	default:
		return ""
	}
}
