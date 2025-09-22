-- +goose Up
-- Добавляем недостающие столбцы временных меток, которые GORM ожидает по умолчанию.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Добавляем индекс для "мягкого" удаления, если он еще не существует.
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(deleted_at);

-- +goose Down
-- Команды для отката миграции (на случай необходимости).
ALTER TABLE public.invoices DROP COLUMN IF EXISTS created_at;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS updated_at;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS deleted_at;
