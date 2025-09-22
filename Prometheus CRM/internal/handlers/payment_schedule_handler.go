// prometheus-crm/internal/handlers/payment_schedule_handler.go
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"time"

	"github.com/Knetic/govaluate"
	"github.com/gin-gonic/gin"
)

// Payment представляет один платеж в сгенерированном графике.
type Payment struct {
	PaymentDate string  `json:"paymentDate"`
	Amount      float64 `json:"amount"`
	Status      string  `json:"status"`
}

// GenerateScheduleHandler генерирует график платежей на основе договора и его формы оплаты.
func GenerateScheduleHandler(c *gin.Context) {
	contractID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID договора"})
		return
	}

	var contract models.Contract
	// В модели имя связи остаётся PaymentForm, поле внешнего ключа — PaymentFormId.
	if err := config.DB.Preload("PaymentForm.Installments").First(&contract, contractID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
		return
	}

	// Правильное имя поля: PaymentFormId (*uint), а не PaymentFormID.
	if contract.PaymentFormId == nil || len(contract.PaymentForm.Installments) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Для договора не выбрана форма оплаты или она пуста"})
		return
	}

	var schedule []Payment

	// StartDate — указатель: аккуратно работаем с nil.
	contractYear := time.Now().Year()
	if contract.StartDate != nil {
		contractYear = contract.StartDate.Year()
	}

	// Готовим параметры для формул один раз.
	parameters := make(map[string]interface{})
	parameters["Сумма"] = contract.TotalAmount
	parameters["Сумма с учётом скидки"] = contract.DiscountedAmount
	parameters["Скидка"] = contract.TotalAmount - contract.DiscountedAmount

	for _, installment := range contract.PaymentForm.Installments {
		expr, err := govaluate.NewEvaluableExpression(installment.Formula)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Ошибка в формуле платежа: " + installment.Formula})
			return
		}

		result, err := expr.Evaluate(parameters)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Не удалось вычислить формулу: " + installment.Formula})
			return
		}

		amount, ok := result.(float64)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Результат формулы не является числом"})
			return
		}

		monthIndex := getMonthIndex(installment.Month) // функция из handler_utils.go
		paymentDate := time.Date(contractYear, time.Month(monthIndex+1), installment.Day, 0, 0, 0, 0, time.UTC)

		// Если дата платежа попадает раньше даты начала договора — переносим на следующий год.
		if contract.StartDate != nil && paymentDate.Before(*contract.StartDate) {
			paymentDate = paymentDate.AddDate(1, 0, 0)
		}

		schedule = append(schedule, Payment{
			PaymentDate: paymentDate.Format("02.01.2006"),
			Amount:      amount,
			Status:      "Ожидается",
		})
	}

	c.JSON(http.StatusOK, schedule)
}
