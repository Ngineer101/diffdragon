package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AIClient provides an interface for generating summaries and checklists.
type AIClient struct {
	provider       string // "claude", "ollama", "none"
	apiKey         string
	ollamaURL      string
	ollamaModel    string
	lmstudioURL    string
	lmstudioModel  string
	lmstudioAPIKey string
	httpClient     *http.Client
}

type AIRiskAssessment struct {
	RiskScore     int      `json:"riskScore"`
	Reasons       []string `json:"reasons"`
	SemanticGroup string   `json:"semanticGroup"`
	Confidence    string   `json:"confidence"`
}

// NewAIClient creates an AIClient based on the configuration.
func NewAIClient(cfg *Config) *AIClient {
	if cfg.AIProvider == "none" {
		return nil
	}

	return &AIClient{
		provider:       cfg.AIProvider,
		apiKey:         cfg.AnthropicKey,
		ollamaURL:      cfg.OllamaURL,
		ollamaModel:    cfg.OllamaModel,
		lmstudioURL:    cfg.LMStudioURL,
		lmstudioModel:  cfg.LMStudioModel,
		lmstudioAPIKey: cfg.LMStudioAPIKey,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// AssessRisk generates an AI risk assessment for a file diff.
func (ai *AIClient) AssessRisk(file *DiffFile) (*AIRiskAssessment, error) {
	if ai == nil {
		return nil, fmt.Errorf("no AI provider configured")
	}

	prompt := fmt.Sprintf(`You are a staff engineer performing risk triage for a git diff.

Return ONLY valid JSON with this exact shape:
{"riskScore": number, "reasons": [string], "semanticGroup": "feature|bugfix|refactor|test|config|docs|style", "confidence": "low|medium|high"}

Rules:
- riskScore is 0-100 where 0 is trivial and 100 is very risky.
- reasons must be 2-5 short, concrete reasons tied to THIS diff.
- semanticGroup must be one of the listed values.
- confidence should reflect certainty in your assessment.
- Do not include markdown code fences or extra text.

File: %s
Status: %s
Language: %s
Lines added: %d
Lines removed: %d
Current heuristic risk: %d
Current heuristic reasons: %s
Current heuristic semantic group: %s

Diff:
%s`, file.Path, file.Status, file.Language, file.LinesAdded, file.LinesRemoved, file.RiskScore, strings.Join(file.RiskReasons, ", "), file.SemanticGroup, truncate(file.RawDiff, 5000))

	result, err := ai.complete(prompt)
	if err != nil {
		return nil, err
	}

	result = extractJSONObject(result)
	var assessment AIRiskAssessment
	if err := json.Unmarshal([]byte(result), &assessment); err != nil {
		return nil, fmt.Errorf("failed to parse AI risk JSON: %w", err)
	}

	if assessment.RiskScore < 0 {
		assessment.RiskScore = 0
	}
	if assessment.RiskScore > 100 {
		assessment.RiskScore = 100
	}

	return &assessment, nil
}

// SummarizeFile generates a natural language summary for a file diff.
func (ai *AIClient) SummarizeFile(file *DiffFile) (string, error) {
	if ai == nil {
		return "", fmt.Errorf("no AI provider configured")
	}

	prompt := fmt.Sprintf(`You are a senior software engineer reviewing a code diff. Provide a concise 1-2 sentence summary of what changed in this file and why it matters.

File: %s
Status: %s
Language: %s
Lines added: %d
Lines removed: %d

Diff:
%s

Respond with ONLY the summary, no preamble or formatting.`, file.Path, file.Status, file.Language, file.LinesAdded, file.LinesRemoved, truncate(file.RawDiff, 4000))

	return ai.complete(prompt)
}

// SummarizeHunk generates a summary for a single diff hunk.
func (ai *AIClient) SummarizeHunk(file *DiffFile, hunk *DiffHunk) (string, error) {
	if ai == nil {
		return "", fmt.Errorf("no AI provider configured")
	}

	prompt := fmt.Sprintf(`You are a senior software engineer reviewing a code diff. Provide a concise 1-sentence summary of what this specific change does.

File: %s (%s)
Hunk header: %s

Diff content:
%s

Respond with ONLY the summary, no preamble or formatting.`, file.Path, file.Language, hunk.Header, truncate(hunk.Content, 3000))

	return ai.complete(prompt)
}

// GenerateChecklist creates a review checklist for a file based on its diff.
func (ai *AIClient) GenerateChecklist(file *DiffFile) ([]string, error) {
	if ai == nil {
		return nil, fmt.Errorf("no AI provider configured")
	}

	prompt := fmt.Sprintf(`You are a senior software engineer creating a code review checklist. Based on this diff, generate 3-7 specific, actionable review items. Focus on potential bugs, security issues, edge cases, and correctness concerns specific to THIS diff (not generic advice).

File: %s
Status: %s
Language: %s
Risk reasons: %s

Diff:
%s

Respond with ONLY a JSON array of strings, each being one checklist item. Example:
["Check that the SQL query uses parameterized arguments", "Verify error is propagated to caller"]`, file.Path, file.Status, file.Language, strings.Join(file.RiskReasons, ", "), truncate(file.RawDiff, 4000))

	result, err := ai.complete(prompt)
	if err != nil {
		return nil, err
	}

	// Parse the JSON array from the response
	var checklist []string
	// Try to extract JSON from the response (model might wrap it in markdown)
	result = extractJSON(result)
	if err := json.Unmarshal([]byte(result), &checklist); err != nil {
		// If JSON parsing fails, split by newlines as fallback
		lines := strings.Split(result, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			line = strings.TrimPrefix(line, "- ")
			line = strings.TrimPrefix(line, "* ")
			if len(line) > 0 {
				checklist = append(checklist, line)
			}
		}
	}

	return checklist, nil
}

// complete sends a prompt to the configured AI provider and returns the response.
func (ai *AIClient) complete(prompt string) (string, error) {
	switch ai.provider {
	case "claude":
		return ai.completeClaude(prompt)
	case "ollama":
		return ai.completeOllama(prompt)
	case "lmstudio":
		return ai.completeLMStudio(prompt)
	default:
		return "", fmt.Errorf("unknown AI provider: %s", ai.provider)
	}
}

// completeClaude calls the Anthropic Messages API.
func (ai *AIClient) completeClaude(prompt string) (string, error) {
	body := map[string]interface{}{
		"model":      "claude-sonnet-4-20250514",
		"max_tokens": 1024,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", ai.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := ai.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if len(result.Content) == 0 {
		return "", fmt.Errorf("empty response from API")
	}

	return result.Content[0].Text, nil
}

// completeOllama calls the Ollama generate API.
func (ai *AIClient) completeOllama(prompt string) (string, error) {
	body := map[string]interface{}{
		"model":  ai.ollamaModel,
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"num_predict": 1024,
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	url := strings.TrimSuffix(ai.ollamaURL, "/") + "/api/generate"
	resp, err := ai.httpClient.Post(url, "application/json", bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("Ollama request failed (is Ollama running?): %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("Ollama returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Response string `json:"response"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse Ollama response: %w", err)
	}

	return strings.TrimSpace(result.Response), nil
}

// completeLMStudio calls the OpenAI-compatible chat completions API exposed by LM Studio.
func (ai *AIClient) completeLMStudio(prompt string) (string, error) {
	baseURL := strings.TrimSuffix(ai.lmstudioURL, "/")
	url := baseURL
	if !strings.HasSuffix(url, "/chat/completions") {
		if strings.HasSuffix(url, "/v1") {
			url += "/chat/completions"
		} else {
			url += "/v1/chat/completions"
		}
	}

	body := map[string]interface{}{
		"model": ai.lmstudioModel,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.2,
		"max_tokens":  1024,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(ai.lmstudioAPIKey) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(ai.lmstudioAPIKey))
	}

	resp, err := ai.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("LM Studio request failed (is LM Studio server running?): %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("LM Studio returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("failed to parse LM Studio response: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("empty response from LM Studio")
	}

	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

// truncate limits a string to maxLen characters.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "\n... (truncated)"
}

// extractJSON tries to find a JSON array in a string that might be wrapped in markdown code fences.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)

	// Remove markdown code fences
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	// Find the first [ and last ]
	start := strings.Index(s, "[")
	end := strings.LastIndex(s, "]")
	if start >= 0 && end > start {
		return s[start : end+1]
	}

	return s
}

// extractJSONObject finds the outermost JSON object in a response.
func extractJSONObject(s string) string {
	s = strings.TrimSpace(s)

	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}

	return s
}
