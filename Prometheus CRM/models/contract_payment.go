// FILE: crm/models/contract_payment.go
package models

import (
	"time"

	"gorm.io/gorm"
)

// ContractPayment представляет один фактический платеж по договору.
type ContractPayment struct {
	gorm.Model
	ContractID    uint        `json:"contract_id" gorm:"not null;index"`
	Contract      Contract    `json:"contract"`
	Amount        float64     `json:"amount" gorm:"type:numeric(12,2);not null"`
	PaymentDate   time.Time   `json:"payment_date" gorm:"not null"`
	PaymentFormID uint        `json:"payment_form_id" gorm:"not null"`
	PaymentForm   PaymentForm `json:"payment_form"`
	Comment       string      `json:"comment"`
}
