package models

import "gorm.io/gorm"

// Department представляет отдел или подразделение в компании
type Department struct {
	gorm.Model
	Name        string       `json:"name"`
	BudgetItems []BudgetItem `json:"budget_items,omitempty" gorm:"foreignKey:DepartmentID"`
}

// BudgetItem представляет конкретную статью бюджета, связанную с подразделением
type BudgetItem struct {
	gorm.Model
	Name         string          `json:"name"`
	DepartmentID uint            `json:"departmentId"`
	Department   Department      `json:"-" gorm:"foreignKey:DepartmentID"` // ИСПРАВЛЕНО ЗДЕСЬ
	Registry     []RegistryEntry `json:"registry,omitempty" gorm:"foreignKey:BudgetItemID"`
}

// RegistryEntry представляет отдельную запись в реестре под конкретной статьей бюджета
type RegistryEntry struct {
	gorm.Model
	Name         string `json:"name"`
	Amount       int64  `json:"budget_amount"`
	BudgetItemID uint   `json:"budget_item_id"`
	// --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Добавлен тег gorm для явного указания связи ---
	BudgetItem BudgetItem `json:"budget_item" gorm:"foreignKey:BudgetItemID"`
}
