// FILE: crm/internal/handlers/invoice_handler.go
package handlers

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin" // <-- ИСПРАВЛЕНИЕ ЗДЕСЬ
	"github.com/google/generative-ai-go/genai"
	"gorm.io/gorm"
)

// --- Структуры для входящих данных ---

type RecognizeResponse struct {
	Kontragent    string `json:"kontragent"`
	Bin           string `json:"bin"`
	InvoiceNumber string `json:"invoiceNumber"`
	InvoiceDate   string `json:"invoiceDate"`
	TotalAmount   string `json:"totalAmount"`
}

type DecidePayload struct {
	Decision        string `json:"decision" binding:"required"`
	RejectionReason string `json:"rejectionReason"`
}

// GetBalanceResponse (переименовано)
type GetBalanceResponse struct {
	BudgetBalance   string `json:"budgetBalance"`
	RegisterBalance string `json:"registerBalance"`
}

// --- Обработчики ---

// DownloadInvoiceArchiveHandler находит все счета в таблице invoices и отдает их в виде CSV файла.
func DownloadInvoiceArchiveHandler(c *gin.Context) {
	var invoices []models.Invoice
	if err := config.DB.Preload("User").Order("created_at desc").Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invoices from database"})
		return
	}

	if len(invoices) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No invoices found to export"})
		return
	}

	b := &bytes.Buffer{}
	b.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM for UTF-8

	w := csv.NewWriter(b)
	w.Comma = ';'

	headers := []string{
		"ID", "Дата Подачи", "ID Заявителя", "ФИО Заявителя", "Статус",
		"Подразделение", "Статья в реестре", "Статья бюджета",
		"Контрагент", "БИН", "Номер счета", "Дата счета", "Сумма",
		"Дата оплаты", "Причина отклонения", "URL файла счета",
	}
	if err := w.Write(headers); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write CSV header"})
		return
	}

	for _, inv := range invoices {
		var paymentDate, invoiceDate string
		if inv.PaymentDate != nil {
			paymentDate = inv.PaymentDate.Format("2006-01-02")
		}
		if inv.InvoiceDate != nil {
			invoiceDate = inv.InvoiceDate.Format("2006-01-02")
		}

		record := []string{
			strconv.Itoa(int(inv.ID)), inv.CreatedAt.Format("2006-01-02 15:04:05"),
			strconv.Itoa(int(inv.UserID)), inv.User.FullName, inv.Status,
			inv.Department, inv.RegisterItem, inv.BudgetItem,
			inv.Kontragent, inv.Bin, inv.InvoiceNumber, invoiceDate,
			fmt.Sprintf("%.2f", inv.TotalAmount), paymentDate, inv.RejectionReason,
			inv.InvoiceFileUrl,
		}
		if err := w.Write(record); err != nil {
			slog.Warn("Failed to write record to CSV", "invoice_id", inv.ID, "error", err)
			continue
		}
	}
	w.Flush()

	if err := w.Error(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error writing CSV data"})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Disposition", "attachment; filename=invoices_export.csv")
	c.Data(http.StatusOK, "text/csv", b.Bytes())
}

