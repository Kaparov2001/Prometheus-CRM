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
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ListUsersHandler returns a paginated list of all users with their roles.
func ListUsersHandler(c *gin.Context) {
	var users []models.User

	// Базовый запрос с предзагрузкой ролей
	query := config.DB.Preload("Roles").Order("id asc")

	// Проверяем, нужен ли полный список без пагинации
	if c.Query("all") == "true" {
		if err := query.Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch users"})
			return
		}
	} else {
		// Логика пагинации, если параметр 'all' не установлен
		var totalRows int64
		config.DB.Model(&models.User{}).Count(&totalRows)

		if err := query.Scopes(Paginate(c)).Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch users"})
			return
		}
	}

	// Создаем кастомный ответ
	var responseData []UserResponse
	for _, user := range users {
		var roleNames []string
		for _, role := range user.Roles {
			roleNames = append(roleNames, role.Name)
		}
		photoUrl := user.PhotoURL
		if photoUrl == "" {
			photoUrl = "/static/placeholder.png"
		}
		responseData = append(responseData, UserResponse{
			ID:        user.ID,
			Login:     user.Login,
			Email:     user.Email,
			FullName:  user.FullName,
			Phone:     user.Phone,
			Status:    user.Status,
			Roles:     roleNames,
			CreatedAt: user.CreatedAt,
			PhotoURL:  photoUrl,
		})
	}

	// Отправляем ответ. Если был запрос 'all=true', отправляем простой массив.
	// В ином случае, отправляем объект с пагинацией.
	if c.Query("all") == "true" {
		c.JSON(http.StatusOK, gin.H{"data": responseData}) // Оборачиваем в "data" для консистентности
	} else {
		var totalRows int64
		config.DB.Model(&models.User{}).Count(&totalRows)
		paginatedResponse := CreatePaginatedResponse(c, responseData, totalRows)
		c.JSON(http.StatusOK, paginatedResponse)
	}
}

// ... (остальные функции GetUserHandler, CreateUserHandler, UpdateUserHandler, DeleteUserHandler остаются без изменений) ...

// UserResponse defines the structure for user data sent in API responses.
// This helps prevent accidental leakage of sensitive data like password hashes.
type UserResponse struct {
	ID        uint      `json:"id"`
	Login     string    `json:"login"`
	Email     string    `json:"email"`
	FullName  string    `json:"fullName"`
	Phone     string    `json:"phone"`
	Status    string    `json:"status"`
	Roles     []string  `json:"roles"`
	CreatedAt time.Time `json:"createdAt"`
	PhotoURL  string    `json:"photoUrl"`
}

// CreateUserInput defines the structure for creating a user from the admin panel.
type CreateUserInput struct {
	Login    string `json:"login" binding:"required"`
	FullName string `json:"fullName" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password"` // Password is not required, can be set later
	Phone    string `json:"phone"`
	Status   string `json:"status" binding:"required"`
	RoleIDs  []uint `json:"roleIds"` // IDs of roles to assign
}

