package handlers

import (
	"net/http"
	// Убедитесь, что путь импорта соответствует вашему файлу go.mod
	"github.com/gin-gonic/gin"
)

// ShowDashboardPage рендерит главную страницу панели управления.
func ShowDashboardPage(c *gin.Context) {
	// Получаем данные, установленные в AuthMiddleware.
	// Мы можем быть уверены, что они существуют, так как middleware уже отработало.
	permissions, _ := c.Get("permissions")
	currentUser, _ := c.Get("login") // Можно использовать login или fullName

	// Рендерим главную страницу, передавая в нее данные о пользователе и его правах
	c.HTML(http.StatusOK, "dashboard.html", gin.H{
		"Permissions": permissions,
		"User": gin.H{ // Передаем минимально необходимые данные для шаблона
			"Login": currentUser,
		},
	})
}
