-- +goose Up
-- Добавляем колонку для хранения PDF в виде двоичных данных (байт)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS generated_pdf BYTEA;

-- Добавляем комментарий для ясности
COMMENT ON COLUMN public.contracts.generated_pdf IS 'Хранит автоматически сгенерированный PDF-файл договора';

-- +goose Down
-- Команда для отката миграции
ALTER TABLE public.contracts DROP COLUMN IF EXISTS generated_pdf;