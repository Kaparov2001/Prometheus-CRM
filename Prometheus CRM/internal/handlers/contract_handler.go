// prometheus-crm/internal/handlers/contract_handler.go
package handlers

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Knetic/govaluate"
	"github.com/divan/num2words"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- Структуры для входящих данных и ответов по КОНТРАКТАМ ---

type ContractInput struct {
	StudentID          uint    `json:"studentId" binding:"required"`
	TemplateID         *uint   `json:"templateId"`
	PaymentFormID      *uint   `json:"paymentFormId"`
	ContractNumber     string  `json:"contractNumber"`
	SigningMethod      string  `json:"signingMethod"`
	StartDate          string  `json:"startDate"`
	EndDate            string  `json:"endDate"`
	TotalAmount        float64 `json:"totalAmount"`
	DiscountPercentage float64 `json:"discountPercentage"`
	DiscountedAmount   float64 `json:"discountedAmount"`
}

// StudentContractResponse - это структура для ответа API, которая включает данные студента и его договора (если он есть).
type StudentContractResponse struct {
	StudentID        uint       `json:"studentId"`
	StudentFullName  string     `json:"studentFullName"`
	StudentClass     string     `json:"studentClass"`
	ContractID       *uint      `json:"id"`             // Может быть null, если договора нет
	ContractNumber   *string    `json:"contractNumber"` // Может быть null
	StartDate        *time.Time `json:"startDate"`      // Может быть null
	EndDate          *time.Time `json:"endDate"`        // Может быть null
	TotalAmount      *float64   `json:"totalAmount"`
	DiscountedAmount *float64   `json:"discountedAmount"`
	PaymentFormName  *string    `json:"paymentFormName"`
	ManagerFullName  *string    `json:"managerFullName"`
}

// PaymentPreview представляет один платеж в сгенерированном графике.
type PaymentPreview struct {
	PaymentDate string  `json:"paymentDate"`
	Amount      float64 `json:"amount"`
}

// SimpleContractResponse - это структура для ответа API для выбора договора в модальном окне.
type SimpleContractResponse struct {
	ContractID      uint   `json:"id"`
	ContractNumber  string `json:"contractNumber"`
	StudentFullName string `json:"studentFullName"`
	StudentClass    string `json:"studentClass"`
}

var (
	templateCache   = make(map[uint][]byte)
	cacheMutex      sync.RWMutex
	allPlaceholders = []string{
		"{contractNumber}", "{iinParent}", "{childFullName}", "{dateOfBirthChild}",
		"{iinChild}", "{homeAddressChild}", "{fioParentForDogovor}", "{docNumParent}",
		"{dateOfIssueDocuemntParent}", "{childPhoneNumberParentForDogovor}",
		"{contributionOfMoney}", "{contributionOfMoneyText}", "{contributionOfMoneyTextKz}",
		"{dateAcademicStartLearn}", "{dateAcademicEndLearn}", "{contractSum}",
		"{contractSumText}", "{contractSumTextKZ}", "{ContractSumWithDiscount}",
		"{ContractSumWithDiscountText}", "{ContractSumWithDiscountTextKz}",
		"{paymentPlansPrometheusKZ}", "{paymentPlansPrometheus}", "{SignDate}",
	}
)

// --- Обработчики для КОНТРАКТОВ ---

