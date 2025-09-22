package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// GetProfileHandler возвращает данные текущего авторизованного пользователя.
func GetProfileHandler(c *gin.Context) {
	// Middleware уже загрузило все необходимые данные в контекст.
	// Нам не нужно делать лишних запросов в базу за правами, просто извлекаем их.
	userIDVal, _ := c.Get("user_id")
	loginVal, _ := c.Get("login")
	rolesVal, _ := c.Get("roles")
	permissionsVal, _ := c.Get("permissions") // <<< Самое важное: берем ГОТОВЫЙ список прав.

	// Безопасно преобразуем типы данных.
	userID, _ := userIDVal.(uint)
	login, _ := loginVal.(string)
	roles, _ := rolesVal.([]string)
	permissions, _ := permissionsVal.([]string)

	// Делаем ОДИН запрос в базу только за теми полями, которых нет в контексте (фото, ИИН и т.д.).
	var userDetails models.User
	if err := config.DB.Select("full_name", "email", "phone", "iin", "photo_url").First(&userDetails, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User details not found in DB"})
		return
	}

	// Формируем и отправляем корректный JSON-ответ, где "permissions" - это настоящий список прав.
	c.JSON(http.StatusOK, gin.H{
		"id":          userID,
		"login":       login,
		"fullName":    userDetails.FullName,
		"email":       userDetails.Email,
		"phone":       userDetails.Phone,
		"iin":         userDetails.IIN,
		"photoUrl":    userDetails.PhotoURL,
		"roles":       roles,
		"permissions": permissions, // <<< ОТПРАВЛЯЕМ ПРАВИЛЬНЫЕ ДАННЫЕ
	})
}

// UpdateProfileHandler обновляет данные профиля текущего пользователя.
func UpdateProfileHandler(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authorized"})
		return
	}
	userID := userIDVal.(uint)

	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	user.FullName = c.PostForm("fullName")
	user.IIN = c.PostForm("iin")
	user.Email = c.PostForm("email")
	user.Phone = c.PostForm("phone")

	if password := c.PostForm("newPassword"); password != "" {
		if oldPassword := c.PostForm("oldPassword"); oldPassword == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Для смены пароля необходимо указать старый пароль."})
			return
		} else if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(oldPassword)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Старый пароль указан неверно."})
			return
		}
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash new password"})
			return
		}
		user.Password = string(hashedPassword)
	}

	file, _ := c.FormFile("photo")
	if file != nil {
		uploadDir := "./static/uploads/users"
		if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
			os.MkdirAll(uploadDir, os.ModePerm)
		}
		ext := filepath.Ext(file.Filename)
		newFileName := fmt.Sprintf("%d_%d%s", user.ID, time.Now().Unix(), ext)
		filePath := filepath.Join(uploadDir, newFileName)
		if err := c.SaveUploadedFile(file, filePath); err == nil {
			user.PhotoURL = "/static/uploads/users/" + newFileName
		}
	}

	if err := config.DB.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save profile: " + err.Error()})
		return
	}

	if config.RDB != nil {
		cacheKey := fmt.Sprintf("user:%d:data", user.ID)
		if err := config.RDB.Del(config.Ctx, cacheKey).Err(); err != nil {
			slog.Warn("Failed to invalidate cache for user after profile update", "error", err, "user_id", user.ID)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Профиль успешно обновлен!",
		"user": gin.H{
			"photoUrl": user.PhotoURL,
			"login":    user.Login,
		},
	})
}
