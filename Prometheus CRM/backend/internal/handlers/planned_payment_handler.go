package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strings"
	"time"

	"github.com/Knetic/govaluate"
	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// GeneratePaymentPlanForContractHandler генерирует план платежей для договора на основе выбранной формы оплаты.
// Эта функция является ядром автоматического создания графика.
func GeneratePaymentPlanForContractHandler(c *gin.Context) {
	contractID := c.Param("id")
	var body struct {
		PaymentFormID uint `json:"paymentFormId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Не указана форма оплаты"})
		return
	}

	var contract models.Contract
	var paymentForm models.PaymentForm

	// 1. Находим договор и форму оплаты
	if err := config.DB.First(&contract, contractID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
		return
	}
	if err := config.DB.Preload("Installments").First(&paymentForm, body.PaymentFormID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Форма оплаты не найдена"})
		return
	}

	// 2. Начинаем транзакцию
	tx := config.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось начать транзакцию"})
		return
	}

	// 3. Удаляем старый план для этого договора
	if err := tx.Where("contract_id = ?", contract.ID).Delete(&models.PlannedPayment{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить старый план платежей"})
		return
	}

	// 4. Готовим параметры для вычисления формул
	parameters := make(map[string]interface{})
	parameters["Сумма"] = contract.TotalAmount
	parameters["Сумма с учётом скидки"] = contract.DiscountedAmount
	parameters["Скидка"] = contract.TotalAmount - contract.DiscountedAmount

	contractYear := contract.StartDate.Year()
	var newPayments []models.PlannedPayment

	// 5. Генерируем новые записи плана
	for _, installment := range paymentForm.Installments {
		expression, err := govaluate.NewEvaluableExpression(installment.Formula)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Ошибка в формуле '%s': %v", installment.Formula, err)})
			return
		}

		result, err := expression.Evaluate(parameters)
		if err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Не удалось вычислить формулу: %v", err)})
			return
		}

		amount, ok := result.(float64)
		if !ok {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Результат формулы не является числом"})
			return
		}

		// === ИСПРАВЛЕННАЯ ЛОГИКА ОПРЕДЕЛЕНИЯ ГОДА ===
		monthIndex := getMonthIndex(installment.Month)
		paymentMonth := time.Month(monthIndex + 1)

		year := contractYear
		// Если месяц платежа до начала условного учебного года (до июня),
		// то он относится к следующему календарному году (например, апрель 2026).
		// Летние предоплаты (июнь, июль, август) будут относиться к текущему году контракта (2025).
		if paymentMonth < time.June {
			year = contractYear + 1
		}

		paymentDate := time.Date(year, paymentMonth, installment.Day, 0, 0, 0, 0, time.UTC)
		// === КОНЕЦ ИСПРАВЛЕНИЯ ===

		newPayment := models.PlannedPayment{
			ContractID:    contract.ID,
			PaymentName:   fmt.Sprintf("Платеж за %s", installment.Month),
			PlannedAmount: amount,
			PaymentDate:   paymentDate,
		}
		newPayments = append(newPayments, newPayment)
	}

	// 6. Сохраняем все новые записи разом
	if len(newPayments) > 0 {
		if err := tx.Create(&newPayments).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить новый план платежей"})
			return
		}
	}

	// 7. Обновляем ID формы оплаты в самом договоре
	if err := tx.Model(&contract).Update("payment_form_id", paymentForm.ID).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить форму оплаты в договоре"})
		return
	}

	// 8. Завершаем транзакцию
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось завершить транзакцию"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "План платежей успешно сгенерирован"})
}

// PlannedPaymentListItem - структура для отображения данных в списке на фронтенде.
type PlannedPaymentListItem struct {
	models.PlannedPayment
	ContractNumber  string `json:"contractNumber"`
	StudentFullName string `json:"studentFullName"`
	StudentClass    string `json:"studentClass"`
}

// ListPlannedPaymentsHandler возвращает отфильтрованный и пагинированный список плановых платежей.
func ListPlannedPaymentsHandler(c *gin.Context) {
	var plannedPayments []PlannedPaymentListItem
	var totalRows int64

	query := config.DB.Table("planned_payments pp").
		Select(`
			pp.*,
			c.contract_number,
			(s.last_name || ' ' || s.first_name || ' ' || COALESCE(s.middle_name, '')) as student_full_name,
			(COALESCE(cl.grade_number::text, '') || ' ' || COALESCE(clit.liter_char, '')) as student_class
		`).
		Joins("LEFT JOIN contracts c ON pp.contract_id = c.id").
		Joins("LEFT JOIN students s ON c.student_id = s.id").
		Joins("LEFT JOIN classes cl ON s.class_id = cl.id").
		Joins("LEFT JOIN class_liters clit ON cl.liter_id = clit.id").
		Where("pp.deleted_at IS NULL")

		// ... (остальной код файла без изменений) ...
	if contractID := c.Query("contract_id"); contractID != "" {
		query = query.Where("pp.contract_id = ?", contractID)
	}

	if search := c.Query("search"); search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		query = query.Where(`LOWER(pp.comment) LIKE ? OR 
                             LOWER(c.contract_number) LIKE ? OR 
                             LOWER(s.last_name) LIKE ? OR 
                             LOWER(s.first_name) LIKE ? OR
                             LOWER(s.iin) LIKE ?`,
			searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
	}

	if c.Query("contract_id") != "" {
		query = query.Order("pp.payment_date ASC")
	} else {
		query = query.Order("pp.payment_date DESC")
	}

	if c.Query("all") == "true" {
		if err := query.Find(&plannedPayments).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch all planned payments"})
			return
		}
	} else {
		countQuery := query
		if err := countQuery.Count(&totalRows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count planned payments"})
			return
		}

		paginatedQuery := query.Scopes(Paginate(c))
		if err := paginatedQuery.Scan(&plannedPayments).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch planned payments"})
			return
		}
	}

	if plannedPayments == nil {
		plannedPayments = make([]PlannedPaymentListItem, 0)
	}

	if c.Query("all") == "true" {
		c.JSON(http.StatusOK, gin.H{"data": plannedPayments})
	} else {
		c.JSON(http.StatusOK, CreatePaginatedResponse(c, plannedPayments, totalRows))
	}
}

// GetPlannedPaymentHandler retrieves a single planned payment by its ID.
func GetPlannedPaymentHandler(c *gin.Context) {
	id := c.Param("id")
	var payment PlannedPaymentListItem

	err := config.DB.Table("planned_payments pp").
		Select(`
			pp.*,
			c.contract_number,
			(s.last_name || ' ' || s.first_name || ' ' || COALESCE(s.middle_name, '')) as student_full_name,
			(COALESCE(cl.grade_number::text, '') || ' ' || COALESCE(clit.liter_char, '')) as student_class
		`).
		Joins("LEFT JOIN contracts c ON pp.contract_id = c.id").
		Joins("LEFT JOIN students s ON c.student_id = s.id").
		Joins("LEFT JOIN classes cl ON s.class_id = cl.id").
		Joins("LEFT JOIN class_liters clit ON cl.liter_id = clit.id").
		Where("pp.id = ? AND pp.deleted_at IS NULL", id).
		First(&payment).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Платеж не найден"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить данные платежа"})
		return
	}

	c.JSON(http.StatusOK, payment)
}

// UpdatePlannedPaymentHandler позволяет вручную редактировать одну запись в плане платежей.
func UpdatePlannedPaymentHandler(c *gin.Context) {
	id := c.Param("id")
	var plannedPayment models.PlannedPayment
	if err := config.DB.First(&plannedPayment, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Платеж не найден"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	var input models.PlannedPayment
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := config.DB.Model(&plannedPayment).Updates(input).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not update planned payment"})
		return
	}

	c.JSON(http.StatusOK, plannedPayment)
}

// DeletePlannedPaymentHandler deletes a single planned payment entry.
func DeletePlannedPaymentHandler(c *gin.Context) {
	id := c.Param("id")
	if err := config.DB.Delete(&models.PlannedPayment{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete planned payment"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Платеж успешно удален"})
}

// ExportPlannedPaymentsHandler - обработчик для экспорта данных в Excel.
func ExportPlannedPaymentsHandler(c *gin.Context) {
	var plannedPayments []PlannedPaymentListItem

	query := config.DB.Table("planned_payments pp").
		Select(`
			pp.*,
			c.contract_number,
			(s.last_name || ' ' || s.first_name || ' ' || COALESCE(s.middle_name, '')) as student_full_name,
			(COALESCE(cl.grade_number::text, '') || ' ' || COALESCE(clit.liter_char, '')) as student_class
		`).
		Joins("LEFT JOIN contracts c ON pp.contract_id = c.id").
		Joins("LEFT JOIN students s ON c.student_id = s.id").
		Joins("LEFT JOIN classes cl ON s.class_id = cl.id").
		Joins("LEFT JOIN class_liters clit ON cl.liter_id = clit.id").
		Where("pp.deleted_at IS NULL").
		Order("pp.payment_date DESC")

	if search := c.Query("search"); search != "" {
		searchPattern := "%" + strings.ToLower(search) + "%"
		query = query.Where(`LOWER(pp.comment) LIKE ? OR LOWER(c.contract_number) LIKE ? OR LOWER(s.last_name) LIKE ? OR LOWER(s.first_name) LIKE ? OR LOWER(s.iin) LIKE ?`, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
	}
	if amountFrom := c.Query("amount_from"); amountFrom != "" {
		query = query.Where("pp.planned_amount >= ?", amountFrom)
	}
	if amountTo := c.Query("amount_to"); amountTo != "" {
		query = query.Where("pp.planned_amount <= ?", amountTo)
	}
	if date := c.Query("date"); date != "" {
		query = query.Where("pp.payment_date = ?", date)
	}
	if classID := c.Query("class_id"); classID != "" {
		query = query.Where("s.class_id = ?", classID)
	}
	if yearFrom := c.Query("year_from"); yearFrom != "" && c.Query("year_to") != "" {
		yearTo := c.Query("year_to")
		startDate := fmt.Sprintf("%s-09-01", yearFrom)
		endDate := fmt.Sprintf("%s-08-31", yearTo)
		query = query.Where("pp.payment_date BETWEEN ? AND ?", startDate, endDate)
	}

	if err := query.Scan(&plannedPayments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch data for export"})
		return
	}

	f := excelize.NewFile()
	sheetName := "План платежей"
	index, _ := f.NewSheet(sheetName)
	f.SetActiveSheet(index)

	headers := []string{"Номер договора", "ФИО ученика", "Класс", "Планируемая сумма", "Планируемая дата", "Наименование платежа", "Комментарий"}
	for i, header := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, header)
	}

	for i, p := range plannedPayments {
		row := i + 2
		f.SetCellValue(sheetName, fmt.Sprintf("A%d", row), p.ContractNumber)
		f.SetCellValue(sheetName, fmt.Sprintf("B%d", row), p.StudentFullName)
		f.SetCellValue(sheetName, fmt.Sprintf("C%d", row), p.StudentClass)
		f.SetCellValue(sheetName, fmt.Sprintf("D%d", row), p.PlannedAmount)
		if !p.PaymentDate.IsZero() {
			f.SetCellValue(sheetName, fmt.Sprintf("E%d", row), p.PaymentDate.Format("02.01.2006"))
		}
		f.SetCellValue(sheetName, fmt.Sprintf("F%d", row), p.PaymentName)
		f.SetCellValue(sheetName, fmt.Sprintf("G%d", row), p.Comment)
	}

	fileName := fmt.Sprintf("planned_payments_%s.xlsx", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", "attachment; filename="+fileName)
	if err := f.Write(c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write Excel file"})
	}
}
