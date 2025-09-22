-- +goose Up
-- Переименовываем колонку created_by в created_by_id для соответствия с моделью GORM
ALTER TABLE public.chats
RENAME COLUMN created_by TO created_by_id;

-- +goose Down
-- Команда для отката (возвращает старое имя)
ALTER TABLE public.chats
RENAME COLUMN created_by_id TO created_by;