// ListContractsHandler теперь возвращает список ВСЕХ учеников, присоединяя к ним данные по их договорам.
func ListContractsHandler(c *gin.Context) {
	var results []StudentContractResponse
	var totalRows int64

	// Базовый запрос
	baseQuery := config.DB.Table("students").
		Joins("LEFT JOIN contracts c ON students.id = c.student_id AND c.deleted_at IS NULL").
		Where("students.deleted_at IS NULL AND students.is_studying = TRUE")

	// Поиск
	searchQuery := c.Query("search")
	if searchQuery != "" {
		searchPattern := "%" + strings.ToLower(searchQuery) + "%"
		baseQuery = baseQuery.Where(
			"LOWER(students.last_name) LIKE ? OR LOWER(students.first_name) LIKE ? OR LOWER(c.contract_number) LIKE ?",
			searchPattern, searchPattern, searchPattern,
		)
	}

	// Подсчёт
	if err := baseQuery.Model(&models.Student{}).Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось посчитать учеников"})
		return
	}

	// Выборка
	finalQuery := baseQuery.Select(`
		students.id as student_id,
		(students.last_name || ' ' || students.first_name) as student_full_name,
		(COALESCE(classes.grade_number::text, '') || ' ' || COALESCE(class_liters.liter_char, '')) as student_class,
		c.id as contract_id, c.contract_number, c.start_date, c.end_date,
		c.total_amount, c.discounted_amount,
		pf.name as payment_form_name,
		u.full_name as manager_full_name
	`).
		Joins("LEFT JOIN users u ON u.id = c.manager_id").
		Joins("LEFT JOIN classes ON students.class_id = classes.id").
		Joins("LEFT JOIN class_liters ON classes.liter_id = class_liters.id").
		Joins("LEFT JOIN payment_forms pf ON c.payment_form_id = pf.id").
		Scopes(Paginate(c)).
		Order("students.last_name, students.first_name")

	if err := finalQuery.Scan(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось загрузить список учеников и договоров: " + err.Error()})
		return
	}

	if results == nil {
		results = make([]StudentContractResponse, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, results, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// ListAllContractsForPlanHandler возвращает список всех существующих договоров для выбора при создании плана.
func ListAllContractsForPlanHandler(c *gin.Context) {
	var results []SimpleContractResponse
	var totalRows int64

	baseQuery := config.DB.Table("contracts").
		Joins("JOIN students ON students.id = contracts.student_id").
		Where("contracts.deleted_at IS NULL AND students.deleted_at IS NULL")

	// Поиск
	searchQuery := c.Query("search")
	if searchQuery != "" {
		searchPattern := "%" + strings.ToLower(searchQuery) + "%"
		baseQuery = baseQuery.Where(
			"LOWER(students.last_name) LIKE ? OR LOWER(students.first_name) LIKE ? OR LOWER(contracts.contract_number) LIKE ?",
			searchPattern, searchPattern, searchPattern,
		)
	}

	if classID := c.Query("class_id"); classID != "" {
		baseQuery = baseQuery.Where("students.class_id = ?", classID)
	}

	if err := baseQuery.Model(&models.Contract{}).Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось посчитать договоры"})
		return
	}

	finalQuery := baseQuery.Select(`
        contracts.id,
        contracts.contract_number,
        (students.last_name || ' ' || students.first_name) as student_full_name,
        (COALESCE(classes.grade_number::text, '') || ' ' || COALESCE(class_liters.liter_char, '')) as student_class
    `).
		Joins("LEFT JOIN classes ON students.class_id = classes.id").
		Joins("LEFT JOIN class_liters ON classes.liter_id = class_liters.id").
		Scopes(Paginate(c)).
		Order("students.last_name, students.first_name")

	if err := finalQuery.Scan(&results).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось загрузить список договоров: " + err.Error()})
		return
	}

	if results == nil {
		results = make([]SimpleContractResponse, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, results, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// CreateContractHandler создает новый договор для ученика с автоматическим расчетом ключевых полей.
func CreateContractHandler(c *gin.Context) {
	var input ContractInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	var student models.Student
	if err := config.DB.Preload("Class").First(&student, input.StudentID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ученик не найден"})
		return
	}
	if student.Class == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ученику не присвоен класс, невозможно определить сумму договора"})
		return
	}

	// --- АВТОМАТИЧЕСКИЙ РАСЧЕТ СУММЫ ДОГОВОРА ПО "Стоимость обучения" ---
	totalAmount, usedYear, err := computeTuitionAmountForStudent(&student)
	if err != nil {
		// Фолбэк: по классу (как раньше)
		if student.Class.GradeNumber == 0 {
			totalAmount = 3036000.00
		} else {
			totalAmount = 3610000.00
		}
	}
	_ = usedYear

	// --- СКИДКА (родственники) ---
	var calculatedDiscount float64
	switch student.FamilyOrder {
	case 1:
		calculatedDiscount = 5.0
	case 2, 3, 4, 5:
		calculatedDiscount = 10.0
	default:
		calculatedDiscount = 0.0
	}
	discountedAmount := totalAmount * (1 - (calculatedDiscount / 100))

	// --- ДАТЫ ---
	startDate := time.Now()
	endDate := startDate.AddDate(1, 0, -1)

	// --- МЕНЕДЖЕР ---
	managerID, err := getUserIDFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Не удалось определить пользователя (manager_id)"})
		return
	}

	// --- ГЕНЕРАЦИЯ PDF (если выбран шаблон) ---
	var pdfBytes []byte
	if input.TemplateID != nil && *input.TemplateID > 0 {
		var template models.ContractTemplate
		if err := config.DB.First(&template, *input.TemplateID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Шаблон договора не найден"})
			return
		}
		templateBytes, err := getTemplateBytes(*input.TemplateID, template.FilePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка чтения шаблона"})
			return
		}

		// данные для плейсхолдеров
		tempInput := &ContractInput{
			TotalAmount:      totalAmount,
			DiscountedAmount: discountedAmount,
		}

		repl, err := buildReplacements(&student, tempInput, "", startDate, "")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка подготовки данных для договора: " + err.Error()})
			return
		}
		repl = fillMissingPlaceholders(repl)

		filledDocx, err := replacePlaceholders(templateBytes, repl)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка замены плейсхолдеров: " + err.Error()})
			return
		}
		pdfBytes, err = convertDocxToPdf(filledDocx)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка конвертации в PDF: " + err.Error()})
			return
		}
	}

	// --- СОЗДАНИЕ ДОГОВОРА С УНИКАЛЬНОЙ НУМЕРАЦИЕЙ ---
	contract, err := createContractWithUniqueNumber(&student, managerID, input.PaymentFormID, totalAmount, calculatedDiscount, discountedAmount, startDate, endDate, pdfBytes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сохранения договора: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, contract)
}

