// crm/models/group.go
package models

import "gorm.io/gorm"

// Group представляет учебную группу внутри класса.
type Group struct {
	gorm.Model
	Name    string `json:"name" gorm:"not null"`
	ClassID uint   `json:"classId"` // Связь с конкретным классом (например, 9 "А")
}
