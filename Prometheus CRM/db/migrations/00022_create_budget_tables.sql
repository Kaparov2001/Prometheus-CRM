-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_items (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS registry_entries (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    budget_item_id INTEGER NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    amount BIGINT NOT NULL
);

INSERT INTO permissions (name, description, category) VALUES
('view_budget', 'Просмотр бюджета', 'Бюджет'),
('create_budget', 'Создание записей в бюджете', 'Бюджет'),
('delete_budget', 'Удаление записей в бюджете', 'Бюджет')
ON CONFLICT (name) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS registry_entries;
DROP TABLE IF EXISTS budget_items;
DROP TABLE IF EXISTS departments;

DELETE FROM permissions WHERE name IN ('view_budget', 'create_budget', 'delete_budget');
-- +goose StatementEnd