-- +goose Up
-- Добавляем колонки для поддержки файлов и разных типов сообщений
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS file_url VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS file_size BIGINT;

-- +goose Down
-- Команда для отката миграции
ALTER TABLE public.chat_messages
DROP COLUMN IF EXISTS type,
DROP COLUMN IF EXISTS file_url,
DROP COLUMN IF EXISTS file_name,
DROP COLUMN IF EXISTS file_size;