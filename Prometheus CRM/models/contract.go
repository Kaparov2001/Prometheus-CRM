package models

import (
	"time"

	"gorm.io/gorm"
)

// Contract описывает договор.
// PDF хранится на диске; в БД пишем только путь в поле pdf_path.
type Contract struct {
	ID        uint           `gorm:"primaryKey"                  json:"ID"`
	CreatedAt time.Time      `                                   json:"CreatedAt"`
	UpdatedAt time.Time      `                                   json:"UpdatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index"                       json:"DeletedAt"`

	ContractNumber     string     `gorm:"column:contract_number;uniqueIndex" json:"contractNumber"`
	StartDate          *time.Time `gorm:"column:start_date"                   json:"startDate,omitempty"`
	EndDate            *time.Time `gorm:"column:end_date"                     json:"endDate,omitempty"`
	SigningMethod      string     `gorm:"column:signing_method"               json:"signingMethod"`
	PaymentFormId      *uint      `gorm:"column:payment_form_id"              json:"paymentFormId,omitempty"`
	TotalAmount        float64    `gorm:"column:total_amount"                 json:"totalAmount"`
	DiscountPercentage float64    `gorm:"column:discount_percentage"          json:"discountPercentage"`
	DiscountedAmount   float64    `gorm:"column:discounted_amount"            json:"discountedAmount"`
	PaidAmount         float64    `gorm:"column:paid_amount"                  json:"paidAmount"`
	Comment            string     `gorm:"column:comment"                      json:"comment"`

	// Новый способ хранения PDF: путь к файлу на диске
	PDFFilePath string `gorm:"column:pdf_path" json:"pdfPath"`

	// Связи
	StudentID uint     `gorm:"column:student_id;index" json:"studentId"`
	Student   *Student `gorm:"foreignKey:StudentID"     json:"student,omitempty"`

	ManagerID uint  `gorm:"column:manager_id;index" json:"managerId"`
	Manager   *User `gorm:"foreignKey:ManagerID"     json:"manager,omitempty"`

	// Необязательная связь с формой оплаты (если есть модель)
	PaymentForm *PaymentForm `gorm:"foreignKey:PaymentFormId" json:"paymentForm,omitempty"`
}

func (Contract) TableName() string { return "contracts" }