// SubmitInvoiceHandler обрабатывает подачу нового счета.
func SubmitInvoiceHandler(c *gin.Context) {
	userID, ok := c.Get("user_id")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}
	var user models.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if err := c.Request.ParseMultipartForm(30 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form"})
		return
	}

	uploadDir := filepath.Join("static", "uploads", "invoices")
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create upload directory"})
		return
	}

	invoiceFileURL, err := saveUploadedFile(c, "invoiceFile", uploadDir)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	contractFileURL, _ := saveUploadedFile(c, "contractFile", uploadDir)
	memoFileURL, _ := saveUploadedFile(c, "memoFile", uploadDir)

	totalAmount, _ := strconv.ParseFloat(c.PostForm("totalAmount"), 64)
	invoiceDate, _ := time.Parse("2006-01-02", c.PostForm("invoiceDate"))

	// Читаем и парсим новую дату оплаты
	var paymentDate *time.Time
	if paymentDateStr := c.PostForm("paymentDate"); paymentDateStr != "" {
		if t, err := time.Parse("2006-01-02", paymentDateStr); err == nil {
			paymentDate = &t
		}
	}

	invoice := models.Invoice{
		UserID:          user.ID,
		Department:      c.PostForm("department"),
		RegisterItem:    c.PostForm("registerItem"),
		BudgetItem:      c.PostForm("budgetItem"),
		Kontragent:      c.PostForm("kontragent"),
		Bin:             c.PostForm("bin"),
		InvoiceNumber:   c.PostForm("invoiceNumber"),
		InvoiceDate:     &invoiceDate,
		TotalAmount:     totalAmount,
		PaymentPurpose:  c.PostForm("paymentPurpose"),
		Status:          "Pending",
		PaymentDate:     paymentDate, // Сохраняем дату оплаты
		InvoiceFileUrl:  invoiceFileURL,
		ContractFileUrl: contractFileURL,
		MemoFileUrl:     memoFileURL,
	}

	if err := config.DB.Create(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save invoice to database: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Invoice submitted successfully", "invoice": invoice})
}

// RecognizeInvoiceHandler распознает данные из файла счета с помощью Gemini.
func RecognizeInvoiceHandler(c *gin.Context) {
	file, header, err := c.Request.FormFile("invoiceFile")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invoice file is required"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read file data"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	prompt := []genai.Part{
		genai.Text("Ты — эксперт по обработке счетов на оплату. Проанализируй предоставленный файл и извлеки из него следующие данные: Контрагент (Поставщик), его БИН/ИИН, номер счета, дату счета и итоговую сумму. Твой ответ должен быть только в формате JSON, без каких-либо лишних слов или пояснений. Вот структура JSON, которую нужно заполнить:\n" +
			"{\"kontragent\": \"\", \"bin\": \"\", \"invoiceNumber\": \"\", \"invoiceDate\": \"гггг-мм-дд\", \"totalAmount\": \"0.00\"}"),
		&genai.Blob{MIMEType: header.Header.Get("Content-Type"), Data: data},
	}

	resp, err := config.GeminiClient.GenerateContent(ctx, prompt...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gemini recognition error: " + err.Error()})
		return
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gemini returned no result"})
		return
	}

	jsonResponse, ok := resp.Candidates[0].Content.Parts[0].(genai.Text)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to convert Gemini response to text"})
		return
	}

	cleanJSON := strings.Trim(string(jsonResponse), "```json \n")
	c.Data(http.StatusOK, "application/json", []byte(cleanJSON))
}

// ListInvoicesHandler возвращает список счетов в зависимости от прав и фильтров.
func ListInvoicesHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")
	permissions, _ := c.Get("permissions")
	userPermissions := permissions.([]string)

	query := config.DB.Preload("User").Order("created_at desc")

	requestedStatus := c.Query("status")
	pageType := c.Query("type")

	hasPermission := func(p string) bool {
		for _, userPerm := range userPermissions {
			if userPerm == p {
				return true
			}
		}
		return false
	}

	if pageType == "my" {
		query = query.Where("user_id = ?", userID)
	} else if requestedStatus == "Approved" && hasPermission("invoices_process_accounting") {
		query = query.Where("status = ?", "Approved")
	} else if !hasPermission("invoices_view_all") {
		query = query.Where("user_id = ?", userID)
	}

	if requestedStatus != "" && !(requestedStatus == "Approved" && hasPermission("invoices_process_accounting")) {
		query = query.Where("status = ?", requestedStatus)
	}

	var invoices []models.Invoice
	if err := query.Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch invoices"})
		return
	}

	c.JSON(http.StatusOK, invoices)
}

// GetFinanceInvoiceQueueHandler для очереди финансового отдела
func GetFinanceInvoiceQueueHandler(c *gin.Context) {
	var invoices []models.Invoice
	err := config.DB.Preload("User").Where("status = ?", "Pending").Order("created_at desc").Find(&invoices).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch finance queue"})
		return
	}

	if invoices == nil {
		invoices = make([]models.Invoice, 0)
	}

	c.JSON(http.StatusOK, invoices)
}

