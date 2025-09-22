// internal/handlers/payment_form_handler.go

package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PaymentFormInput определяет структуру для создания и обновления формы оплаты.
type PaymentFormInput struct {
	Name              string                      `json:"name" binding:"required"`
	InstallmentsCount int                         `json:"installments_count" binding:"required,min=1"`
	Installments      []models.PaymentInstallment `json:"installments" binding:"required,dive"`
}

// ListPaymentFormsHandler возвращает список всех форм оплаты.
func ListPaymentFormsHandler(c *gin.Context) {
	var forms []models.PaymentForm
	var totalRows int64

	// Создаем базовый запрос
	query := config.DB.Model(&models.PaymentForm{})

	// Применяем фильтр по имени, если он есть
	if name := c.Query("name"); name != "" {
		query = query.Where("name ILIKE ?", "%"+name+"%")
	}

	// Применяем общий поиск, если он есть
	if search := c.Query("search"); search != "" {
		query = query.Where("name ILIKE ?", "%"+search+"%")
	}

	// Считаем общее количество строк (с учетом фильтров)
	if err := query.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not count payment forms"})
		return
	}

	// Применяем пагинацию и сортировку
	paginatedQuery := query.Scopes(Paginate(c)).Order("name")

	if err := paginatedQuery.Find(&forms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch payment forms"})
		return
	}

	if forms == nil {
		forms = make([]models.PaymentForm, 0)
	}

	// Создаем и отправляем пагинированный ответ
	paginatedResponse := CreatePaginatedResponse(c, forms, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// GetPaymentFormHandler получает одну форму оплаты по ID вместе с ее частями.
func GetPaymentFormHandler(c *gin.Context) {
	id := c.Param("id")
	var form models.PaymentForm
	if err := config.DB.Preload("Installments").First(&form, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment form not found"})
		return
	}
	c.JSON(http.StatusOK, form)
}

// CreatePaymentFormHandler создает новую форму оплаты.
func CreatePaymentFormHandler(c *gin.Context) {
	var input PaymentFormInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	form := models.PaymentForm{
		Name:              input.Name,
		InstallmentsCount: input.InstallmentsCount,
		Installments:      input.Installments, // Сохраняем все части с их формулами
	}

	if err := config.DB.Create(&form).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment form: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, form)
}

// UpdatePaymentFormHandler обновляет существующую форму оплаты.
func UpdatePaymentFormHandler(c *gin.Context) {
	id := c.Param("id")
	var input PaymentFormInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	err := config.DB.Transaction(func(tx *gorm.DB) error {
		var form models.PaymentForm
		if err := tx.First(&form, id).Error; err != nil {
			return err // Форма не найдена
		}

		// Обновляем основные поля формы
		form.Name = input.Name
		form.InstallmentsCount = input.InstallmentsCount
		if err := tx.Save(&form).Error; err != nil {
			return err
		}

		// Удаляем старые платежи
		if err := tx.Where("payment_form_id = ?", id).Delete(&models.PaymentInstallment{}).Error; err != nil {
			return err
		}

		// Создаем новые платежи с их индивидуальными формулами
		for _, inst := range input.Installments {
			inst.PaymentFormID = form.ID
			if err := tx.Create(&inst).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payment form: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Payment form updated successfully"})
}

// DeletePaymentFormHandler удаляет форму оплаты.
func DeletePaymentFormHandler(c *gin.Context) {
	id := c.Param("id")
	// Транзакция не обязательна, так как ON DELETE CASCADE справится,
	// но для консистентности можно оставить.
	if result := config.DB.Delete(&models.PaymentForm{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete payment form"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment form not found"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Payment form deleted successfully"})
	}
}
