-- +goose Up
-- Добавляем новые поля для хранения путей к файлам бухгалтерии
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS payment_order_file_url TEXT,
ADD COLUMN IF NOT EXISTS power_of_attorney_file_url TEXT;

-- Добавляем новое право доступа для загрузки документов бухгалтерии
INSERT INTO public.permissions (name, description, category) VALUES
    ('invoices_upload_accounting_docs', 'Загрузка документов (Бухгалтерия)', 'Заявления')
ON CONFLICT (name) DO NOTHING;

-- Назначаем новое право роли 'admin'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name = 'invoices_upload_accounting_docs'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- Команды для отката миграции
ALTER TABLE public.invoices
DROP COLUMN IF EXISTS payment_order_file_url,
DROP COLUMN IF EXISTS power_of_attorney_file_url;

DELETE FROM public.permissions
WHERE name = 'invoices_upload_accounting_docs';