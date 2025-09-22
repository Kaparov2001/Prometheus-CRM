// FILE: config/google.go
package config

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

var (
	GeminiClient *genai.GenerativeModel
)

// InitGoogleServices инициализирует клиенты для работы с Gemini API.
func InitGoogleServices() error {
	ctx := context.Background()

	// Инициализация Gemini
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("GEMINI_API_KEY environment variable not set")
	}

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return fmt.Errorf("unable to create Gemini client: %v", err)
	}
	GeminiClient = client.GenerativeModel("gemini-1.5-flash")
	slog.Info("Gemini API client initialized successfully.")

	return nil
}
