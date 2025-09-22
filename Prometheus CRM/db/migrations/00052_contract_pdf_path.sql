-- +goose Up
-- Добавляем путь к PDF и удаляем устаревшее бинарное поле, если оно было

BEGIN;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS pdf_path TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contracts' AND column_name = 'generated_pdf'
    ) THEN
        ALTER TABLE contracts DROP COLUMN generated_pdf;
    END IF;
END $$;

COMMIT;

-- +goose Down
-- Откат: убираем pdf_path (generated_pdf обратно не создаем)

BEGIN;

ALTER TABLE contracts
    DROP COLUMN IF EXISTS pdf_path;

COMMIT;
