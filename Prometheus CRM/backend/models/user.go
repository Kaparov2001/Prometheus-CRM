package models

import (
	"time"

	"gorm.io/gorm"
)

// User определяет модель пользователя в базе данных в соответствии с новым ТЗ.
type User struct {
	gorm.Model
	// --- Основные поля ---
	Login     string     `json:"login" gorm:"unique;not null"` // Используем Login вместо Email для входа
	Password  string     `json:"-"`                            // Скрыто из JSON-ответов
	Email     string     `json:"email" gorm:"unique"`
	Phone     string     `json:"phone"`
	FullName  string     `json:"fullName"` // Заменили 'Name' на 'FullName' для ясности
	PhotoURL  string     `json:"photoUrl"`
	IIN       string     `json:"iin"`
	BirthDate *time.Time `json:"birthDate"`

	// --- Статус и метаданные ---
	Status           string     `json:"status" gorm:"default:'active'"` // 'active' или 'blocked'
	LastLoginAt      *time.Time `json:"lastLoginAt"`
	EmailConfirmedAt *time.Time `json:"emailConfirmedAt"`

	// --- Связи ---
	Roles       []Role            `json:"roles" gorm:"many2many:user_roles;"` // Связь многие-ко-многим с ролями
	Assignments []ClassAssignment `json:"assignments"`                        // Связь с назначениями в классах
}
