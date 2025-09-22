// FILE: models/transaction.go
package models

import "gorm.io/gorm"

// Transaction представляет одну финансовую операцию (расход по счету)
type Transaction struct {
	gorm.Model
	RegistryEntryID uint    `json:"registry_entry_id" gorm:"not null"`
	InvoiceID       uint    `json:"invoice_id" gorm:"unique;not null"`
	Amount          float64 `json:"amount" gorm:"type:numeric(12,2);not null"`
}
