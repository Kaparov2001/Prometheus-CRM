// crm/models/payment_fact.go
package models

import (
	"time"

	"gorm.io/gorm"
)

type PaymentFact struct {
	gorm.Model
	ContractID    uint      `json:"contractId"`
	Contract      Contract  `json:"contract"`
	Amount        float64   `json:"amount" gorm:"type:numeric(12,2)"`
	Commission    float64   `json:"commission" gorm:"type:numeric(12,2)"`
	PaymentDate   time.Time `json:"paymentDate"`
	AcademicYear  string    `json:"academicYear"`
	PaymentName   string    `json:"paymentName"`
	PaymentMethod string    `json:"paymentMethod"`
}
