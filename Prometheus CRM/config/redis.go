// Prometheus CRM/config/redis.go
package config

import (
	"context"
	"log/slog"
	"os"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client
var Ctx = context.Background()

func ConnectRedis() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		slog.Warn("Переменная окружения REDIS_ADDR не установлена, кэширование будет отключено.")
		return
	}

	RDB = redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})

	// Проверяем соединение
	if _, err := RDB.Ping(Ctx).Result(); err != nil {
		slog.Error("Не удалось подключиться к Redis", "error", err)
		RDB = nil // Обнуляем клиент, чтобы приложение не пыталось его использовать
		return
	}

	slog.Info("Успешное подключение к Redis!")
}
