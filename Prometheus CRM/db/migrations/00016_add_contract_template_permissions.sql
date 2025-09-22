-- +goose Up
-- Добавляем права для управления шаблонами договоров
INSERT INTO public.permissions (name, description, category) VALUES
    ('contract_templates_view', 'Просмотр шаблонов договоров', 'Шаблоны'),
    ('contract_templates_create', 'Создание новых шаблонов договоров', 'Шаблоны'),
    ('contract_templates_edit', 'Редактирование существующих шаблонов договоров', 'Шаблоны'),
    ('contract_templates_delete', 'Удаление шаблонов договоров', 'Шаблоны')
ON CONFLICT (name) DO NOTHING;

-- Назначаем все новые права роли 'admin'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.category = 'Шаблоны'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- Команды для отката миграции
DELETE FROM public.permissions
WHERE category = 'Шаблоны';