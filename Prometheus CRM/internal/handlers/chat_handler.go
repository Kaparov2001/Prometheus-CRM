package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CreateChatInput defines the structure for creating a new chat.
type CreateChatInput struct {
	Name           string `json:"name"`
	Type           string `json:"type" binding:"required"` // "personal" or "group"
	ParticipantIDs []uint `json:"participantIds" binding:"required"`
}

// ChatListItemResponse defines the structure for an item in the chat list.
type ChatListItemResponse struct {
	ID           uint                  `json:"ID"`
	Name         string                `json:"name"`
	Type         string                `json:"type"`
	Participants []models.UserResponse `json:"participants"`
	LastMessage  string                `json:"lastMessage"`
	UpdatedAt    string                `json:"UpdatedAt"`
	UnreadCount  int64                 `json:"unreadCount"`
}

// ListChatsHandler returns the list of chats for the current user.
func ListChatsHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var chats []models.Chat
	// Find all chats in which the current user is a participant
	config.DB.Preload("Participants").
		Joins("JOIN chat_participants cp ON cp.chat_id = chats.id").
		Where("cp.user_id = ?", userID).
		Order("chats.updated_at DESC").
		Find(&chats)

	var response []ChatListItemResponse
	for _, chat := range chats {
		var lastMsg models.ChatMessage
		config.DB.Where("chat_id = ?", chat.ID).Order("created_at DESC").Limit(1).First(&lastMsg)

		var unreadCount int64
		var readStatus models.MessageReadStatus
		// Find the read status for this chat and user
		config.DB.Where("chat_id = ? AND user_id = ?", chat.ID, userID).First(&readStatus)

		// Count messages created after the last read message
		config.DB.Model(&models.ChatMessage{}).
			Where("chat_id = ? AND id > ?", chat.ID, readStatus.LastReadMessageID).
			Count(&unreadCount)

		var participantsResponse []models.UserResponse
		for _, p := range chat.Participants {
			participantsResponse = append(participantsResponse, models.UserResponse{
				ID:       p.ID,
				FullName: p.FullName,
				PhotoURL: p.PhotoURL,
			})
		}

		lastMessageText := lastMsg.Content
		if lastMsg.Type == "file" || lastMsg.Type == "voice" {
			lastMessageText = lastMsg.FileName
		}

		item := ChatListItemResponse{
			ID:           chat.ID,
			Name:         chat.Name,
			Type:         chat.Type,
			Participants: participantsResponse,
			LastMessage:  lastMessageText,
			UpdatedAt:    chat.UpdatedAt.Format(time.RFC3339),
			UnreadCount:  unreadCount,
		}
		response = append(response, item)
	}

	if response == nil {
		response = make([]ChatListItemResponse, 0)
	}

	c.JSON(http.StatusOK, response)
}

// CreateChatHandler creates a new chat.
func CreateChatHandler(c *gin.Context) {
	var input CreateChatInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	userID, _ := c.Get("user_id")
	currentUserID := userID.(uint)

	// Add the current user to the participant list if not already present
	isCurrentUserParticipant := false
	for _, id := range input.ParticipantIDs {
		if id == currentUserID {
			isCurrentUserParticipant = true
			break
		}
	}
	if !isCurrentUserParticipant {
		input.ParticipantIDs = append(input.ParticipantIDs, currentUserID)
	}

	// For personal chats, check if a chat already exists between the two users
	if input.Type == "personal" && len(input.ParticipantIDs) == 2 {
		var existingChatID uint
		config.DB.Raw(`
            SELECT cp1.chat_id
            FROM chat_participants AS cp1
            JOIN chat_participants AS cp2 ON cp1.chat_id = cp2.chat_id
            JOIN chats ON chats.id = cp1.chat_id
            WHERE chats.type = 'personal' AND cp1.user_id = ? AND cp2.user_id = ?
            LIMIT 1`, input.ParticipantIDs[0], input.ParticipantIDs[1]).Scan(&existingChatID)

		if existingChatID != 0 {
			var existingChat models.Chat
			config.DB.Preload("Participants").First(&existingChat, existingChatID)
			c.JSON(http.StatusOK, gin.H{"message": "Chat already exists", "chat": existingChat})
			return
		}
	}

	chat := models.Chat{
		Name:        input.Name,
		Type:        input.Type,
		CreatedByID: currentUserID,
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&chat).Error; err != nil {
			return err
		}

		var participants []models.User
		if err := tx.Where("id IN ?", input.ParticipantIDs).Find(&participants).Error; err != nil {
			return err
		}
		if err := tx.Model(&chat).Association("Participants").Replace(participants); err != nil {
			return err
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create chat: " + err.Error()})
		return
	}

	config.DB.Preload("Participants").First(&chat, chat.ID)

	c.JSON(http.StatusCreated, gin.H{"message": "Chat created successfully", "chat": chat})
}