// GetAccountingInvoiceQueueHandler для очереди бухгалтерии
func GetAccountingInvoiceQueueHandler(c *gin.Context) {
	var invoices []models.Invoice
	// Запрашиваем счета со статусом "Approved" (К оплате) И "Paid" (Оплачен)
	err := config.DB.Preload("User").Where("status IN ?", []string{"Approved", "Paid"}).Order("created_at desc").Find(&invoices).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch accounting queue"})
		return
	}

	if invoices == nil {
		invoices = make([]models.Invoice, 0)
	}

	c.JSON(http.StatusOK, invoices)
}

// GetInvoiceHandler возвращает один счет по ID.
func GetInvoiceHandler(c *gin.Context) {
	id := c.Param("id")
	userID, _ := c.Get("user_id")

	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if err := config.DB.First(&invoice.User, invoice.UserID).Error; err != nil {
		slog.Warn("User not found for invoice", "invoice_id", invoice.ID, "user_id", invoice.UserID)
	}

	permissions, _ := c.Get("permissions")
	userPermissions := permissions.([]string)
	canViewAll := false
	for _, p := range userPermissions {
		if p == "invoices_view_all" {
			canViewAll = true
			break
		}
	}

	if invoice.UserID != userID.(uint) && !canViewAll {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission to view this invoice"})
		return
	}

	c.JSON(http.StatusOK, invoice)
}

// DecideInvoiceHandler обрабатывает решение финансового отдела.
func DecideInvoiceHandler(c *gin.Context) {
	id := c.Param("id")
	var payload DecidePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}

	switch payload.Decision {
	case "approve":
		invoice.Status = "Approved"
	case "rework":
		invoice.Status = "Rework"
		invoice.RejectionReason = payload.RejectionReason
	case "reject":
		invoice.Status = "Rejected"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid decision"})
		return
	}

	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update invoice status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Decision recorded successfully", "invoice": invoice})
}

// MarkAsPaidHandler обрабатывает оплату счета бухгалтерией.
func MarkAsPaidHandler(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}

	if invoice.Status == "Paid" {
		slog.Info("Счет уже был оплачен. Повторная обработка пропущена.", "invoice_id", invoice.ID)
		c.JSON(http.StatusOK, gin.H{"message": "Invoice already marked as paid", "invoice": invoice})
		return
	}

	// Начинаем транзакцию базы данных
	err := config.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Найти соответствующую запись в реестре
		var registryEntry models.RegistryEntry
		err := tx.Joins("JOIN budget_items ON budget_items.id = registry_entries.budget_item_id").
			Joins("JOIN departments ON departments.id = budget_items.department_id").
			Where("departments.name = ? AND registry_entries.name = ?", invoice.Department, invoice.RegisterItem).
			First(&registryEntry).Error

		if err != nil && invoice.RegisterItem != "Не входит в статью бюджетов" {
			slog.Error("Запись в реестре не найдена для списания", "department", invoice.Department, "registerItem", invoice.RegisterItem)
			return fmt.Errorf("registry entry not found for department '%s' and item '%s'", invoice.Department, invoice.RegisterItem)
		}

		if registryEntry.ID != 0 {
			transaction := models.Transaction{
				RegistryEntryID: registryEntry.ID,
				InvoiceID:       uint(id),
				Amount:          invoice.TotalAmount,
			}
			if err := tx.Create(&transaction).Error; err != nil {
				slog.Error("Не удалось создать запись о транзакции", "error", err)
				return err
			}
		}

		now := time.Now()
		invoice.PaymentDate = &now

		invoice.Status = "Paid"
		if err := tx.Save(&invoice).Error; err != nil {
			slog.Error("Ошибка обновления статуса счета в БД", "invoice_id", invoice.ID, "error", err)
			return err
		}

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process payment: " + err.Error()})
		return
	}

	slog.Info("Счет успешно отмечен как оплаченный, транзакция записана", "invoice_id", invoice.ID)
	c.JSON(http.StatusOK, gin.H{"message": "Invoice marked as paid", "invoice": invoice})
}

