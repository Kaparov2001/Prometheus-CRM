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
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ListNewsPostsHandler возвращает список постов для новостной ленты
func ListNewsPostsHandler(c *gin.Context) {
	var posts []models.NewsPost

	// Предзагружаем все связанные данные: автора, опции опроса, голоса и файлы
	err := config.DB.
		Preload("User").
		Preload("PollOptions.Votes").
		Preload("Files").
		Order("created_at desc").
		Find(&posts).Error

	if err != nil {
		slog.Error("Failed to fetch news posts from DB", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch news posts"})
		return
	}

	if posts == nil {
		posts = make([]models.NewsPost, 0)
	}

	c.JSON(http.StatusOK, posts)
}

// CreateNewsPostHandler создает новый пост (сообщение или опрос) с несколькими файлами
func CreateNewsPostHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")

	// Используем MultipartForm для получения текстовых полей и файлов
	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid form data: " + err.Error()})
		return
	}

	// Получаем текстовые поля из формы
	contentValues := form.Value["content"]
	typeValues := form.Value["type"]

	var post models.NewsPost
	post.AuthorID = userID.(uint)

	if len(typeValues) > 0 {
		post.Type = typeValues[0]
	} else {
		post.Type = "message" // Значение по умолчанию
	}

	if len(contentValues) > 0 {
		post.Content = contentValues[0]
	}

	// Логика для опросов
	if post.Type == "poll" {
		pollQuestionValues := form.Value["poll_question"]
		if len(pollQuestionValues) > 0 {
			post.PollQuestion = pollQuestionValues[0]
		}

		options := form.Value["options[]"]
		if len(options) < 2 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "An poll must have at least two options"})
			return
		}
		for _, optText := range options {
			post.PollOptions = append(post.PollOptions, models.PollOption{Text: optText})
		}
	}

	// Обработка нескольких файлов
	files := form.File["files"] // "files" - имя поля в форме
	if len(files) > 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "You can upload a maximum of 10 files"})
		return
	}

	for _, file := range files {
		uploadDir := "./static/uploads/newsfeed"
		if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create upload directory"})
			return
		}

		ext := strings.ToLower(filepath.Ext(file.Filename))
		newFileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
		filePath := filepath.Join(uploadDir, newFileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not save file: " + err.Error()})
			return
		}

		var fileType string
		switch ext {
		case ".jpg", ".jpeg", ".png", ".gif", ".webp":
			fileType = "image"
		case ".mp4", ".webm", ".mov", ".ogg":
			fileType = "video"
		default:
			fileType = "file"
		}

		post.Files = append(post.Files, models.NewsPostFile{
			FileUrl:  "/static/uploads/newsfeed/" + newFileName,
			FileType: fileType,
		})
	}

	// Сохранение поста и всех связанных данных в БД
	if err := config.DB.Create(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post: " + err.Error()})
		return
	}

	// Перезагружаем пост со всеми данными для ответа клиенту
	config.DB.Preload("User").Preload("PollOptions.Votes").Preload("Files").First(&post, post.ID)

	c.JSON(http.StatusCreated, post)
}

// UpdateNewsPostHandler обновляет содержимое поста
func UpdateNewsPostHandler(c *gin.Context) {
	postID := c.Param("id")
	userID, _ := c.Get("user_id")

	var post models.NewsPost
	if err := config.DB.First(&post, postID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	if post.AuthorID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not allowed to edit this post"})
		return
	}

	var input struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
		return
	}

	post.Content = input.Content
	if err := config.DB.Save(&post).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
		return
	}

	// Возвращаем обновленный пост со всеми связями
	config.DB.Preload("User").Preload("PollOptions.Votes").Preload("Files").First(&post, post.ID)
	c.JSON(http.StatusOK, post)
}

// DeleteNewsPostHandler удаляет пост
func DeleteNewsPostHandler(c *gin.Context) {
	postID := c.Param("id")
	userID, _ := c.Get("user_id")
	userRoles, _ := c.Get("roles")
	roles := userRoles.([]string)

	var post models.NewsPost
	// Загружаем пост вместе с файлами, чтобы получить их пути для удаления
	if err := config.DB.Preload("Files").First(&post, postID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
		return
	}

	isAdmin := false
	for _, r := range roles {
		if r == "admin" {
			isAdmin = true
			break
		}
	}
	if post.AuthorID != userID.(uint) && !isAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "You are not allowed to delete this post"})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// Удаление самого поста. Связанные записи (файлы, опции, голоса)
		// удалятся автоматически благодаря `constraint:OnDelete:CASCADE` в моделях.
		if err := tx.Delete(&post).Error; err != nil {
			return err
		}

		// Физическое удаление файлов с диска
		for _, file := range post.Files {
			fullPath := filepath.Join(".", strings.TrimPrefix(filepath.FromSlash(file.FileUrl), "/"))
			if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
				// Логируем ошибку, но не прерываем транзакцию,
				// так как пост в БД уже удален (или будет удален).
				slog.Warn("Could not delete post file from disk", "path", fullPath, "error", err)
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Post deleted successfully"})
}

// VoteInPollHandler обрабатывает голос в опросе
func VoteInPollHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")
	postID := c.Param("id")
	optionIDStr := c.Param("optionId")
	optionID, _ := strconv.Atoi(optionIDStr)

	var option models.PollOption
	if err := config.DB.Where("id = ? AND news_post_id = ?", optionID, postID).First(&option).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll option not found"})
		return
	}

	var existingVote models.PollVote
	err := config.DB.
		Joins("JOIN poll_options ON poll_options.id = poll_votes.poll_option_id").
		Where("poll_options.news_post_id = ? AND poll_votes.user_id = ?", postID, userID).
		First(&existingVote).Error

	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You have already voted in this poll"})
		return
	}
	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error while checking vote"})
		return
	}

	vote := models.PollVote{
		PollOptionID: uint(optionID),
		UserID:       userID.(uint),
	}
	if err := config.DB.Create(&vote).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to cast vote"})
		return
	}

	var updatedPost models.NewsPost
	config.DB.Preload("User").Preload("PollOptions.Votes").Preload("Files").First(&updatedPost, postID)
	c.JSON(http.StatusOK, updatedPost)
}
