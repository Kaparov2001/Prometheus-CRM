// Prometheus CRM/config/database.go

package config

import (
	"log/slog"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func ConnectDB() {
	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		// Используем новый логгер для критической ошибки
		slog.Error("Критическая ошибка: переменная окружения DB_URL не установлена.")
		os.Exit(1) // Завершаем работу приложения
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		// Логируем ошибку с деталями
		slog.Error("Ошибка подключения к БД", "error", err)
		os.Exit(1)
	}

	DB = db
	slog.Info("Успешное подключение к базе данных!")
}
