-- +goose Up
-- Шаг 1: Создание таблицы для хранения всех возможных прав доступа (permissions)
CREATE TABLE IF NOT EXISTS public.permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL, -- Уникальное имя права, например, "users_create"
    description TEXT,                  -- Понятное описание, например, "Создание пользователей"
    category VARCHAR(100) NOT NULL     -- Категория для группировки в интерфейсе, например, "Пользователи"
);

-- Шаг 2: Создание связующей таблицы для ролей и прав (многие-ко-многим)
CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id) -- Гарантирует уникальность пары "роль-право"
);

-- Шаг 3: Наполнение таблицы permissions базовыми правами на основе структуры вашего проекта
-- Мы используем ON CONFLICT DO NOTHING, чтобы избежать ошибок при повторном запуске миграции.
INSERT INTO public.permissions (name, description, category) VALUES
    ('users_view', 'Просмотр списка пользователей', 'Пользователи'),
    ('users_create', 'Создание новых пользователей', 'Пользователи'),
    ('users_edit', 'Редактирование пользователей', 'Пользователи'),
    ('users_delete', 'Удаление пользователей', 'Пользователи'),

    ('roles_view', 'Просмотр списка ролей', 'Роли и Права'),
    ('roles_create', 'Создание новых ролей', 'Роли и Права'),
    ('roles_edit', 'Редактирование ролей и их прав', 'Роли и Права'),
    ('roles_delete', 'Удаление ролей', 'Роли и Права'),

    ('students_view', 'Просмотр списка учеников', 'Ученики'),
    ('students_create', 'Создание новых учеников', 'Ученики'),
    ('students_edit', 'Редактирование данных учеников', 'Ученики'),
    ('students_delete', 'Удаление учеников', 'Ученики'),

    ('classes_view', 'Просмотр списка классов', 'Классы'),
    ('classes_create', 'Создание новых классов', 'Классы'),
    ('classes_edit', 'Редактирование классов', 'Классы'),
    ('classes_delete', 'Удаление классов', 'Классы'),

    ('finances_view_reports', 'Просмотр финансовых отчетов', 'Финансы'),
    ('contracts_view', 'Просмотр договоров', 'Финансы')
ON CONFLICT (name) DO NOTHING;


-- +goose Down
-- Команды для отката миграции (удаление созданных таблиц)
DROP TABLE IF EXISTS public.role_permissions;
DROP TABLE IF EXISTS public.permissions;