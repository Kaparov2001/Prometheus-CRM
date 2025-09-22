package models

// Role определяет модель роли в базе данных.
type Role struct {
	ID          uint         `json:"id" gorm:"primaryKey"`
	Name        string       `json:"name" gorm:"unique;not null"`
	Description string       `json:"description"`
	Permissions []Permission `json:"permissions" gorm:"many2many:role_permissions;"` // <-- ДОБАВИТЬ ЭТО ПОЛЕ
}
