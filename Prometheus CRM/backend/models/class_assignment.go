// prometheus-crm/models/class_assignment.go
package models

import "time"

// ClassAssignment связывает пользователя (сотрудника) с классом и его ролью в этом классе.
type ClassAssignment struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	ClassID     uint      `gorm:"not null" json:"classId"`
	UserID      uint      `gorm:"not null" json:"userId"`
	RoleInClass string    `gorm:"size:100;not null" json:"roleInClass"`
	CreatedAt   time.Time `json:"createdAt"`

	// Связи для GORM
	User User `gorm:"foreignKey:UserID"`
}
