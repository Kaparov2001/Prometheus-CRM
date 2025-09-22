package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
)

// GetTuitionFeesHandler retrieves all tuition fee records.
func GetTuitionFeesHandler(c *gin.Context) {
	var fees []models.TuitionFee
	if err := config.DB.Order("grade asc").Find(&fees).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch tuition fees"})
		return
	}
	c.JSON(http.StatusOK, fees)
}

// UpdateTuitionFeesHandler updates multiple tuition fee records.
func UpdateTuitionFeesHandler(c *gin.Context) {
	var fees []models.TuitionFee
	if err := c.ShouldBindJSON(&fees); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid data provided"})
		return
	}

	tx := config.DB.Begin()
	for _, fee := range fees {
		if err := tx.Model(&models.TuitionFee{}).Where("grade = ?", fee.Grade).Updates(models.TuitionFee{CostFor2023: fee.CostFor2023, CurrentCost: fee.CurrentCost}).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update fees"})
			return
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction commit error"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Tuition fees updated successfully"})
}
