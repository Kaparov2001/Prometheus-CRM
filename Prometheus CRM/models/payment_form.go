// models/payment_form.go

package models

import "gorm.io/gorm"

// PaymentForm представляет основную модель формы оплаты.
type PaymentForm struct {
	gorm.Model
	Name              string               `json:"name"`
	InstallmentsCount int                  `json:"installments_count"`
	Installments      []PaymentInstallment `json:"installments" gorm:"foreignKey:PaymentFormID"`
}

// PaymentInstallment представляет отдельный платеж в рамках формы.
type PaymentInstallment struct {
	gorm.Model
	PaymentFormID uint   `json:"payment_form_id"`
	Month         string `json:"month"`
	Day           int    `json:"day"`
	Formula       string `json:"formula"`
}

// TableName задает имя таблицы для GORM.
func (PaymentForm) TableName() string {
	return "payment_forms"
}

// TableName задает имя таблицы для GORM.
func (PaymentInstallment) TableName() string {
	return "payment_installments"
}
