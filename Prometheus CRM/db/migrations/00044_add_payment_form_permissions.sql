-- +goose Up
-- Добавляем права для управления формами оплаты
INSERT INTO public.permissions (name, description, category) VALUES
    ('payment_forms_view', 'Просмотр форм оплаты', 'Справочники'),
    ('payment_forms_create', 'Создание новых форм оплаты', 'Справочники'),
    ('payment_forms_edit', 'Редактирование форм оплаты', 'Справочники'),
    ('payment_forms_delete', 'Удаление форм оплаты', 'Справочники')
ON CONFLICT (name) DO NOTHING;

-- Назначаем все новые права роли 'admin'
-- Это гарантирует, что администратор сразу получит доступ
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN (
    'payment_forms_view',
    'payment_forms_create',
    'payment_forms_edit',
    'payment_forms_delete'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- Команды для отката миграции (на всякий случай)
DELETE FROM public.permissions
WHERE name IN (
    'payment_forms_view',
    'payment_forms_create',
    'payment_forms_edit',
    'payment_forms_delete'
);