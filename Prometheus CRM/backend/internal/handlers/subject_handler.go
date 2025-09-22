// crm/internal/handlers/subject_handler.go
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
)

// ListSubjectsHandler возвращает список всех учебных предметов.
func ListSubjectsHandler(c *gin.Context) {
	var subjects []models.Subject
	if err := config.DB.Order("name ASC").Find(&subjects).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch subjects"})
		return
	}

	if subjects == nil {
		subjects = make([]models.Subject, 0)
	}
	c.JSON(http.StatusOK, subjects)
}