// GetMessagesHandler returns the message history for a chat with pagination.
func GetMessagesHandler(c *gin.Context) {
	chatID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chat ID"})
		return
	}
	userID, _ := c.Get("user_id")

	// Verify that the user is a participant in the chat
	var participantCount int64
	config.DB.Model(&models.ChatParticipant{}).Where("chat_id = ? AND user_id = ?", chatID, userID).Count(&participantCount)
	if participantCount == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this chat"})
		return
	}

	var messages []models.ChatMessage
	err = config.DB.Preload("User").
		Where("chat_id = ?", chatID).
		Order("created_at DESC").
		Scopes(Paginate(c)). // Use the existing Paginate function
		Find(&messages).Error

	if err != nil {
		slog.Error("Failed to fetch messages", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch messages"})
		return
	}

	// Update the read status
	var lastMessageID uint = 0
	if len(messages) > 0 {
		// Since messages are sorted descending, the last read is the first in the list
		lastMessageID = messages[0].ID
	}

	if lastMessageID > 0 {
		readStatus := models.MessageReadStatus{
			ChatID:            uint(chatID),
			UserID:            userID.(uint),
			LastReadMessageID: lastMessageID,
		}
		// Use OnConflict to update the record if it exists, or create a new one.
		err = config.DB.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "chat_id"}, {Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"last_read_message_id"}),
		}).Create(&readStatus).Error

		if err != nil {
			slog.Error("Failed to update read status", "error", err)
			// Do not return an error to the client, as this is not critical for displaying messages
		}
	}

	c.JSON(http.StatusOK, messages)
}

// ListAllUsersForChatHandler gets all users for chat initiation.
func ListAllUsersForChatHandler(c *gin.Context) {
	var users []models.User
	currentUserID, _ := c.Get("user_id")

	// ИСПРАВЛЕННЫЙ ЗАПРОС
	err := config.DB.
		Where("id != ? AND id != ?", currentUserID, aiUserID). // aiUserID = 99999
		Order("full_name ASC").
		Find(&users).Error

	// ИСПРАВЛЕННАЯ ПРОВЕРКА ОШИБКИ
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch users for chat"})
		return
	}

	// Создаем упрощенный ответ, чтобы не отправлять лишние данные (пароль и т.д.)
	var response []models.UserResponse
	for _, u := range users {
		photo := u.PhotoURL
		if photo == "" {
			photo = "/static/placeholder.png"
		}
		response = append(response, models.UserResponse{
			ID:       u.ID,
			FullName: u.FullName,
			PhotoURL: photo,
		})
	}
	if response == nil {
		response = make([]models.UserResponse, 0)
	}

	c.JSON(http.StatusOK, response)
}

// UploadFileHandler обрабатывает загрузку файлов для чата.
func UploadFileHandler(c *gin.Context) {
	// Устанавливаем максимальный размер тела запроса 10.5 MB для обработки файла
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20+512) // 10.5 MB

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Файл не предоставлен или слишком большой"})
		return
	}

	// Создаем директорию для загрузок, если ее нет
	uploadDir := "./static/uploads/chat"
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать директорию для загрузки"})
		return
	}

	// Генерируем уникальное имя файла
	ext := filepath.Ext(file.Filename)
	newFileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	filePath := filepath.Join(uploadDir, newFileName)

	// Сохраняем файл на сервере
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить файл"})
		return
	}

	// Возвращаем публичный URL файла
	fileURL := "/static/uploads/chat/" + newFileName
	c.JSON(http.StatusOK, gin.H{
		"url":  fileURL,
		"name": file.Filename,
		"size": file.Size,
	})
}
