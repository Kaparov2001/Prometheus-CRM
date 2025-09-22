// prometheus-crm/internal/handlers/webhook_handler.go
package handlers

import (
	"log"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"time"

	"github.com/gin-gonic/gin"
)

// Webhook1CInput определяет структуру входящих данных, которые мы ожидаем от 1С.
type Webhook1CInput struct {
	ContractNumber string  `json:"contractNumber" binding:"required"`
	Amount         float64 `json:"amount" binding:"required"`
	PaymentDate    string  `json:"paymentDate" binding:"required"` // Ожидаем дату в формате "2006-01-02"
	ExternalID     string  `json:"externalId"`                     // Уникальный ID транзакции из 1С, не обязателен, но желателен
}

// Webhook1CHandler обрабатывает входящие данные о платежах от 1С.
func Webhook1CHandler(c *gin.Context) {
	var input Webhook1CInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input: " + err.Error()})
		return
	}

	var contract models.Contract
	if err := config.DB.Where("contract_number = ?", input.ContractNumber).First(&contract).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор с таким номером не найден"})
		return
	}

	paymentTime, err := time.Parse("2006-01-02", input.PaymentDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты. Ожидается YYYY-MM-DD"})
		return
	}

	// --- ЛОГИКА АВТОМАТИЧЕСКОЙ СКИДКИ ---
	septemberFirst := time.Date(paymentTime.Year(), 9, 1, 0, 0, 0, 0, paymentTime.Location())

	var totalPaid float64
	config.DB.Model(&models.PlannedPayment{}).
		Where("contract_id = ?", contract.ID).
		Select("coalesce(sum(paid_amount), 0)").
		Row().Scan(&totalPaid)

	if paymentTime.Before(septemberFirst) && (totalPaid+input.Amount) >= contract.TotalAmount {
		// ИСПРАВЛЕНИЕ: Проверяем, что скидка еще не была применена (процент равен 0).
		if contract.DiscountPercentage == 0 {
			log.Printf("Применяем скидку 5%% для договора %s", contract.ContractNumber)

			// ИСПРАВЛЕНИЕ: Используем правильные поля `DiscountPercentage` и `DiscountedAmount`.
			newAmountWithDiscount := contract.TotalAmount * 0.95
			contract.DiscountPercentage = 5.0
			contract.DiscountedAmount = newAmountWithDiscount
			config.DB.Save(&contract)

			// Обнуляем все будущие НЕОПЛАЧЕННЫЕ платежи в плане.
			config.DB.Model(&models.PlannedPayment{}).
				Where("contract_id = ? AND status != ?", contract.ID, "Оплачен").
				Updates(map[string]interface{}{"planned_amount": 0, "status": "Скорректирован (скидка)"})
		}
	}

	// --- ЛОГИКА РАСПРЕДЕЛЕНИЯ ПЛАТЕЖА ---
	// ВАЖНО: Этот блок需要реализовать дополнительно.
	// Он должен находить неоплаченные строки в `planned_payments` и применять к ним `input.Amount`.
	log.Printf("Требуется реализовать логику распределения платежа %.2f для договора %s", input.Amount, contract.ContractNumber)

	c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "Платеж успешно обработан"})
}
