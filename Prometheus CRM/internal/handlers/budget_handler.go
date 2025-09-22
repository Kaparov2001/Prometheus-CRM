package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ИЗМЕНЕНИЕ: Структура теперь включает заложенный бюджет и остаток
type budgetTableRow struct {
	DepartmentName    string  `json:"departmentName"`
	BudgetItemName    string  `json:"budgetItemName"`
	RegistryEntryName string  `json:"registryEntryName"`
	DeclaredBudget    int64   `json:"declaredBudget"`
	RemainingBudget   float64 `json:"remainingBudget"` // Новое поле для остатка
	RegistryEntryID   uint    `json:"registryEntryId"`
}

// ИЗМЕНЕНИЕ: Функция полностью переписана для расчета остатков
func GetBudgetDataHandler(c *gin.Context) {
	var registryEntries []models.RegistryEntry

	// Загружаем все статьи реестра со связанными данными
	if err := config.DB.Preload("BudgetItem.Department").Order("id asc").Find(&registryEntries).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch registry entries"})
		return
	}

	// Создаем карту для хранения потраченных сумм по каждой статье реестра
	spentAmounts := make(map[uint]float64)
	type TransactionSum struct {
		RegistryEntryID uint
		Total           float64
	}
	var transactionSums []TransactionSum
	config.DB.Model(&models.Transaction{}).
		Select("registry_entry_id, SUM(amount) as total").
		Group("registry_entry_id").
		Scan(&transactionSums)

	// Заполняем карту
	for _, sum := range transactionSums {
		spentAmounts[sum.RegistryEntryID] = sum.Total
	}

	var tableRows []budgetTableRow
	for _, entry := range registryEntries {
		// Проверяем, что связанные данные существуют
		if entry.BudgetItem.ID == 0 || entry.BudgetItem.Department.ID == 0 {
			continue
		}

		// Получаем потраченную сумму из карты (если трат не было, будет 0)
		spent := spentAmounts[entry.ID]

		// Рассчитываем остаток
		remaining := float64(entry.Amount) - spent

		row := budgetTableRow{
			DepartmentName:    entry.BudgetItem.Department.Name,
			BudgetItemName:    entry.BudgetItem.Name,
			RegistryEntryName: entry.Name,
			DeclaredBudget:    entry.Amount,
			RemainingBudget:   remaining, // Добавляем остаток в ответ
			RegistryEntryID:   entry.ID,
		}
		tableRows = append(tableRows, row)
	}

	if tableRows == nil {
		tableRows = make([]budgetTableRow, 0)
	}

	c.JSON(http.StatusOK, gin.H{"tableRows": tableRows})
}

// CreateDepartmentsHandler создает одно или несколько новых подразделений
func CreateDepartmentsHandler(c *gin.Context) {
	var depts []models.Department
	if err := c.ShouldBindJSON(&depts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := config.DB.Create(&depts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create departments"})
		return
	}
	c.JSON(http.StatusCreated, depts)
}

// GetDepartmentsHandler получает список всех подразделений
func GetDepartmentsHandler(c *gin.Context) {
	type DepartmentResponse struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
	}

	var departments []models.Department
	if err := config.DB.Find(&departments).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch departments"})
		return
	}

	var response []DepartmentResponse
	for _, d := range departments {
		response = append(response, DepartmentResponse{ID: d.ID, Name: d.Name})
	}

	c.JSON(http.StatusOK, response)
}

// BudgetItemInput определяет структуру для входящих данных при создании статей бюджета.
type BudgetItemInput struct {
	Name         string `json:"name" binding:"required"`
	DepartmentID uint   `json:"departmentId" binding:"required"`
}

// CreateBudgetItemsHandler создает одну или несколько новых статей бюджета
func CreateBudgetItemsHandler(c *gin.Context) {
	var inputs []BudgetItemInput
	if err := c.ShouldBindJSON(&inputs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var budgetItems []models.BudgetItem
	for _, input := range inputs {
		item := models.BudgetItem{
			Name:         input.Name,
			DepartmentID: input.DepartmentID,
		}
		budgetItems = append(budgetItems, item)
	}

	if err := config.DB.Create(&budgetItems).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create budget items", "details": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, budgetItems)
}

// GetBudgetItemsByDepartmentHandler получает статьи бюджета для конкретного подразделения
func GetBudgetItemsByDepartmentHandler(c *gin.Context) {
	type BudgetItemResponse struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
	}

	var items []models.BudgetItem
	departmentID := c.Query("department_id")
	if departmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id is required"})
		return
	}

	if err := config.DB.Where("department_id = ?", departmentID).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch budget items"})
		return
	}

	var response []BudgetItemResponse
	for _, item := range items {
		response = append(response, BudgetItemResponse{ID: item.ID, Name: item.Name})
	}

	c.JSON(http.StatusOK, response)
}

// CreateRegistryItemHandler создает новую запись в реестре
func CreateRegistryItemHandler(c *gin.Context) {
	var entry models.RegistryEntry
	if err := c.ShouldBindJSON(&entry); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := config.DB.Create(&entry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create registry entry"})
		return
	}
	c.JSON(http.StatusCreated, entry)
}

// DeleteRegistryEntryHandler удаляет запись из реестра
func DeleteRegistryEntryHandler(c *gin.Context) {
	id := c.Param("id")
	idInt, err := strconv.Atoi(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}

	if result := config.DB.Delete(&models.RegistryEntry{}, idInt); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Deleted successfully"})
}

