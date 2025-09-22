-- +goose Up
-- Добавляем недостающую колонку для "мягкого удаления", которую ожидает GORM
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Создаем индекс для этой колонки для ускорения запросов
CREATE INDEX IF NOT EXISTS idx_chat_messages_deleted_at ON public.chat_messages(deleted_at);


-- +goose Down
-- Команда для отката миграции (если понадобится)
ALTER TABLE public.chat_messages
DROP COLUMN IF EXISTS deleted_at;