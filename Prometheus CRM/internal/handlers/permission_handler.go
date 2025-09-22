// FILE: internal/handlers/permission_handler.go
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
)

// PermissionInput определяет структуру для создания/обновления права.
type PermissionInput struct {
	Name        string `json:"name" binding:"required"`
	Description string `json:"description"`
	Category    string `json:"category" binding:"required"`
}

// ListPermissionsHandler возвращает список всех прав.
func ListPermissionsHandler(c *gin.Context) {
	var permissions []models.Permission
	// Группируем по категории, затем по имени для удобного отображения
	if err := config.DB.Order("category asc, name asc").Find(&permissions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch permissions"})
		return
	}
	if permissions == nil {
		permissions = make([]models.Permission, 0)
	}
	c.JSON(http.StatusOK, permissions)
}

// CreatePermissionHandler создает новое право.
func CreatePermissionHandler(c *gin.Context) {
	var input PermissionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	permission := models.Permission{
		Name:        input.Name,
		Description: input.Description,
		Category:    input.Category,
	}
	if err := config.DB.Create(&permission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create permission"})
		return
	}
	c.JSON(http.StatusCreated, permission)
}

// UpdatePermissionHandler обновляет существующее право.
func UpdatePermissionHandler(c *gin.Context) {
	id := c.Param("id")
	var permission models.Permission
	if err := config.DB.First(&permission, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Permission not found"})
		return
	}
	var input PermissionInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	permission.Name = input.Name
	permission.Description = input.Description
	permission.Category = input.Category

	if err := config.DB.Save(&permission).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update permission"})
		return
	}
	c.JSON(http.StatusOK, permission)
}

// DeletePermissionHandler удаляет право.
func DeletePermissionHandler(c *gin.Context) {
	id := c.Param("id")
	// Сначала проверяем, не связано ли это право с какой-либо ролью.
	var count int64
	config.DB.Table("role_permissions").Where("permission_id = ?", id).Count(&count)
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Cannot delete permission: it is assigned to one or more roles"})
		return
	}

	if result := config.DB.Delete(&models.Permission{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete permission"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Permission not found"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Permission deleted successfully"})
	}
}