// ArchiveInvoiceHandler архивирует счет.
func ArchiveInvoiceHandler(c *gin.Context) {
	id := c.Param("id")
	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}

	invoice.Status = "Archived"
	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to archive invoice"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Invoice archived successfully"})
}

// GetInvoiceBalanceHandler получает баланс по бюджету и реестру для счета.
func GetInvoiceBalanceHandler(c *gin.Context) {
	id := c.Param("id")
	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Invoice not found"})
		return
	}

	balances, err := getInternalBalance(invoice.Department, invoice.BudgetItem, invoice.RegisterItem)
	if err != nil {
		slog.Error("Ошибка получения внутреннего баланса", "error", err, "invoice_id", invoice.ID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get internal balance: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, balances)
}

// --- Вспомогательные функции ---

func saveUploadedFile(c *gin.Context, formKey, uploadDir string) (string, error) {
	file, header, err := c.Request.FormFile(formKey)
	if err != nil {
		if err == http.ErrMissingFile {
			return "", nil
		}
		return "", fmt.Errorf("error getting file from form '%s': %v", formKey, err)
	}
	defer file.Close()

	fileName := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(header.Filename))
	filePath := filepath.Join(uploadDir, fileName)

	out, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file on server: %v", err)
	}
	defer out.Close()

	if _, err = io.Copy(out, file); err != nil {
		return "", fmt.Errorf("failed to copy file content: %v", err)
	}

	return "/" + filepath.ToSlash(filePath), nil
}

func getInternalBalance(department, budgetItem, registerItem string) (GetBalanceResponse, error) {
	var registerBalanceStr = "Не найдено"
	var budgetBalanceStr = "Не найдено"

	if registerItem != "Не входит в статью бюджетов" {
		var registryEntry models.RegistryEntry
		err := config.DB.Joins("JOIN budget_items ON budget_items.id = registry_entries.budget_item_id").
			Joins("JOIN departments ON departments.id = budget_items.department_id").
			Where("departments.name = ? AND registry_entries.name = ?", department, registerItem).
			First(&registryEntry).Error

		if err == nil {
			var totalSpent float64
			config.DB.Model(&models.Transaction{}).
				Where("registry_entry_id = ?", registryEntry.ID).
				Select("COALESCE(SUM(amount), 0)").
				Row().
				Scan(&totalSpent)

			remaining := float64(registryEntry.Amount) - totalSpent
			registerBalanceStr = fmt.Sprintf("%.2f", remaining)
		}
	}

	var budgetItemModel models.BudgetItem
	err := config.DB.Joins("JOIN departments ON departments.id = budget_items.department_id").
		Where("departments.name = ? AND budget_items.name = ?", department, budgetItem).
		First(&budgetItemModel).Error

	if err == nil {
		var registryEntries []models.RegistryEntry
		config.DB.Where("budget_item_id = ?", budgetItemModel.ID).Find(&registryEntries)

		var totalBudget float64
		var totalSpent float64

		for _, entry := range registryEntries {
			totalBudget += float64(entry.Amount)
			var spentOnEntry float64
			config.DB.Model(&models.Transaction{}).
				Where("registry_entry_id = ?", entry.ID).
				Select("COALESCE(SUM(amount), 0)").
				Row().
				Scan(&spentOnEntry)
			totalSpent += spentOnEntry
		}

		remainingBudget := totalBudget - totalSpent
		budgetBalanceStr = fmt.Sprintf("%.2f", remainingBudget)
	}

	return GetBalanceResponse{
		BudgetBalance:   budgetBalanceStr,
		RegisterBalance: registerBalanceStr,
	}, nil
}

// ============== НОВЫЕ ОБРАБОТЧИКИ ==============

