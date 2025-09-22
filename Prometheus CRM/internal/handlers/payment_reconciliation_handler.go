package handlers

import (
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"
	"strconv"

	"github.com/gin-gonic/gin"
)

type DebtorResponse struct {
	ContractID      uint    `json:"contractId"`
	ContractNumber  string  `json:"contractNumber"`
	StudentFullName string  `json:"studentFullName"`
	StudentClass    string  `json:"studentClass"`
	DebtAmount      float64 `json:"debtAmount"`
	Comment         string  `json:"comment"`
}

// ListDebtorsHandler возвращает список должников
func ListDebtorsHandler(c *gin.Context) {
	var debtors []DebtorResponse
	var totalRows int64

	// Запрос, который находит должников
	query := config.DB.Table("contracts").
		Select(`
            contracts.id as contract_id,
            contracts.contract_number,
            (s.last_name || ' ' || s.first_name) as student_full_name,
            (COALESCE(cl.grade_number::text, '') || ' ' || COALESCE(clit.liter_char, '')) as student_class,
            (contracts.discounted_amount - COALESCE((SELECT SUM(amount) FROM payment_facts WHERE contract_id = contracts.id), 0)) as debt_amount,
			contracts.comment
        `).
		Joins("JOIN students s ON s.id = contracts.student_id").
		Joins("LEFT JOIN classes cl ON s.class_id = cl.id").
		Joins("LEFT JOIN class_liters clit ON cl.liter_id = clit.id").
		Where("(contracts.discounted_amount - COALESCE((SELECT SUM(amount) FROM payment_facts WHERE contract_id = contracts.id), 0)) > 0").
		Where("contracts.deleted_at IS NULL")

	// Считаем общее количество для пагинации
	if err := query.Count(&totalRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count debtors"})
		return
	}

	// Применяем пагинацию
	paginatedQuery := query.Scopes(Paginate(c)).Order("debt_amount DESC") // Сортируем по убыванию долга

	if err := paginatedQuery.Scan(&debtors).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch debtors"})
		return
	}

	if debtors == nil {
		debtors = make([]DebtorResponse, 0)
	}

	c.JSON(http.StatusOK, CreatePaginatedResponse(c, debtors, totalRows))
}

// UpdateContractCommentHandler обновляет комментарий к договору
func UpdateContractCommentHandler(c *gin.Context) {
	contractID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid contract ID"})
		return
	}

	var input struct {
		Comment string `json:"comment"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := config.DB.Model(&models.Contract{}).Where("id = ?", contractID).Update("comment", input.Comment)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Contract not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Comment updated successfully"})
}
