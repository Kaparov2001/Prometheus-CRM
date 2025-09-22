# Dockerfile (Упрощенная версия для работы с Compose)

# --- Этап 1: Сборка приложения ---
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Устанавливаем git для загрузки Go-модулей
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Собираем приложение
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/server ./cmd/api

# --- Этап 2: Создание минимального образа для запуска ---
FROM alpine:latest

WORKDIR /app

# Устанавливаем необходимые утилиты (libreoffice удален, так как он будет в отдельном сервисе)
RUN apk add --no-cache curl ca-certificates tzdata

# Устанавливаем goose для миграций
RUN curl -sSL https://raw.githubusercontent.com/pressly/goose/master/install.sh | sh

# Копируем скомпилированное приложение и другие необходимые файлы
COPY --from=builder /app/server .
COPY ./static ./static
COPY ./templates ./templates
COPY ./db ./db
COPY ./goose.yml .

EXPOSE 8080

# ✅ Просто запускаем бинарный файл. Переменные окружения передаст docker-compose.
CMD ["./server"]
