// crm/internal/handlers/payment_fact_handler.go
package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PaymentFactInput - структура для приема данных от клиента.
// Используем string для PaymentDate, чтобы избежать ошибки автоматического парсинга.
type PaymentFactInput struct {
	ContractID    uint    `json:"contractId"`
	Amount        float64 `json:"amount"`
	Commission    float64 `json:"commission"`
	PaymentDate   string  `json:"paymentDate"`
	AcademicYear  string  `json:"academicYear"`
	PaymentName   string  `json:"paymentName"`
	PaymentMethod string  `json:"paymentMethod"`
}

// ИЗМЕНЕНИЕ: Новая структура ответа с явными полями в PascalCase для совместимости с JS.
type PaymentFactResponse struct {
	ID              uint      `json:"ID"`
	ContractID      uint      `json:"ContractID"`
	Amount          float64   `json:"Amount"`
	Commission      float64   `json:"Commission"`
	PaymentDate     time.Time `json:"PaymentDate"`
	AcademicYear    string    `json:"AcademicYear"`
	PaymentName     string    `json:"PaymentName"`
	PaymentMethod   string    `json:"PaymentMethod"`
	ContractNumber  string    `json:"ContractNumber"`
	StudentFullName string    `json:"StudentFullName"`
}

// ListPaymentFacts возвращает список фактических платежей с пагинацией и поиском
func ListPaymentFacts(c *gin.Context) {
	var results []PaymentFactResponse
	var totalRows int64

	// Базовый запрос с объединением таблиц
	baseQuery := config.DB.Table("payment_facts pf").
		Joins("LEFT JOIN contracts c ON pf.contract_id = c.id").
		Joins("LEFT JOIN students s ON c.student_id = s.id").
		Where("pf.deleted_at IS NULL")

	// Поиск по номеру договора, ФИО или ИИН ученика
	searchQuery := c.Query("search")
	if searchQuery != "" {
		searchPattern := "%" + strings.ToLower(searchQuery) + "%"
		baseQuery = baseQuery.Where(
			"LOWER(c.contract_number) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(s.first_name) LIKE ? OR LOWER(s.iin) LIKE ?",
			searchPattern, searchPattern, searchPattern, searchPattern)
	}

	// Считаем общее количество строк для пагинации
	baseQuery.Count(&totalRows)

	// ИЗМЕНЕНИЕ: Выбираем поля с псевдонимами в PascalCase
	finalQuery := baseQuery.Select(`
		pf.id AS "ID", 
		pf.contract_id AS "ContractID",
		pf.amount AS "Amount",
		pf.commission AS "Commission",
		pf.payment_date AS "PaymentDate",
		pf.academic_year AS "AcademicYear",
		pf.payment_name AS "PaymentName",
		pf.payment_method AS "PaymentMethod",
		c.contract_number AS "ContractNumber", 
		(s.last_name || ' ' || s.first_name) as "StudentFullName"
	`).
		Scopes(Paginate(c)).
		Order("pf.payment_date DESC")

	if err := finalQuery.Scan(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch payments"})
		return
	}

	c.JSON(http.StatusOK, CreatePaginatedResponse(c, results, totalRows))
}

// GetPaymentFact возвращает один платеж по ID
func GetPaymentFact(c *gin.Context) {
	id := c.Param("id")
	var result PaymentFactResponse

	// ИЗМЕНЕНИЕ: Выбираем поля с псевдонимами в PascalCase
	if err := config.DB.Table("payment_facts pf").
		Joins("LEFT JOIN contracts c ON pf.contract_id = c.id").
		Joins("LEFT JOIN students s ON c.student_id = s.id").
		Where("pf.id = ? AND pf.deleted_at IS NULL", id).
		Select(`
			pf.id AS "ID", 
			pf.contract_id AS "ContractID",
			pf.amount AS "Amount",
			pf.commission AS "Commission",
			pf.payment_date AS "PaymentDate",
			pf.academic_year AS "AcademicYear",
			pf.payment_name AS "PaymentName",
			pf.payment_method AS "PaymentMethod",
			c.contract_number AS "ContractNumber", 
			(s.last_name || ' ' || s.first_name) as "StudentFullName"
		`).
		First(&result).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		}
		return
	}

	c.JSON(http.StatusOK, result)
}

// CreatePaymentFact создает новый фактический платеж
func CreatePaymentFact(c *gin.Context) {
	var input PaymentFactInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// ВАЖНО: Проверяем, что ID договора был передан из фронтенда
	if input.ContractID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Не указан ID договора (contractId)"})
		return
	}

	paymentDate, err := time.Parse("2006-01-02", input.PaymentDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты. Ожидается YYYY-MM-DD."})
		return
	}

	payment := models.PaymentFact{
		ContractID:    input.ContractID,
		Amount:        input.Amount,
		Commission:    input.Commission,
		PaymentDate:   paymentDate,
		AcademicYear:  input.AcademicYear,
		PaymentName:   input.PaymentName,
		PaymentMethod: input.PaymentMethod,
	}

	if err := config.DB.Create(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payment"})
		return
	}
	c.JSON(http.StatusCreated, payment)
}

// UpdatePaymentFact обновляет существующий платеж
func UpdatePaymentFact(c *gin.Context) {
	id := c.Param("id")
	var payment models.PaymentFact
	if err := config.DB.First(&payment, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Payment not found"})
		return
	}

	var input PaymentFactInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	paymentDate, err := time.Parse("2006-01-02", input.PaymentDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Неверный формат даты. Ожидается YYYY-MM-DD."})
		return
	}

	// Обновляем поля существующей записи
	payment.Amount = input.Amount
	payment.Commission = input.Commission
	payment.PaymentDate = paymentDate
	payment.AcademicYear = input.AcademicYear
	payment.PaymentName = input.PaymentName
	payment.PaymentMethod = input.PaymentMethod
	// ContractID не меняем при обновлении, но если нужно, можно добавить:
	if input.ContractID != 0 {
		payment.ContractID = input.ContractID
	}

	if err := config.DB.Save(&payment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update payment"})
		return
	}
	c.JSON(http.StatusOK, payment)
}

// DeletePaymentFact удаляет платеж (мягкое удаление)
func DeletePaymentFact(c *gin.Context) {
	id := c.Param("id")
	// GORM автоматически выполнит мягкое удаление (установит deleted_at)
	if err := config.DB.Delete(&models.PaymentFact{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete payment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Payment deleted"})
}
