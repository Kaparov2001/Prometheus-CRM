// crm/models/subject.go
package models

import "gorm.io/gorm"

// Subject представляет модель учебного предмета.
type Subject struct {
	gorm.Model
	Name string `json:"name" gorm:"unique;not null"`
}
