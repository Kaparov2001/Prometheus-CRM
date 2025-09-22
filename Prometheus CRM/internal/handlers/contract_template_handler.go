package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
)

// ListContractTemplatesHandler возвращает список шаблонов договоров
func ListContractTemplatesHandler(c *gin.Context) {
	var templates []models.ContractTemplate
	if err := config.DB.Find(&templates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch templates"})
		return
	}
	c.JSON(http.StatusOK, templates)
}

// CreateContractTemplateHandler создает новый шаблон договора
func CreateContractTemplateHandler(c *gin.Context) {
	// Используем FormFile для получения файла из multipart/form-data
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File is required"})
		return
	}

	// Создаем директорию, если она не существует
	uploadDir := "/app/static/uploads/contract_templates"
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		os.MkdirAll(uploadDir, os.ModePerm)
	}

	// Генерируем уникальное имя файла и сохраняем его
	newFileName := fmt.Sprintf("%d_%s", c.MustGet("user_id"), file.Filename)
	filePath := filepath.Join(uploadDir, newFileName)
	if err := c.SaveUploadedFile(file, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	template := models.ContractTemplate{
		Name:             c.PostForm("name"),
		SignatureType:    c.PostForm("signatureType"),
		Classification:   c.PostForm("classification"),
		Status:           c.PostForm("status"),
		FilePath:         "/static/uploads/contract_templates/" + newFileName,
		OriginalFileName: file.Filename,
		FileSize:         file.Size,
	}

	if err := config.DB.Create(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create template in DB"})
		return
	}
	c.JSON(http.StatusCreated, template)
}

// UpdateContractTemplateHandler обновляет существующий шаблон
func UpdateContractTemplateHandler(c *gin.Context) {
	id := c.Param("id")
	var template models.ContractTemplate
	if err := config.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}

	template.Name = c.PostForm("name")
	template.SignatureType = c.PostForm("signatureType")
	template.Classification = c.PostForm("classification")
	template.Status = c.PostForm("status")

	// Проверяем, был ли загружен новый файл
	file, err := c.FormFile("file")
	if err == nil {
		// Логика сохранения нового файла (аналогично Create)
		uploadDir := "/app/static/uploads/contract_templates"
		newFileName := fmt.Sprintf("%d_%s", c.MustGet("user_id"), file.Filename)
		filePath := filepath.Join(uploadDir, newFileName)
		if err := c.SaveUploadedFile(file, filePath); err == nil {
			// Удаляем старый файл, если он был
			if template.FilePath != "" {
				oldPath := filepath.Join("../..", template.FilePath)
				os.Remove(oldPath)
			}
			template.FilePath = "/static/uploads/contract_templates/" + newFileName
			template.OriginalFileName = file.Filename
			template.FileSize = file.Size
		}
	}

	if err := config.DB.Save(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update template"})
		return
	}
	c.JSON(http.StatusOK, template)
}

// DeleteContractTemplateHandler удаляет шаблон
func DeleteContractTemplateHandler(c *gin.Context) {
	id := c.Param("id")
	var template models.ContractTemplate
	if err := config.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}

	// Удаляем файл с диска
	if template.FilePath != "" {
		filePath := filepath.Join("../..", template.FilePath)
		os.Remove(filePath)
	}

	// Удаляем запись из БД
	if err := config.DB.Delete(&template).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete template from DB"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Template deleted successfully"})
}

// GetContractTemplateHandler для получения одного шаблона
func GetContractTemplateHandler(c *gin.Context) {
	id := c.Param("id")
	var template models.ContractTemplate
	if err := config.DB.First(&template, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}
	c.JSON(http.StatusOK, template)
}