func GetContractHandler(c *gin.Context) {
	id := c.Param("id")
	var contract models.Contract
	if err := config.DB.Preload("Student").First(&contract, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка при получении договора"})
		return
	}
	c.JSON(http.StatusOK, contract)
}

func UpdateContractHandler(c *gin.Context) {
	id := c.Param("id")
	var contract models.Contract
	if err := config.DB.First(&contract, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор для обновления не найден"})
		return
	}

	var input ContractInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	startDate, _ := time.ParseInLocation("2006-01-02", input.StartDate, time.Local)
	endDate, _ := time.ParseInLocation("2006-01-02", input.EndDate, time.Local)
	discountedAmount := input.TotalAmount * (1 - (input.DiscountPercentage / 100))

	// поля с типом *time.Time
	contract.StartDate = &startDate
	contract.EndDate = &endDate

	contract.SigningMethod = input.SigningMethod
	contract.TotalAmount = input.TotalAmount
	contract.DiscountPercentage = input.DiscountPercentage
	contract.DiscountedAmount = discountedAmount

	// правильное имя поля в модели: PaymentFormId
	if input.PaymentFormID != nil {
		contract.PaymentFormId = input.PaymentFormID
	}

	if err := config.DB.Save(&contract).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить договор: " + err.Error()})
		return
	}

	// Пересчёт семейных скидок по связанным детям
	go UpdateFamilyDiscounts([]uint{contract.StudentID})

	c.JSON(http.StatusOK, contract)
}

func DeleteContractHandler(c *gin.Context) {
	id := c.Param("id")
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("contract_id = ?", id).Delete(&models.PlannedPayment{}).Error; err != nil {
			return err
		}
		result := tx.Where("id = ?", id).Delete(&models.Contract{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return fmt.Errorf("договор не найден")
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить договор: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Договор успешно удален"})
}

func DownloadContractHandler(c *gin.Context) {
	id := c.Param("id")
	var contract models.Contract
	// В модели поле должно маппиться на колонку pdf_path (например: PDFFilePath string `gorm:"column:pdf_path"`).
	if err := config.DB.Select("pdf_path, contract_number").First(&contract, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
		return
	}

	if contract.PDFFilePath == "" || !fileExists(contract.PDFFilePath) {
		c.JSON(http.StatusNotFound, gin.H{"error": "PDF для этого договора не был сгенерирован"})
		return
	}

	data, err := os.ReadFile(contract.PDFFilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось прочитать PDF"})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+contract.ContractNumber+".pdf")
	c.Data(http.StatusOK, "application/pdf", data)
}

// ListStudentContractsHandler возвращает список всех договоров для конкретного студента, включая удаленные.
func ListStudentContractsHandler(c *gin.Context) {
	studentID := c.Param("id")

	var contracts []models.Contract
	if err := config.DB.Unscoped().Where("student_id = ?", studentID).Order("created_at desc").Find(&contracts).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusOK, make([]models.Contract, 0))
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось получить договоры студента"})
		return
	}

	if contracts == nil {
		contracts = make([]models.Contract, 0)
	}

	c.JSON(http.StatusOK, contracts)
}

// PreviewPaymentPlanHandler генерирует превью плана платежей без сохранения в БД.
func PreviewPaymentPlanHandler(c *gin.Context) {
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

	if err := config.DB.First(&contract, contractID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Договор не найден"})
		return
	}

	if err := config.DB.Preload("Installments").First(&paymentForm, body.PaymentFormID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Форма оплаты не найдена"})
		return
	}

	parameters := make(map[string]interface{})
	parameters["Сумма"] = contract.TotalAmount
	parameters["Сумма с учётом скидки"] = contract.DiscountedAmount
	parameters["Скидка"] = contract.TotalAmount - contract.DiscountedAmount

	var schedule []PaymentPreview

	// StartDate в модели — *time.Time, поэтому учитываем nil
	contractYear := time.Now().Year()
	if contract.StartDate != nil {
		contractYear = contract.StartDate.Year()
	}

	for _, installment := range paymentForm.Installments {
		expression, err := govaluate.NewEvaluableExpression(installment.Formula)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Ошибка в формуле '%s': %v", installment.Formula, err)})
			return
		}

		result, err := expression.Evaluate(parameters)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Не удалось вычислить формулу: %v", err)})
			return
		}

		amount, ok := result.(float64)
		if !ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Результат формулы не является числом"})
			return
		}

		monthIndex := getMonthIndex(installment.Month) // версия из handler_utils.go
		paymentMonth := time.Month(monthIndex + 1)

		year := contractYear
		if paymentMonth < time.August {
			year = contractYear + 1
		}
		paymentDate := time.Date(year, paymentMonth, installment.Day, 0, 0, 0, 0, time.UTC)

		schedule = append(schedule, PaymentPreview{
			PaymentDate: paymentDate.Format("02.01.2006"),
			Amount:      amount,
		})
	}

	c.JSON(http.StatusOK, schedule)
}