// ListAllInvoicesHandler возвращает пагинированный список абсолютно всех счетов.
func ListAllInvoicesHandler(c *gin.Context) {
	var invoices []models.Invoice
	var totalRows int64

	query := config.DB.Model(&models.Invoice{}).Preload("User")

	if err := query.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not count invoices"})
		return
	}

	paginatedQuery := query.Scopes(Paginate(c)).Order("created_at DESC")

	if err := paginatedQuery.Find(&invoices).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch invoices"})
		return
	}

	if invoices == nil {
		invoices = make([]models.Invoice, 0)
	}

	paginatedResponse := CreatePaginatedResponse(c, invoices, totalRows)
	c.JSON(http.StatusOK, paginatedResponse)
}

// AccountingReworkHandler обрабатывает отправку счета на доработку из отдела бухгалтерии.
func AccountingReworkHandler(c *gin.Context) {
	id := c.Param("id")
	var payload struct {
		RejectionReason string `json:"rejectionReason" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Причина доработки обязательна"})
		return
	}

	var invoice models.Invoice
	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Счет не найден"})
		return
	}

	invoice.Status = "Rework"
	invoice.RejectionReason = payload.RejectionReason

	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить статус счета"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Счет успешно отправлен на доработку", "invoice": invoice})
}

// UploadClosingDocumentsHandler обрабатывает загрузку закрывающих документов
func UploadClosingDocumentsHandler(c *gin.Context) {
	invoiceIDStr := c.Param("id")
	invoiceID, err := strconv.Atoi(invoiceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID счета"})
		return
	}

	var invoice models.Invoice
	if err := config.DB.First(&invoice, invoiceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Счет не найден"})
		return
	}

	userID, _ := c.Get("user_id")
	if invoice.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "У вас нет прав на изменение этого счета"})
		return
	}

	form, err := c.MultipartForm()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ошибка получения формы: " + err.Error()})
		return
	}

	files := form.File["closingDocuments"]
	if len(files) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Не выбраны файлы для загрузки"})
		return
	}

	uploadDir := filepath.Join("static", "uploads", "end_docs", invoiceIDStr)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать директорию для загрузки"})
		return
	}

	var uploadedPaths []string
	for _, file := range files {
		fileName := fmt.Sprintf("%d-%s", time.Now().UnixNano(), filepath.Base(file.Filename))
		filePath := filepath.Join(uploadDir, fileName)

		if err := c.SaveUploadedFile(file, filePath); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить файл " + file.Filename})
			return
		}
		uploadedPaths = append(uploadedPaths, "/"+filepath.ToSlash(filePath))
	}

	if invoice.ClosingDocuments == nil {
		invoice.ClosingDocuments = models.ClosingDocumentPaths{}
	}
	invoice.ClosingDocuments = append(invoice.ClosingDocuments, uploadedPaths...)

	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить информацию в базе данных"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Документы успешно загружены",
		"invoice": invoice,
	})
}

// ResubmitInvoiceHandler обрабатывает повторную подачу счета после доработки.
func ResubmitInvoiceHandler(c *gin.Context) {
	id := c.Param("id")
	var invoice models.Invoice

	if err := config.DB.First(&invoice, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Счет для доработки не найден"})
		return
	}

	userID, _ := c.Get("user_id")
	if invoice.UserID != userID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Вы не можете доработать этот счет"})
		return
	}

	if err := c.Request.ParseMultipartForm(30 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ошибка парсинга формы"})
		return
	}

	invoice.Department = c.PostForm("department")
	invoice.RegisterItem = c.PostForm("registerItem")
	invoice.BudgetItem = c.PostForm("budgetItem")
	invoice.Kontragent = c.PostForm("kontragent")
	invoice.Bin = c.PostForm("bin")
	invoice.InvoiceNumber = c.PostForm("invoiceNumber")
	invoice.PaymentPurpose = c.PostForm("paymentPurpose")

	if totalAmountStr := c.PostForm("totalAmount"); totalAmountStr != "" {
		totalAmount, _ := strconv.ParseFloat(totalAmountStr, 64)
		invoice.TotalAmount = totalAmount
	}
	if invoiceDateStr := c.PostForm("invoiceDate"); invoiceDateStr != "" {
		invoiceDate, _ := time.Parse("2006-01-02", invoiceDateStr)
		invoice.InvoiceDate = &invoiceDate
	}

	if paymentDateStr := c.PostForm("paymentDate"); paymentDateStr != "" {
		if t, err := time.Parse("2006-01-02", paymentDateStr); err == nil {
			invoice.PaymentDate = &t
		}
	} else {
		invoice.PaymentDate = nil
	}

	uploadDir := filepath.Join("static", "uploads", "invoices")

	if newInvoiceFile, _, err := c.Request.FormFile("invoiceFile"); err == nil {
		newInvoiceFile.Close()
		if url, err := saveUploadedFile(c, "invoiceFile", uploadDir); err == nil {
			invoice.InvoiceFileUrl = url
		}
	}
	if newContractFile, _, err := c.Request.FormFile("contractFile"); err == nil {
		newContractFile.Close()
		if url, err := saveUploadedFile(c, "contractFile", uploadDir); err == nil {
			invoice.ContractFileUrl = url
		}
	}
	if newMemoFile, _, err := c.Request.FormFile("memoFile"); err == nil {
		newMemoFile.Close()
		if url, err := saveUploadedFile(c, "memoFile", uploadDir); err == nil {
			invoice.MemoFileUrl = url
		}
	}

	invoice.Status = "Pending"
	invoice.RejectionReason = ""

	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось сохранить доработанный счет: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Счет успешно отправлен на повторное согласование", "invoice": invoice})
}

// GetInvoiceCountsHandler возвращает количество заявок для разных разделов.
func GetInvoiceCountsHandler(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var myInvoicesCount int64
	config.DB.Model(&models.Invoice{}).
		Where("user_id = ? AND (status = ? OR closing_documents IS NULL OR closing_documents = '[]')", userID, "Rework").
		Count(&myInvoicesCount)

	var financeQueueCount int64
	config.DB.Model(&models.Invoice{}).Where("status = ?", "Pending").Count(&financeQueueCount)

	var accountingQueueCount int64
	config.DB.Model(&models.Invoice{}).Where("status = ?", "Approved").Count(&accountingQueueCount)

	c.JSON(http.StatusOK, gin.H{
		"my_invoices":      myInvoicesCount,
		"finance_queue":    financeQueueCount,
		"accounting_queue": accountingQueueCount,
	})
}

// UploadAccountingDocumentsHandler обрабатывает загрузку платежного поручения и доверенности.
func UploadAccountingDocumentsHandler(c *gin.Context) {
	invoiceIDStr := c.Param("id")
	invoiceID, err := strconv.Atoi(invoiceIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID счета"})
		return
	}

	var invoice models.Invoice
	if err := config.DB.First(&invoice, invoiceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Счет не найден"})
		return
	}

	uploadDir := filepath.Join("static", "uploads", "accounting_docs", invoiceIDStr)
	if err := os.MkdirAll(uploadDir, os.ModePerm); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось создать директорию для загрузки"})
		return
	}

	paymentOrderURL, err := saveUploadedFile(c, "paymentOrderFile", uploadDir)
	if err != nil {
		slog.Warn("Не удалось сохранить платежное поручение", "error", err)
	}
	if paymentOrderURL != "" {
		invoice.PaymentOrderFileUrl = paymentOrderURL
	}

	powerOfAttorneyURL, err := saveUploadedFile(c, "powerOfAttorneyFile", uploadDir)
	if err != nil {
		slog.Warn("Не удалось сохранить доверенность", "error", err)
	}
	if powerOfAttorneyURL != "" {
		invoice.PowerOfAttorneyFileUrl = powerOfAttorneyURL
	}

	if err := config.DB.Save(&invoice).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить информацию в базе данных"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Документы бухгалтерии успешно загружены",
		"invoice": invoice,
	})
}
