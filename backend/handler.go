package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type PromptRequest struct {
	Prompt string `json:"prompt"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func GenerateBlueprint(c *gin.Context) {

	var req PromptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Prompt is required"})
		return
	}

	apiKey := firstNonEmptyEnv("OPENROUTER_API_KEY", "OPENROUTER_API")
	if apiKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OPENROUTER_API_KEY or OPENROUTER_API is not configured"})
		return
	}

	model := firstNonEmptyEnv("OPENROUTER_MODEL")
	if model == "" {
		model = "deepseek/deepseek-chat-v3-0324"
	}

	body := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{
				"role": "system",
				"content": `
You are an architectural blueprint AI.
Return STRICT JSON only.
Schema:
{
  "rooms": [
    { "name": "string", "x": number, "y": number, "width": number, "height": number }
  ]
}
`,
			},
			{
				"role":    "user",
				"content": req.Prompt,
			},
		},
		"temperature": 0.2,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to prepare AI request"})
		return
	}

	httpReq, err := http.NewRequest(
		http.MethodPost,
		"https://openrouter.ai/api/v1/chat/completions",
		bytes.NewBuffer(jsonBody),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create AI request"})
		return
	}

	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	if referer := firstNonEmptyEnv("OPENROUTER_SITE_URL", "OPENROUTER_HTTP_REFERER"); referer != "" {
		httpReq.Header.Set("HTTP-Referer", referer)
	}
	if title := firstNonEmptyEnv("OPENROUTER_APP_NAME", "OPENROUTER_X_TITLE"); title != "" {
		httpReq.Header.Set("X-Title", title)
	}

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI request failed"})
		return
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to read AI response"})
		return
	}

	var parsedResp chatCompletionResponse
	if err := json.Unmarshal(respBody, &parsedResp); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI service returned an unreadable response"})
		return
	}

	if resp.StatusCode >= 400 {
		errMsg := "AI request failed"
		if parsedResp.Error != nil && strings.TrimSpace(parsedResp.Error.Message) != "" {
			errMsg = parsedResp.Error.Message
		}
		statusCode := http.StatusBadGateway
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			statusCode = http.StatusUnauthorized
			if errMsg == "AI request failed" {
				errMsg = "OpenRouter authentication failed. Check OPENROUTER_API_KEY."
			}
		}
		c.JSON(statusCode, gin.H{"error": errMsg})
		return
	}

	if len(parsedResp.Choices) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI response did not include any choices"})
		return
	}

	content := cleanResponseContent(parsedResp.Choices[0].Message.Content)
	if content == "" {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI response content was empty"})
		return
	}

	// Parse AI JSON output
	var parsed interface{}
	err = json.Unmarshal([]byte(content), &parsed)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI returned invalid JSON"})
		return
	}

	c.JSON(http.StatusOK, parsed)
}

func cleanResponseContent(content string) string {
	cleaned := strings.TrimSpace(content)
	if strings.HasPrefix(cleaned, "```") {
		lines := strings.Split(cleaned, "\n")
		if len(lines) >= 3 && strings.HasPrefix(strings.TrimSpace(lines[0]), "```") && strings.TrimSpace(lines[len(lines)-1]) == "```" {
			cleaned = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}
	return strings.TrimSpace(cleaned)
}

func firstNonEmptyEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