// --- Вспомогательные функции ---

func fillMissingPlaceholders(repl map[string]string) map[string]string {
	for _, key := range allPlaceholders {
		if _, ok := repl[key]; !ok {
			repl[key] = ""
		}
	}
	return repl
}

func getTemplateBytes(templateID uint, filePath string) ([]byte, error) {
	cacheMutex.RLock()
	if b, ok := templateCache[templateID]; ok {
		cacheMutex.RUnlock()
		return b, nil
	}
	cacheMutex.RUnlock()

	data, err := os.ReadFile(strings.TrimPrefix(filePath, "/"))
	if err != nil {
		return nil, err
	}
	cacheMutex.Lock()
	templateCache[templateID] = data
	cacheMutex.Unlock()
	return data, nil
}

func replacePlaceholders(docxBytes []byte, replacements map[string]string) ([]byte, error) {
	zipReader, err := zip.NewReader(bytes.NewReader(docxBytes), int64(len(docxBytes)))
	if err != nil {
		return nil, fmt.Errorf("ошибка чтения docx (zip): %w", err)
	}
	outputBuf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(outputBuf)
	for _, file := range zipReader.File {
		fileWriter, err := zipWriter.Create(file.Name)
		if err != nil {
			return nil, fmt.Errorf("ошибка создания файла в zip: %w", err)
		}
		fileReader, err := file.Open()
		if err != nil {
			return nil, fmt.Errorf("ошибка открытия файла в zip: %w", err)
		}
		if file.Name == "word/document.xml" || strings.HasPrefix(file.Name, "word/header") || strings.HasPrefix(file.Name, "word/footer") {
			xmlContent, err := io.ReadAll(fileReader)
			if err != nil {
				fileReader.Close()
				return nil, fmt.Errorf("ошибка чтения %s: %w", file.Name, err)
			}
			xmlString := string(xmlContent)
			xmlString = strings.ReplaceAll(xmlString, "</w:t></w:r><w:r><w:t>", "")
			for key, val := range replacements {
				escapedVal := strings.ReplaceAll(val, "&", "&amp;")
				escapedVal = strings.ReplaceAll(escapedVal, "<", "&lt;")
				escapedVal = strings.ReplaceAll(escapedVal, ">", "&gt;")
				xmlString = strings.ReplaceAll(xmlString, key, escapedVal)
			}
			if _, err := fileWriter.Write([]byte(xmlString)); err != nil {
				fileReader.Close()
				return nil, fmt.Errorf("ошибка записи в %s: %w", file.Name, err)
			}
		} else {
			if _, err := io.Copy(fileWriter, fileReader); err != nil {
				fileReader.Close()
				return nil, fmt.Errorf("ошибка копирования файла в zip: %w", err)
			}
		}
		fileReader.Close()
	}
	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("ошибка закрытия zip writer: %w", err)
	}
	return outputBuf.Bytes(), nil
}

