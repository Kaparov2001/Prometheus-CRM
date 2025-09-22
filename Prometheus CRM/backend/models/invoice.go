// FILE: crm/models/invoice.go
package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
)

// ClosingDocumentPaths - это специальный тип для хранения массива путей к файлам в JSONB.
type ClosingDocumentPaths []string

// Value преобразует массив путей в формат JSON для сохранения в БД.
func (p ClosingDocumentPaths) Value() (driver.Value, error) {
	return json.Marshal(p)
}

// Scan считывает данные из БД (в формате JSON) и преобразует их в массив путей.
func (p *ClosingDocumentPaths) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(bytes, p)
}

// Invoice представляет модель счета на оплату в базе данных.
type Invoice struct {
	gorm.Model
	UserID           uint                 `json:"userId"`
	User             User                 `json:"user" gorm:"foreignKey:UserID"`
	Department       string               `json:"department"`
	RegisterItem     string               `json:"registerItem"`
	BudgetItem       string               `json:"budgetItem"`
	Kontragent       string               `json:"kontragent"`
	Bin              string               `json:"bin"`
	InvoiceNumber    string               `json:"invoiceNumber"`
	InvoiceDate      *time.Time           `json:"invoiceDate"`
	TotalAmount      float64              `json:"totalAmount"`
	PaymentPurpose   string               `json:"paymentPurpose"`
	Status           string               `json:"status" gorm:"default:'Pending'"`
	RejectionReason  string               `json:"rejectionReason"`
	PaymentDate      *time.Time           `json:"paymentDate"`
	InvoiceFileUrl   string               `json:"invoiceFileUrl"`
	ContractFileUrl  string               `json:"contractFileUrl"`
	MemoFileUrl      string               `json:"memoFileUrl"`
	ClosingDocuments ClosingDocumentPaths `json:"closingDocuments" gorm:"type:jsonb"`

	// --- ИСПРАВЛЕНИЕ: Имена полей начинаются с заглавной буквы ---
	PaymentOrderFileUrl    string `json:"paymentOrderFileUrl"`
	PowerOfAttorneyFileUrl string `json:"powerOfAttorneyFileUrl"`
}
