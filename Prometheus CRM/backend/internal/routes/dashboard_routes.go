package routes

import (
	"prometheus-crm/internal/handlers"

	"github.com/gin-gonic/gin"
)

// RegisterDashboardRoutes регистрирует маршруты для главной панели управления.
func RegisterDashboardRoutes(rg *gin.RouterGroup) {
	// Устанавливаем страницу новостей как главную
	rg.GET("/dashboard", handlers.ShowDashboardPage)
}
