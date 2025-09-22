-- +goose Up
-- Добавляем колонку для комментариев к таблице договоров
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS comment TEXT;

-- Добавляем права доступа для нового раздела "Сверка платежей"
INSERT INTO public.permissions (name, description, category) VALUES
    ('payment_reconciliation_view', 'Просмотр сверки платежей', 'Договора и оплаты')
ON CONFLICT (name) DO NOTHING;

-- Назначаем новое право роли 'admin', чтобы администратор сразу получил доступ
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name = 'payment_reconciliation_view'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- Команда для отката миграции (на случай, если что-то пойдет не так)
ALTER TABLE public.contracts DROP COLUMN IF EXISTS comment;
DELETE FROM public.permissions WHERE name = 'payment_reconciliation_view';