package routes

import (
	"prometheus-crm/internal/handlers"

	"github.com/gin-gonic/gin"
)

// RegisterAuthRoutes регистрирует публичные маршруты для аутентификации.
// Эти маршруты не требуют middleware для проверки токена.
func RegisterAuthRoutes(r *gin.Engine) {
	// Маршрут для отображения страницы входа.
	// Это главная страница для неавторизованных пользователей.
	r.GET("/", handlers.ShowLoginPage)

	// Маршрут для обработки данных с формы входа.
	r.POST("/login", handlers.LoginHandler)

	// Маршрут для выхода пользователя из системы.
	r.GET("/logout", handlers.LogoutHandler)

	// Маршруты для регистрации нового пользователя.
	r.GET("/register", handlers.ShowRegisterPage) // Показ страницы регистрации.
	r.POST("/register", handlers.RegisterHandler) // Обработка данных с формы регистрации.
}
