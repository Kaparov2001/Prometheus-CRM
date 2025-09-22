package routes

import (
	"prometheus-crm/internal/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRoutes инициализирует все маршруты приложения.
func SetupRoutes(r *gin.Engine) {
	// --- Публичные маршруты ---
	// Сначала регистрируем маршруты, которые не требуют аутентификации.
	// Это страницы входа, регистрации и обработчики их форм.
	RegisterAuthRoutes(r)

	// --- Защищенная группа маршрутов ---
	// Все маршруты в этой группе требуют, чтобы пользователь был аутентифицирован.
	// Middleware `AuthMiddleware` проверяет наличие и валидность JWT токена.
	authRequired := r.Group("/")
	authRequired.Use(middleware.AuthMiddleware())
	{
		// Регистрируем маршруты, доступные только авторизованным пользователям.
		RegisterDashboardRoutes(authRequired) // Главная панель управления
		RegisterAPIRoutes(authRequired)       // Все API-маршруты
	}
}