func convertDocxToPdf(docxBytes []byte) ([]byte, error) {
	gotenbergURL := "http://libreoffice-converter:3000/forms/libreoffice/convert"
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("files", "input.docx")
	if err != nil {
		return nil, fmt.Errorf("ошибка создания части формы для файла: %w", err)
	}
	if _, err := part.Write(docxBytes); err != nil {
		return nil, fmt.Errorf("ошибка записи DOCX в часть формы: %w", err)
	}
	writer.Close()

	req, err := http.NewRequest("POST", gotenbergURL, body)
	if err != nil {
		return nil, fmt.Errorf("ошибка создания запроса к Gotenberg: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ошибка отправки запроса к Gotenberg: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ошибка конвертации DOCX в PDF через Gotenberg: статус %d, ответ: %s", resp.StatusCode, string(respBody))
	}

	pdfBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ошибка чтения PDF ответа от Gotenberg: %w", err)
	}

	return pdfBytes, nil
}

func numberToWords(amount float64) string {
	tenge := int(amount)
	tiyn := int(math.Round((amount - float64(tenge)) * 100))
	tengeWords := num2words.Convert(tenge)
	return fmt.Sprintf("%s тенге %02d тиын", tengeWords, tiyn)
}

func buildReplacements(student *models.Student, input *ContractInput, contractNumber string, signDate time.Time, scheduleHTML string) (map[string]string, error) {
	childFullName := strings.TrimSpace(fmt.Sprintf("%s %s %s", student.LastName, student.FirstName, student.MiddleName))
	var birthDateStr string
	if student.BirthDate != nil {
		birthDateStr = student.BirthDate.Format("02.01.2006")
	}

	repl := map[string]string{
		"{contractNumber}":                   contractNumber,
		"{SignDate}":                         signDate.Format("02.01.2006"),
		"{fioParentForDogovor}":              student.ContractParentName,
		"{iinParent}":                        student.ContractParentIIN,
		"{docNumParent}":                     student.ContractParentDocumentNumber,
		"{dateOfIssueDocuemntParent}":        student.ContractParentDocumentInfo,
		"{childPhoneNumberParentForDogovor}": student.ContractParentPhone,
		"{childFullName}":                    childFullName,
		"{dateOfBirthChild}":                 birthDateStr,
		"{iinChild}":                         student.IIN,
		"{homeAddressChild}":                 student.HomeAddress,
		"{contributionOfMoney}":              "300000",
		"{contributionOfMoneyTextKz}":        "үш жүз мың теңге",
		"{contributionOfMoneyText}":          "триста тысяч тенге",
		"{dateAcademicStartLearn}":           "01 сентября 2025 года",
		"{dateAcademicEndLearn}":             "25 мая 2026 года",
		"{contractSum}":                      fmt.Sprintf("%.2f", input.TotalAmount),
		"{contractSumTextKZ}":                numberToWords(input.TotalAmount),
		"{contractSumText}":                  numberToWords(input.TotalAmount),
		"{ContractSumWithDiscount}":          fmt.Sprintf("%.2f", input.DiscountedAmount),
		"{ContractSumWithDiscountTextKz}":    numberToWords(input.DiscountedAmount),
		"{ContractSumWithDiscountText}":      numberToWords(input.DiscountedAmount),
		"{paymentPlansPrometheusKZ}":         "Төлем кестесі",
		"{paymentPlansPrometheus}":           scheduleHTML,
	}
	return repl, nil
}

// ===== ДОП. УТИЛИТЫ ДЛЯ СОЗДАНИЯ ДОГОВОРА =====

func getUserIDFromContext(c *gin.Context) (uint, error) {
	val, ok := c.Get("user_id")
	if !ok {
		return 0, fmt.Errorf("user_id отсутствует в контексте")
	}
	switch v := val.(type) {
	case uint:
		return v, nil
	case int:
		return uint(v), nil
	case int64:
		return uint(v), nil
	case float64:
		return uint(v), nil
	default:
		return 0, fmt.Errorf("неожиданный тип user_id: %T", val)
	}
}

