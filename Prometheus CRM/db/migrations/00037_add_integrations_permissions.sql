-- +goose Up
INSERT INTO public.permissions (name, description, category) VALUES
    ('integrations_view', 'Просмотр страницы интеграций', 'Администрирование'),
    ('integrations_manage', 'Управление интеграциями', 'Администрирование')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN ('integrations_view', 'integrations_manage')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- +goose Down
DELETE FROM public.permissions WHERE name LIKE 'integrations_%';