// File: models/permission.go
package models

import "prometheus-crm/config" // Убедитесь, что этот путь импорта соответствует вашему go.mod

// Permission представляет модель права доступа в базе данных.
type Permission struct {
	ID          uint   `json:"id" gorm:"primaryKey"`
	Name        string `json:"name" gorm:"unique;not null"`
	Description string `json:"description"`
	Category    string `json:"category" gorm:"not null"` // Категория для группировки (e.g., "Пользователи", "Роли")
}

// GetUserPermissions получает все уникальные права доступа для пользователя через его роли.
func GetUserPermissions(userID uint) ([]Permission, error) {
	var user User
	db := config.DB

	// Находим пользователя и предзагружаем его роли, а также права доступа для каждой роли
	if err := db.Preload("Roles.Permissions").First(&user, userID).Error; err != nil {
		return nil, err
	}

	// Используем карту для сбора уникальных прав доступа, чтобы избежать дубликатов
	permissionMap := make(map[uint]Permission)
	for _, role := range user.Roles {
		for _, permission := range role.Permissions {
			permissionMap[permission.ID] = permission
		}
	}

	// Преобразуем карту обратно в слайс (массив)
	permissions := make([]Permission, 0, len(permissionMap))
	for _, permission := range permissionMap {
		permissions = append(permissions, permission)
	}

	return permissions, nil
}