// computeTuitionAmountForStudent тянет цены из таблицы tuition_fees (year, amount).
// Правило: если admission_year ≤ 2023 → используем цену за 2023; иначе — цену за максимальный доступный год.
// Если колонка/значение admission_year недоступны — используем актуальную цену (макс. год).
func computeTuitionAmountForStudent(student *models.Student) (amount float64, usedYear int, err error) {
	type feeRow struct {
		Year   int
		Amount float64
	}
	var fees []feeRow
	if err := config.DB.Table("tuition_fees").Select("year, amount").Find(&fees).Error; err != nil {
		return 0, 0, err
	}
	if len(fees) == 0 {
		return 0, 0, fmt.Errorf("справочник 'tuition_fees' пуст")
	}

	feesMap := map[int]float64{}
	maxYear := 0
	for _, r := range fees {
		feesMap[r.Year] = r.Amount
		if r.Year > maxYear {
			maxYear = r.Year
		}
	}

	admissionYear, _ := getStudentAdmissionYear(student.ID) // если не удастся — вернётся 0
	cutoff := 2023

	yearToUse := maxYear
	if admissionYear > 0 && admissionYear <= cutoff {
		yearToUse = cutoff
	}
	price, ok := feesMap[yearToUse]
	if !ok {
		// на всякий случай фолбэк на актуальный
		price = feesMap[maxYear]
		yearToUse = maxYear
	}
	return price, yearToUse, nil
}

// getStudentAdmissionYear — безопасно пытается прочитать колонку students.admission_year.
// Если колонки нет или значение NULL/пусто — возвращает 0 без ошибки.
func getStudentAdmissionYear(studentID uint) (int, error) {
	var row struct {
		AdmissionYear *int
	}
	err := config.DB.Table("students").Select("admission_year").Where("id = ?", studentID).Scan(&row).Error
	if err != nil {
		// Если колонка отсутствует/другая ошибка — не ломаем логику, просто вернём 0.
		return 0, nil
	}
	if row.AdmissionYear == nil {
		return 0, nil
	}
	return *row.AdmissionYear, nil
}

// createContractWithUniqueNumber создаёт договор, гарантируя уникальный contract_number.
// Формат номера: "N {studentID}-{seq}". При конфликте — увеличивает seq и повторяет вставку (до 10 попыток).
func createContractWithUniqueNumber(
	student *models.Student,
	managerID uint,
	paymentFormID *uint,
	totalAmount float64,
	discountPercent float64,
	discountedAmount float64,
	startDate, endDate time.Time,
	pdfBytes []byte,
) (models.Contract, error) {

	var contract models.Contract
	const maxTries = 10

	// стартовая последовательность — количество уже существующих договоров + 1
	var existing int64
	if err := config.DB.Model(&models.Contract{}).Where("student_id = ?", student.ID).Count(&existing).Error; err != nil {
		return contract, err
	}
	seq := int(existing) + 1

	for i := 0; i < maxTries; i++ {
		number := fmt.Sprintf("N %d-%d", student.ID, seq)

		c := models.Contract{
			StudentID:          student.ID,
			ManagerID:          managerID,
			ContractNumber:     number,
			SigningMethod:      "Trust Me",
			TotalAmount:        totalAmount,
			DiscountPercentage: discountPercent,
			DiscountedAmount:   discountedAmount,
			StartDate:          &startDate,
			EndDate:            &endDate,
			PaymentFormId:      paymentFormID, // корректное имя поля
		}

		// Если PDF сгенерирован — сохраняем на диск и пишем путь в модель (поле должно маппиться на pdf_path)
		if len(pdfBytes) > 0 {
			base := contractsBaseDir()
			if err := ensureDir(base); err != nil {
				return contract, fmt.Errorf("не удалось создать директорию для PDF: %w", err)
			}
			re := regexp.MustCompile(`[^0-9A-Za-z._-]+`)
			name := re.ReplaceAllString(fmt.Sprintf("%s.pdf", number), "_")
			full := filepath.Join(base, name)
			if err := os.WriteFile(full, pdfBytes, 0o644); err != nil {
				return contract, fmt.Errorf("не удалось записать PDF: %w", err)
			}
			c.PDFFilePath = full
		}

		err := config.DB.Create(&c).Error
		if err == nil {
			return c, nil
		}

		// Конфликт уникальности номера — пробуем следующий номер.
		if strings.Contains(strings.ToLower(err.Error()), "duplicate key value") &&
			strings.Contains(err.Error(), "contracts_contract_number_key") {
			seq++
			continue
		}
		// Иная ошибка
		return contract, err
	}

	return contract, fmt.Errorf("не удалось сгенерировать уникальный номер договора после %d попыток", maxTries)
}

// ВАЖНО: getMonthIndex УЖЕ есть в internal/handlers/handler_utils.go — не дублируем его здесь.
