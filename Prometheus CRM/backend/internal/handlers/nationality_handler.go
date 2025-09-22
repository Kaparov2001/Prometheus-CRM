// FILE: internal/handlers/nationality_handler.go
// Описание: Новый файл с обработчиками для CRUD-операций над национальностями.
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
)

// NationalityInput определяет структуру для создания/обновления национальности.
type NationalityInput struct {
	Name string `json:"name" binding:"required"`
}

// ListNationalitiesHandler возвращает список всех национальностей.
// Supports `?all=true` for dropdowns.
func ListNationalitiesHandler(c *gin.Context) {
	var nationalities []models.Nationality
	query := config.DB.Order("name asc")

	if c.Query("all") == "true" {
		if err := query.Find(&nationalities).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch nationalities"})
			return
		}
		c.JSON(http.StatusOK, nationalities)
		return
	}

	// Default to paginated response (though for a short list like nationalities, it might not be strictly necessary)
	var totalRows int64
	config.DB.Model(&models.Nationality{}).Count(&totalRows)

	if err := query.Scopes(Paginate(c)).Find(&nationalities).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch nationalities"})
		return
	}

	if nationalities == nil {
		nationalities = make([]models.Nationality, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, nationalities, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// GetNationalityHandler получает одну национальность по ID.
func GetNationalityHandler(c *gin.Context) {
	id := c.Param("id")
	var nationality models.Nationality
	if err := config.DB.First(&nationality, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Nationality not found"})
		return
	}
	c.JSON(http.StatusOK, nationality)
}

// CreateNationalityHandler создает новую национальность.
func CreateNationalityHandler(c *gin.Context) {
	var input NationalityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	nationality := models.Nationality{Name: input.Name}
	if err := config.DB.Create(&nationality).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create nationality"})
		return
	}
	c.JSON(http.StatusCreated, nationality)
}

// UpdateNationalityHandler обновляет существующую национальность.
func UpdateNationalityHandler(c *gin.Context) {
	id := c.Param("id")
	var nationality models.Nationality
	if err := config.DB.First(&nationality, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Nationality not found"})
		return
	}
	var input NationalityInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	nationality.Name = input.Name
	if err := config.DB.Save(&nationality).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update nationality"})
		return
	}
	c.JSON(http.StatusOK, nationality)
}

// DeleteNationalityHandler удаляет национальность.
func DeleteNationalityHandler(c *gin.Context) {
	id := c.Param("id")
	var count int64
	config.DB.Model(&models.Student{}).Where("nationality_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Cannot delete nationality: it is assigned to students"})
		return
	}
	if result := config.DB.Delete(&models.Nationality{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete nationality"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Nationality not found"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Nationality deleted successfully"})
	}
}
