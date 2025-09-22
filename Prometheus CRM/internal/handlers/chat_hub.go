package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
)

// --- Глобальные переменные и константы ---

const aiUserID = 99999 // Статичный ID для нашего ИИ-ассистента

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Для разработки разрешаем все источники
	},
}

// GlobalHub - единственный экземпляр хаба для всего приложения
var GlobalHub = NewHub()

// --- Структуры ---

type Message struct {
	Type    string             `json:"type"`
	Payload models.ChatMessage `json:"payload"`
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID uint
}

type Hub struct {
	clients    map[uint]*Client
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.Mutex
}

// --- Методы Хаба ---

func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[uint]*Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.userID] = client
			h.mu.Unlock()
			slog.Info("Client registered", "userID", client.userID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.userID]; ok {
				delete(h.clients, client.userID)
				close(client.send)
			}
			h.mu.Unlock()
			slog.Info("Client unregistered", "userID", client.userID)

		case messageData := <-h.broadcast:
			h.handleBroadcast(messageData)
		}
	}
}

func (h *Hub) handleBroadcast(messageData []byte) {
	var msg Message
	if err := json.Unmarshal(messageData, &msg); err != nil {
		slog.Error("Failed to unmarshal broadcast message", "error", err)
		return
	}

	// 1. Сохраняем сообщение пользователя в БД
	userMessage := msg.Payload
	if err := config.DB.Create(&userMessage).Error; err != nil {
		slog.Error("Failed to save user message to DB", "error", err)
		return
	}
	config.DB.Preload("User").First(&userMessage, userMessage.ID)

	// 2. Отправляем сообщение всем участникам чата (включая самого себя)
	h.sendMessageToChat(userMessage)

	// 3. Проверяем, является ли этот чат диалогом с ИИ
	var participants []models.ChatParticipant
	config.DB.Where("chat_id = ?", userMessage.ChatID).Find(&participants)

	isAiChat := false
	for _, p := range participants {
		if p.UserID == aiUserID {
			isAiChat = true
			break
		}
	}

	// 4. Если это чат с ИИ и сообщение не от самого ИИ, запускаем генерацию ответа
	if isAiChat && userMessage.UserID != aiUserID {
		go h.generateAndBroadcastAIResponse(userMessage.ChatID, userMessage.Content)
	}
}

// Отправляет готовое сообщение всем онлайн-участникам чата
func (h *Hub) sendMessageToChat(message models.ChatMessage) {
	var participants []models.ChatParticipant
	config.DB.Where("chat_id = ?", message.ChatID).Find(&participants)

	finalMsg := Message{Type: "newMessage", Payload: message}
	messageBytes, err := json.Marshal(finalMsg)
	if err != nil {
		slog.Error("Failed to marshal message for broadcast", "error", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	for _, p := range participants {
		if client, ok := h.clients[p.UserID]; ok {
			select {
			case client.send <- messageBytes:
			default:
				close(client.send)
				delete(h.clients, p.UserID)
			}
		}
	}
}

// Генерирует ответ от ИИ и отправляет его в чат
func (h *Hub) generateAndBroadcastAIResponse(chatID uint, userMessage string) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// --- ВАШ ПРОМТ ДЛЯ ИИ-АССИСТЕНТА ---
	teacherPrompt := fmt.Sprintf(
		"Ты — 'ИИ-Ассистент', дружелюбный и компетентный помощник для учителей в школе 'Prometheus School'. "+
			"Твоя задача — предоставлять краткие, точные и полезные ответы на вопросы, связанные с образовательным процессом, "+
			"методиками преподавания, планированием уроков и административными задачами. "+
			"Отвечай на русском языке, будь вежлив и профессионален. Не придумывай факты. Если не знаешь ответа, вежливо сообщи об этом. "+
			"Вот вопрос от пользователя: \"%s\"", userMessage)

	prompt := []genai.Part{genai.Text(teacherPrompt)}

	resp, err := config.GeminiClient.GenerateContent(ctx, prompt...)
	if err != nil {
		slog.Error("Gemini AI response error", "error", err)
		// Можно отправить сообщение об ошибке пользователю
		return
	}

	// Извлекаем текстовый ответ из ответа Gemini
	var aiResponseText string
	if len(resp.Candidates) > 0 && len(resp.Candidates[0].Content.Parts) > 0 {
		if textPart, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
			aiResponseText = string(textPart)
		}
	}

	if aiResponseText == "" {
		aiResponseText = "К сожалению, я не смог обработать ваш запрос. Попробуйте переформулировать."
	}

	// Создаем и сохраняем сообщение от ИИ
	aiMessage := models.ChatMessage{
		ChatID:  chatID,
		UserID:  aiUserID,
		Type:    "text",
		Content: aiResponseText,
	}
	if err := config.DB.Create(&aiMessage).Error; err != nil {
		slog.Error("Failed to save AI chat message to DB", "error", err)
		return
	}
	config.DB.Preload("User").First(&aiMessage, aiMessage.ID)

	// Отправляем ответ ИИ в чат
	h.sendMessageToChat(aiMessage)
}

// --- Методы Клиента и WebSocket Endpoint ---

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		_, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				slog.Warn("Unexpected websocket close error", "error", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			slog.Error("Error unmarshaling message from client", "error", err)
			continue
		}
		msg.Payload.UserID = c.userID

		finalMessageBytes, err := json.Marshal(msg)
		if err != nil {
			slog.Error("Error marshaling message before broadcast", "error", err)
			continue
		}
		c.hub.broadcast <- finalMessageBytes
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for message := range c.send {
		c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			slog.Error("Failed to write message to websocket", "error", err)
			return
		}
	}
}

func ChatWSEndpoint(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Error("Failed to upgrade connection to WebSocket", "error", err)
		return
	}

	client := &Client{
		hub:    GlobalHub,
		conn:   conn,
		send:   make(chan []byte, 256),
		userID: userID.(uint),
	}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}
