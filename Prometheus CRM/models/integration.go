// crm/models/integration.go
package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"

	"gorm.io/gorm"
)

// JSONB представляет тип данных JSONB в PostgreSQL
type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(bytes, j)
}

// IntegrationSetting хранит настройки для одного внешнего сервиса
type IntegrationSetting struct {
	gorm.Model
	ServiceName string `gorm:"unique;not null" json:"serviceName"`
	IsEnabled   bool   `json:"isEnabled"`
	Settings    JSONB  `gorm:"type:jsonb" json:"settings"`
}

// IntegrationDocument связывает наш внутренний договор с его ID во внешнем сервисе
type IntegrationDocument struct {
	gorm.Model
	ContractID         uint     `json:"contractId"`
	Contract           Contract `json:"contract"` // Связь для GORM
	ServiceName        string   `json:"serviceName"`
	ExternalDocumentID string   `json:"externalDocumentId"`
	Status             string   `json:"status"`
	StatusPayload      JSONB    `gorm:"type:jsonb" json:"statusPayload"`
}
