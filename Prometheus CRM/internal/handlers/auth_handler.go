package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// RegisterInput определяет структуру данных для регистрации нового пользователя.
type RegisterInput struct {
	Login    string `json:"login" binding:"required"`
	FullName string `json:"fullName" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Phone    string `json:"phone"`
}

// LoginInput определяет структуру данных для входа пользователя.
type LoginInput struct {
	Login    string `json:"login" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// RegisterHandler обрабатывает регистрацию нового пользователя.
func RegisterHandler(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	user := models.User{
		Login:    input.Login,
		FullName: input.FullName,
		Email:    input.Email,
		Password: string(hashedPassword),
		Phone:    input.Phone,
		Status:   "active", // Статус по умолчанию
	}

	// Проверка на существование пользователя с таким же логином или email
	var existing models.User
	if err := config.DB.Where("login = ? OR email = ?", input.Login, input.Email).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Login or Email already in use"})
		return
	}

	// Используем транзакцию для создания пользователя и назначения ему роли
	err = config.DB.Transaction(func(tx *gorm.DB) error {
		// Создаем пользователя
		if err := tx.Create(&user).Error; err != nil {
			return err
		}

		// Находим роль "user" (предполагаем, что она была создана миграцией или администратором)
		var defaultRole models.Role
		if err := tx.Where("name = ?", "user").First(&defaultRole).Error; err != nil {
			// Если роль не найдена, можно создать её или вернуть ошибку
			// Для простоты пока возвращаем ошибку
			return err
		}

		// Связываем пользователя с ролью
		if err := tx.Model(&user).Association("Roles").Append(&defaultRole); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user: " + err.Error()})
		return
	}

	// Возвращаем данные созданного пользователя без пароля
	c.JSON(http.StatusCreated, gin.H{
		"id":       user.ID,
		"login":    user.Login,
		"fullName": user.FullName,
		"email":    user.Email,
	})
}

// LoginHandler обрабатывает вход пользователя в систему.
func LoginHandler(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		slog.Warn(
			"Некорректный запрос на вход",
			"error", err.Error(),
			"ip_address", c.ClientIP(),
		)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := config.DB.Preload("Roles.Permissions").Where("login = ?", input.Login).First(&user).Error; err != nil {
		slog.Warn(
			"Попытка входа с неверным логином",
			"login", input.Login,
			"ip_address", c.ClientIP(),
		)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid login or password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		slog.Warn(
			"Попытка входа с неверным паролем",
			"login", input.Login,
			"user_id", user.ID,
			"ip_address", c.ClientIP(),
		)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid login or password"})
		return
	}

	if user.Status == "blocked" {
		c.JSON(http.StatusForbidden, gin.H{"error": "User account is blocked"})
		return
	}

	now := time.Now()
	user.LastLoginAt = &now
	config.DB.Save(&user)

	var roleNames []string
	for _, role := range user.Roles {
		roleNames = append(roleNames, role.Name)
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"login":   user.Login,
		"roles":   roleNames,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString(config.JwtKey)
	if err != nil {
		slog.Error(
			"Не удалось создать JWT токен",
			"error", err.Error(),
			"user_id", user.ID,
		)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create token"})
		return
	}

	slog.Info("Пользователь успешно вошел в систему", "login", user.Login, "user_id", user.ID)

	c.SetCookie("auth_token", tokenString, 3600*24, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"token": tokenString})
}

// ShowLoginPage отображает страницу входа.
func ShowLoginPage(c *gin.Context) {
	c.HTML(http.StatusOK, "login.html", gin.H{})
}

// ShowRegisterPage отображает страницу регистрации.
func ShowRegisterPage(c *gin.Context) {
	c.HTML(http.StatusOK, "register.html", nil)
}

// LogoutHandler обрабатывает выход пользователя.
func LogoutHandler(c *gin.Context) {
	c.SetCookie("auth_token", "", -1, "/", "", false, true)
	c.Redirect(http.StatusFound, "/")
}
