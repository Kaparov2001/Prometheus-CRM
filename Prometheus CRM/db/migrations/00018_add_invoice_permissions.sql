-- FILE: db/migrations/20250713000100_add_invoice_permissions.sql
-- +goose Up
INSERT INTO public.permissions (name, description, category) VALUES
    ('invoices_submit', 'Подача счетов на оплату', 'Заявления'),
    ('invoices_view_own', 'Просмотр собственных счетов', 'Заявления'),
    ('invoices_approve_finance', 'Согласование счетов (Фин. отдел)', 'Заявления'),
    ('invoices_process_accounting', 'Обработка счетов (Бухгалтерия)', 'Заявления'),
    ('invoices_view_all', 'Просмотр всех счетов', 'Заявления')
ON CONFLICT (name) DO NOTHING;

-- Назначаем права роли 'admin'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.category = 'Заявления'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- +goose Down
DELETE FROM public.permissions WHERE category = 'Заявления';
