package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListRolesHandler fetches all roles with their associated permissions.
func ListRolesHandler(c *gin.Context) {
	var roles []models.Role

	// Preload permissions to avoid N+1 queries
	query := config.DB.Preload("Permissions").Order("name")

	if c.Query("all") == "true" {
		if err := query.Find(&roles).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch roles"})
			return
		}
		if roles == nil {
			roles = make([]models.Role, 0)
		}
		c.JSON(http.StatusOK, roles)
		return
	}

	var totalRows int64
	config.DB.Model(&models.Role{}).Count(&totalRows)

	if err := query.Scopes(Paginate(c)).Find(&roles).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch roles"})
		return
	}

	if roles == nil {
		roles = make([]models.Role, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, roles, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// CreateRoleHandler handles the creation of a new role.
func CreateRoleHandler(c *gin.Context) {
	var input struct {
		Name          string `json:"name" binding:"required"`
		Description   string `json:"description"`
		PermissionIDs []uint `json:"permissionIds"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role := models.Role{
		Name:        input.Name,
		Description: input.Description,
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&role).Error; err != nil {
			return err
		}

		if len(input.PermissionIDs) > 0 {
			var permissions []models.Permission
			if err := tx.Where("id IN ?", input.PermissionIDs).Find(&permissions).Error; err != nil {
				return err
			}
			if err := tx.Model(&role).Association("Permissions").Replace(permissions); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create role: " + err.Error()})
		return
	}
	c.JSON(http.StatusCreated, role)
}

// GetRoleHandler fetches a single role by its ID.
func GetRoleHandler(c *gin.Context) {
	id := c.Param("id")
	var role models.Role
	if err := config.DB.Preload("Permissions").First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}
	c.JSON(http.StatusOK, role)
}

// UpdateRoleHandler updates a role's name and permissions.
func UpdateRoleHandler(c *gin.Context) {
	id := c.Param("id")
	var role models.Role
	if err := config.DB.First(&role, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
		return
	}

	var input struct {
		Name          string `json:"name" binding:"required"`
		Description   string `json:"description"`
		PermissionIDs []uint `json:"permissionIds"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	role.Name = input.Name
	role.Description = input.Description

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&role).Error; err != nil {
			return err
		}

		var permissions []models.Permission
		if len(input.PermissionIDs) > 0 {
			if err := tx.Where("id IN ?", input.PermissionIDs).Find(&permissions).Error; err != nil {
				return err
			}
		}
		// Заменяем старые права на новые (или пустые, если ничего не передано)
		return tx.Model(&role).Association("Permissions").Replace(permissions)
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update role: " + err.Error()})
		return
	}

	// --- НАЧАЛО ИСПРАВЛЕНИЯ: Сброс кэша для всех пользователей с этой ролью ---
	if config.RDB != nil {
		go func() {
			var userIDs []uint
			config.DB.Table("user_roles").Where("role_id = ?", role.ID).Pluck("user_id", &userIDs)

			if len(userIDs) > 0 {
				slog.Info("Invalidating cache for users after role update", "role", role.Name, "user_count", len(userIDs))
				for _, userID := range userIDs {
					// ИСПРАВЛЕНО: Используем новый, правильный ключ "data"
					cacheKey := fmt.Sprintf("user:%d:data", userID)
					if err := config.RDB.Del(config.Ctx, cacheKey).Err(); err != nil {
						slog.Warn("Failed to invalidate cache for user", "error", err, "user_id", userID)
					}
				}
				slog.Info("Cache invalidation for affected users completed.", "role", role.Name)
			}
		}()
	}
	// --- КОНЕЦ ИСПРАВЛЕНИЯ ---

	c.JSON(http.StatusOK, role)
}

// DeleteRoleHandler deletes a role by its ID.
func DeleteRoleHandler(c *gin.Context) {
	id := c.Param("id")
	if result := config.DB.Delete(&models.Role{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete role"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Role not found"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Role deleted successfully"})
	}
}
