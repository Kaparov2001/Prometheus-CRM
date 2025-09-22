-- +goose Up
-- Этот скрипт гарантирует, что у роли "admin" есть абсолютно все права,
-- существующие в системе на момент запуска миграции.
-- Это исправляет проблему, когда новые права не назначались админу автоматически.

INSERT INTO role_permissions (role_id, permission_id)
SELECT
    (SELECT id FROM roles WHERE name = 'admin'), -- Находим ID роли 'admin'
    p.id
FROM
    permissions p
ON CONFLICT (role_id, permission_id) DO NOTHING;
-- ON CONFLICT... гарантирует, что скрипт не вызовет ошибку, если какие-то права у админа уже есть.


-- +goose Down
-- Откат этой миграции не требуется, так как она лишь добавляет недостающие связи.
-- Оставляем этот блок пустым.