// UpdateUserInput defines the structure for updating a user.
type UpdateUserInput struct {
	FullName string `json:"fullName" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Phone    string `json:"phone"`
	Status   string `json:"status" binding:"required"`
	RoleIDs  []uint `json:"roleIds"`
	Password string `json:"password"` // For changing the password
}

// GetUserHandler retrieves a single user by ID.
func GetUserHandler(c *gin.Context) {
	id := c.Param("id")
	var user models.User
	if err := config.DB.Preload("Roles").First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}
	if user.PhotoURL == "" {
		user.PhotoURL = "/static/placeholder.png"
	}

	c.JSON(http.StatusOK, user)
}

// CreateUserHandler creates a new user.
func CreateUserHandler(c *gin.Context) {
	user := models.User{
		Login:    c.PostForm("login"),
		FullName: c.PostForm("fullName"),
		Email:    c.PostForm("email"),
		Phone:    c.PostForm("phone"),
		Status:   c.PostForm("status"),
	}

	password := c.PostForm("password")
	if password == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password is required for new users"})
		return
	}
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}
	user.Password = string(hashedPassword)

	// Получаем массив ID ролей
	roleIdStrings := c.Request.Form["roleIds"]
	var roleIDs []uint
	for _, idStr := range roleIdStrings {
		id, _ := strconv.Atoi(idStr)
		roleIDs = append(roleIDs, uint(id))
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		// Обработка фото
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
				if err := tx.Save(&user).Error; err != nil {
					return err
				}
			}
		}

		// Привязка ролей
		if len(roleIDs) > 0 {
			var roles []models.Role
			if err := tx.Where("id IN ?", roleIDs).Find(&roles).Error; err != nil {
				return err
			}
			if err := tx.Model(&user).Association("Roles").Replace(roles); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, user)
}

// UpdateUserHandler updates a user's data.
// prometheus-crm/internal/handlers/user_handler.go

// ... (импорты пакетов) ...

func UpdateUserHandler(c *gin.Context) {
	// Получаем ID пользователя из URL
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32) // ID преобразован в число
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}
	var user models.User

	// Ищем пользователя по id.
	if err := config.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Обновляем поля из формы
	user.FullName = c.PostForm("fullName")
	user.Email = c.PostForm("email")
	user.Phone = c.PostForm("phone")
	user.Status = c.PostForm("status")

	// Если в форме был передан новый пароль, хэшируем и обновляем его
	if password := c.PostForm("password"); password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			slog.Error("Failed to hash password during update", "error", err, "userID", user.ID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}
		user.Password = string(hashedPassword)
	}

	// Получаем массив ID ролей из формы
	roleIdStrings := c.Request.Form["roleIds"]
	var roleIDs []uint
	for _, ridStr := range roleIdStrings {
		id, _ := strconv.Atoi(ridStr)
		roleIDs = append(roleIDs, uint(id))
	}

	// Используем транзакцию для безопасного обновления
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Объявляем переменную err один раз для всей транзакции
		var err error

		// Обработка фото, если оно было загружено
		file, err := c.FormFile("photo")
		// ИСПРАВЛЕНО: Проверяем ошибку при получении файла.
		// http.ErrMissingFile - это не реальная ошибка, а просто индикатор, что файл не был отправлен.
		if err != nil && err != http.ErrMissingFile {
			return fmt.Errorf("ошибка получения файла: %w", err)
		}

		if file != nil {
			uploadDir := "./static/uploads/users"
			if _, statErr := os.Stat(uploadDir); os.IsNotExist(statErr) {
				// Используем другую переменную для ошибки, чтобы не переопределять основную
				if mkdirErr := os.MkdirAll(uploadDir, os.ModePerm); mkdirErr != nil {
					return fmt.Errorf("не удалось создать директорию: %w", mkdirErr)
				}
			}
			ext := filepath.Ext(file.Filename)
			newFileName := fmt.Sprintf("%d_%d%s", user.ID, time.Now().Unix(), ext)
			filePath := filepath.Join(uploadDir, newFileName)

			// ИСПРАВЛЕНО: Используем оператор присваивания '=', а не ':='
			if err = c.SaveUploadedFile(file, filePath); err != nil {
				return fmt.Errorf("не удалось сохранить файл: %w", err)
			}
			user.PhotoURL = "/static/uploads/users/" + newFileName
		}

		// Сохраняем все обновленные поля пользователя
		// ИСПРАВЛЕНО: Используем '='
		if err = tx.Save(&user).Error; err != nil {
			return err
		}

		// Обновляем роли пользователя
		var roles []models.Role
		if len(roleIDs) > 0 {
			// ИСПРАВЛЕНО: Используем '='
			if err = tx.Where("id IN ?", roleIDs).Find(&roles).Error; err != nil {
				return err
			}
		}

		// Заменяем старый список ролей на новый
		return tx.Model(&user).Association("Roles").Replace(roles)
	})

	if err != nil {
		slog.Error("Failed to update user", "error", err, "userID", user.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user: " + err.Error()})
		return
	}

	// --- Сброс кэша после успешного обновления ---
	if config.RDB != nil {
		// ИСПРАВЛЕНО: Используем новый, правильный ключ "data"
		cacheKey := fmt.Sprintf("user:%d:data", user.ID)
		if err := config.RDB.Del(config.Ctx, cacheKey).Err(); err != nil {
			slog.Error("Failed to invalidate cache for user", "error", err, "user_id", user.ID)
		} else {
			slog.Info("Cache invalidated successfully for user", "user_id", user.ID)
		}
	}

	c.JSON(http.StatusOK, user)
}

// DeleteUserHandler soft-deletes a user.
func DeleteUserHandler(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	if result := config.DB.Delete(&models.User{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "User deleted successfully"})
}
