// crm/models/grade.go
package models

import "gorm.io/gorm"

// Grade представляет учебный класс/параллель (например, 9 класс).
type Grade struct {
	gorm.Model
	Number uint   `json:"number" gorm:"not null;unique"`
	Name   string `json:"name" gorm:"not null;unique"` // Например, "Девятый класс"
}
