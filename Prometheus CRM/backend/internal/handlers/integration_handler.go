// crm/internal/handlers/integration_handler.go
package handlers

import (
	"encoding/json"
	"net/http"
	"prometheus-crm/config"
	"prometheus-crm/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const TrustMeService = "trustme"

// TrustMeSettings представляет структуру настроек для TrustMe
type TrustMeSettings struct {
	URL          string `json:"url"`
	OrgName      string `json:"orgName"`
	Token        string `json:"token"`
	WebhookURL   string `json:"webhookUrl"`
	SignerNumber string `json:"signerNumber"`
}

// GetTrustMeSettingsHandler получает настройки для TrustMe
func GetTrustMeSettingsHandler(c *gin.Context) {
	var settings models.IntegrationSetting
	err := config.DB.Where("service_name = ?", TrustMeService).First(&settings).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get settings"})
		return
	}
	c.JSON(http.StatusOK, settings)
}

// SaveTrustMeSettingsHandler сохраняет настройки для TrustMe
func SaveTrustMeSettingsHandler(c *gin.Context) {
	var payload struct {
		IsEnabled bool            `json:"isEnabled"`
		Settings  TrustMeSettings `json:"settings"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid data: " + err.Error()})
		return
	}

	settingsJSON, _ := json.Marshal(payload.Settings)

	setting := models.IntegrationSetting{
		ServiceName: TrustMeService,
		IsEnabled:   payload.IsEnabled,
		Settings:    make(map[string]interface{}),
	}
	json.Unmarshal(settingsJSON, &setting.Settings)

	// Используем Upsert (OnConflict)
	err := config.DB.Where(models.IntegrationSetting{ServiceName: TrustMeService}).Assign(setting).FirstOrCreate(&setting).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save settings: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Настройки успешно сохранены"})
}

// ListContractsForSigningHandler возвращает список договоров, которые еще не были отправлены
func ListContractsForSigningHandler(c *gin.Context) {
	var contracts []models.Contract
	// Находим ID договоров, которые уже отправлены
	var sentContractIDs []uint
	config.DB.Model(&models.IntegrationDocument{}).Where("service_name = ?", TrustMeService).Pluck("contract_id", &sentContractIDs)

	query := config.DB.Preload("Student")
	if len(sentContractIDs) > 0 {
		query = query.Where("id NOT IN ?", sentContractIDs)
	}

	if err := query.Find(&contracts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch contracts"})
		return
	}
	c.JSON(http.StatusOK, contracts)
}

// SendContractToTrustMeHandler отправляет договор на подпись
func SendContractToTrustMeHandler(c *gin.Context) {
	// ... (логика этой функции будет сложной, она будет включать:
	// 1. Получение ID контракта и данных подписанта из запроса
	// 2. Получение настроек TrustMe и PDF-файла контракта из БД
	// 3. Формирование multipart/form-data запроса к API TrustMe
	// 4. Отправка запроса и обработка ответа
	// 5. Сохранение external_document_id в нашей БД
	// Этот код будет добавлен в следующих итерациях, так как он требует тщательной проработки)
	c.JSON(http.StatusNotImplemented, gin.H{"message": "Отправка договора находится в разработке"})
}

// ListSentTrustMeDocumentsHandler возвращает список отправленных документов и их статусы
func ListSentTrustMeDocumentsHandler(c *gin.Context) {
	var documents []models.IntegrationDocument
	err := config.DB.Preload("Contract").Where("service_name = ?", TrustMeService).Order("created_at DESC").Find(&documents).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sent documents"})
		return
	}
	c.JSON(http.StatusOK, documents)
}
