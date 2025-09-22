// prometheus-crm/models/planned_payment.go
package models

import (
	"time"

	// ИСПРАВЛЕНИЕ: Убран лишний "io" из пути импорта.
	"gorm.io/gorm"
)

// PlannedPayment представляет модель запланированного платежа в системе.
// Каждая запись в этой модели - это отдельная строка в графике платежей по договору.
type PlannedPayment struct {
	// gorm.Model встраивает стандартные поля: ID, CreatedAt, UpdatedAt, DeletedAt.
	gorm.Model

	// ContractID - это внешний ключ для связи с таблицей 'contracts'.
	// Он указывает, к какому именно договору относится этот платеж.
	ContractID uint `json:"contractId"`

	// Contract - это поле для GORM, чтобы автоматически подгружать данные
	// о связанном договоре при необходимости (например, номер договора или данные студента).
	// Тег json:"-" означает, что это поле не будет видно в стандартных JSON-ответах API,
	// чтобы избежать цикличных ссылок и лишних данных.
	Contract Contract `json:"-"`

	// PaymentDate - это конкретная дата, на которую запланирована оплата.
	PaymentDate time.Time `json:"paymentDate"`

	// PlannedAmount - сумма, которая должна быть оплачена по плану.
	// gorm:"type:numeric(12,2)" указывает GORM, что в базе данных
	// это поле соответствует типу NUMERIC с 2 знаками после запятой для точности финансовых расчетов.
	PlannedAmount float64 `json:"plannedAmount" gorm:"type:numeric(12,2)"`

	// PaidAmount - фактическая сумма, которая была внесена по этому платежу.
	// По умолчанию равна 0 и обновляется после получения данных об оплате (например, из 1С).
	PaidAmount float64 `json:"paidAmount" gorm:"type:numeric(12,2)"`

	// PaymentName - текстовое наименование платежа, например, "1 транш".
	PaymentName string `json:"paymentName"`

	// Comment - произвольный комментарий для внутреннего использования.
	Comment string `json:"comment"`

	// Status - текущий статус платежа ('Ожидается', 'Оплачен', 'Просрочен' и т.д.).
	Status string `json:"status"`

	// ExternalID - поле для хранения уникального идентификатора транзакции из внешней системы (1С).
	// Используется для предотвращения дублирования платежей при синхронизации.
	// Указатель *string позволяет этому полю быть NULL в базе данных, если синхронизации еще не было.
	ExternalID *string `json:"externalId"`

	// LastSyncAt - временная метка последней синхронизации с 1С.
	// Помогает понять, насколько актуальны данные по этому платежу.
	LastSyncAt *time.Time `json:"lastSyncAt"`
}