// GetRegistryItemsHandler получает статьи в реестре для конкретной статьи бюджета
func GetRegistryItemsHandler(c *gin.Context) {
	type RegistryItemResponse struct {
		ID   uint   `json:"id"`
		Name string `json:"name"`
	}

	var items []models.RegistryEntry
	budgetItemID := c.Query("budget_item_id")
	if budgetItemID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "budget_item_id is required"})
		return
	}

	if err := config.DB.Where("budget_item_id = ?", budgetItemID).Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch registry items"})
		return
	}

	var response []RegistryItemResponse
	for _, item := range items {
		response = append(response, RegistryItemResponse{ID: item.ID, Name: item.Name})
	}

	c.JSON(http.StatusOK, response)
}

// GetRegistryItemsByDepartmentHandler получает все статьи реестра для конкретного подразделения.
func GetRegistryItemsByDepartmentHandler(c *gin.Context) {
	// Структура для красивого ответа, включающая имя родительской статьи бюджета
	type RegistryItemWithBudgetResponse struct {
		ID             uint   `json:"id"`
		Name           string `json:"name"`
		BudgetItemName string `json:"budgetItemName"`
	}

	var results []RegistryItemWithBudgetResponse
	departmentID := c.Query("department_id")
	if departmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id is required"})
		return
	}

	// Выполняем запрос с JOIN'ами, чтобы получить все нужные данные сразу
	err := config.DB.Table("registry_entries as re").
		Select("re.id, re.name, bi.name as budget_item_name").
		Joins("JOIN budget_items bi ON re.budget_item_id = bi.id").
		Where("bi.department_id = ? AND re.deleted_at IS NULL", departmentID).
		Scan(&results).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch registry items by department"})
		return
	}

	if results == nil {
		results = make([]RegistryItemWithBudgetResponse, 0)
	}

	c.JSON(http.StatusOK, results)
}

// GetBudgetBalanceHandler получает баланс для конкретной статьи реестра и статьи бюджета.
func GetBudgetBalanceHandler(c *gin.Context) {
	departmentName := c.Query("department")
	registerItemName := c.Query("registerItem")
	budgetItemName := c.Query("budgetItem")

	if departmentName == "" || registerItemName == "" || budgetItemName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department, budgetItem, and registerItem are required"})
		return
	}

	// Используем уже существующую внутреннюю функцию для получения баланса
	balances, err := getInternalBalance(departmentName, budgetItemName, registerItemName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get internal balance: " + err.Error()})
		return
	}

	// Конвертируем строковый баланс в число для удобства на фронтенде
	registerBalance, _ := strconv.ParseFloat(strings.Replace(balances.RegisterBalance, ",", ".", 1), 64)

	c.JSON(http.StatusOK, gin.H{
		"registerBalance": registerBalance,
	})
}
func UpdateDepartmentHandler(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	var department models.Department
	if err := config.DB.First(&department, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Подразделение не найдено"})
		return
	}

	department.Name = input.Name
	if err := config.DB.Save(&department).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить подразделение"})
		return
	}
	c.JSON(http.StatusOK, department)
}

// DeleteDepartmentHandler удаляет подразделение
func DeleteDepartmentHandler(c *gin.Context) {
	id := c.Param("id")

	// Проверяем, есть ли связанные статьи бюджета, чтобы предотвратить случайное удаление
	var count int64
	if err := config.DB.Model(&models.BudgetItem{}).Where("department_id = ?", id).Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки связанных статей бюджета"})
		return
	}
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Нельзя удалить подразделение, так как у него есть привязанные статьи бюджета"})
		return
	}

	if result := config.DB.Delete(&models.Department{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить подразделение"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Подразделение не найдено"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Подразделение успешно удалено"})
	}
}
func UpdateBudgetItemHandler(c *gin.Context) {
	id := c.Param("id")
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	var budgetItem models.BudgetItem
	if err := config.DB.First(&budgetItem, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Статья бюджета не найдена"})
		return
	}

	budgetItem.Name = input.Name
	if err := config.DB.Save(&budgetItem).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить статью бюджета"})
		return
	}
	c.JSON(http.StatusOK, budgetItem)
}

// DeleteBudgetItemHandler удаляет статью бюджета
func DeleteBudgetItemHandler(c *gin.Context) {
	id := c.Param("id")

	// Проверяем, есть ли связанные записи в реестре
	var count int64
	if err := config.DB.Model(&models.RegistryEntry{}).Where("budget_item_id = ?", id).Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка проверки связанных записей в реестре"})
		return
	}
	if count > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "Нельзя удалить статью: у нее есть связанные записи в реестре"})
		return
	}

	if result := config.DB.Delete(&models.BudgetItem{}, id); result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось удалить статью бюджета"})
	} else if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Статья бюджета не найдена"})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "Статья бюджета успешно удалена"})
	}
}
func GetRegistryEntryHandler(c *gin.Context) {
	id := c.Param("id")
	var entry models.RegistryEntry
	// Предзагружаем связанные данные, чтобы корректно заполнить форму
	if err := config.DB.Preload("BudgetItem.Department").First(&entry, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Запись в реестре не найдена"})
		return
	}
	// Просто возвращаем один найденный объект
	c.JSON(http.StatusOK, entry)
}

// UpdateRegistryEntryHandler обновляет запись в реестре
func UpdateRegistryEntryHandler(c *gin.Context) {
	id := c.Param("id")
	var entry models.RegistryEntry
	if err := config.DB.First(&entry, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Запись в реестре для обновления не найдена"})
		return
	}

	var input struct {
		Name         string `json:"name" binding:"required"`
		Amount       int64  `json:"budget_amount" binding:"required"`
		BudgetItemID uint   `json:"budget_item_id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Некорректные данные: " + err.Error()})
		return
	}

	// Обновляем поля
	entry.Name = input.Name
	entry.Amount = input.Amount
	entry.BudgetItemID = input.BudgetItemID

	if err := config.DB.Save(&entry).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось обновить запись"})
		return
	}
	c.JSON(http.StatusOK, entry)
}
