// FILE: crm/internal/handlers/payment_handler.go
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// CreatePaymentRequest определяет структуру для входящих данных.
type CreatePaymentRequest struct {
	ContractID    uint    `json:"contractId" binding:"required"`
	Amount        float64 `json:"amount" binding:"required"`
	PaymentDate   string  `json:"paymentDate" binding:"required"`
	PaymentFormID uint    `json:"payment_form_id" binding:"required"` // <-- Добавлено binding:"required"
	Comment       string  `json:"comment"`
}

// CreateActualPayment обрабатывает запрос на добавление нового платежа по договору.
func CreateActualPayment(c *gin.Context) {
	var req CreatePaymentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверные данные: " + err.Error()})
		return
	}

	// ### НАЧАЛО ИСПРАВЛЕНИЯ ###
	// Добавляем проверку, что ID формы оплаты не равен 0.
	if req.PaymentFormID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Не указана форма оплаты"})
		return
	}
	// ### КОНЕЦ ИСПРАВЛЕНИЯ ###

	paymentTime, err := time.Parse("2006-01-02", req.PaymentDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты. Используйте YYYY-MM-DD."})
		return
	}

	tx := config.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось начать транзакцию"})
		return
	}

	var contract models.Contract
	if err := tx.First(&contract, req.ContractID).Error; err != nil {
		tx.Rollback()
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при поиске договора"})
		return
	}

	payment := models.ContractPayment{
		ContractID:    req.ContractID,
		Amount:        req.Amount,
		PaymentDate:   paymentTime,
		PaymentFormID: req.PaymentFormID,
		Comment:       req.Comment,
	}

	if err := tx.Create(&payment).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить платеж"})
		return
	}

	updateExpr := gorm.Expr("paid_amount + ?", req.Amount)
	if err := tx.Model(&contract).Update("paid_amount", updateExpr).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить сумму в договоре"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось подтвердить транзакцию"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Оплата успешно добавлена"})
}
