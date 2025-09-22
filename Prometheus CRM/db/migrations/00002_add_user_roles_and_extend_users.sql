-- +goose Up
--
-- Шаг 1: Расширение таблицы "users" новыми полями из ТЗ
--
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS login VARCHAR(255), -- ИСПРАВЛЕНО: Добавлен недостающий столбец login
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS iin VARCHAR(12),
    ADD COLUMN IF NOT EXISTS birth_date DATE,
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

-- Для существующих пользователей (если они есть) временно заполняем login их email'ом
-- Это нужно, чтобы можно было добавить ограничение NOT NULL
UPDATE public.users SET login = email WHERE login IS NULL;

-- Добавляем ограничения, которые должны быть
ALTER TABLE public.users
    ALTER COLUMN login SET NOT NULL,
    ADD CONSTRAINT users_login_key UNIQUE (login);

--
-- Шаг 2: Создание таблицы "roles" для хранения ролей
--
CREATE TABLE IF NOT EXISTS public.roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Добавляем базовые роли
INSERT INTO public.roles (name, description) VALUES
('admin', 'Полный доступ ко всем функциям системы'),
('user', 'Стандартный пользователь с ограниченными правами')
ON CONFLICT (name) DO NOTHING;

--
-- Шаг 3: Создание связующей таблицы "user_roles"
--
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

--
-- Шаг 4: Перенос существующих ролей (если они были в старой структуре)
--
INSERT INTO public.roles (name, description)
SELECT DISTINCT role, 'Системная роль, перенесенная из старой структуры'
FROM public.users
WHERE role IS NOT NULL AND role != ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
JOIN public.roles r ON u.role = r.name
ON CONFLICT (user_id, role_id) DO NOTHING;

--
-- Шаг 5: Удаление старой колонки "role"
--
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- +goose Down
-- Откат изменений в обратном порядке

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.users
SET role = (
    SELECT r.name
    FROM public.roles r
    JOIN public.user_roles ur ON r.id = ur.role_id
    WHERE ur.user_id = public.users.id
    LIMIT 1
);

DROP TABLE IF EXISTS public.user_roles;
DROP TABLE IF EXISTS public.roles;

ALTER TABLE public.users
    DROP COLUMN IF EXISTS login, -- ИСПРАВЛЕНО: Добавлено удаление столбца login
    DROP COLUMN IF EXISTS phone,
    DROP COLUMN IF EXISTS full_name,
    DROP COLUMN IF EXISTS photo_url,
    DROP COLUMN IF EXISTS iin,
    DROP COLUMN IF EXISTS birth_date,
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS last_login_at,
    DROP COLUMN IF EXISTS email_confirmed_at;
