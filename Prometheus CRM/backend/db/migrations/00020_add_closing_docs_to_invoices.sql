-- +goose Up
-- Добавляем новое поле для хранения путей к закрывающим документам.
-- Это будет JSONB массив, так как документов может быть несколько.
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS closing_documents JSONB;

-- Добавляем новое право доступа для загрузки закрывающих документов.
INSERT INTO public.permissions (name, description, category) VALUES
    ('invoices_upload_closing_docs', 'Загрузка закрывающих документов', 'Заявления')
ON CONFLICT (name) DO NOTHING;

-- +goose Down
-- Команды для отката миграции
ALTER TABLE public.invoices
DROP COLUMN IF EXISTS closing_documents;

DELETE FROM public.permissions
WHERE name = 'invoices_upload_closing_docs';