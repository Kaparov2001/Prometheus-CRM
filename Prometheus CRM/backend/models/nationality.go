package models

// Nationality представляет модель национальности в базе данных.
type Nationality struct {
	ID   uint   `json:"id" gorm:"primaryKey"`
	Name string `json:"name" gorm:"unique;not null"`
}
