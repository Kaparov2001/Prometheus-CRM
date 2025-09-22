-- +goose Up
-- Добавляем права для управления договорами и справочниками.
-- Мы используем ON CONFLICT DO NOTHING, чтобы избежать ошибок при повторном запуске миграции.

INSERT INTO public.permissions (name, description, category) VALUES
    -- Договоры
    ('contracts_create', 'Создание договоров', 'Финансы'),
    ('contracts_edit', 'Редактирование договоров', 'Финансы'),
    ('contracts_delete', 'Удаление договоров', 'Финансы'),

    -- Справочник: Национальности
    ('nationalities_view', 'Просмотр справочника национальностей', 'Справочники'),
    ('nationalities_create', 'Создание записей в справочнике национальностей', 'Справочники'),
    ('nationalities_edit', 'Редактирование записей в справочнике национальностей', 'Справочники'),
    ('nationalities_delete', 'Удаление записей из справочника национальностей', 'Справочники')
ON CONFLICT (name) DO NOTHING;

-- ИСПРАВЛЕНО: Заменен блок DO $$ на более простой и надежный запрос INSERT-SELECT.
-- Эта конструкция назначает новые права роли 'admin'.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' -- Выбираем только роль admin
  AND p.name IN (
    'contracts_create', 'contracts_edit', 'contracts_delete',
    'nationalities_view', 'nationalities_create', 'nationalities_edit', 'nationalities_delete'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- При откате миграции удаляем только те права, которые были добавлены.
DELETE FROM public.permissions
WHERE name IN (
    'contracts_create', 'contracts_edit', 'contracts_delete',
    'nationalities_view', 'nationalities_create', 'nationalities_edit', 'nationalities_delete'
);