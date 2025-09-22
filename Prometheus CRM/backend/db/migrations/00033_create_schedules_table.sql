-- +goose Up
-- Создаем таблицу для хранения расписаний
CREATE TABLE IF NOT EXISTS public.schedules (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- Связь с классом
    class_id INTEGER NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    
    -- Параметры расписания
    academic_year VARCHAR(10) NOT NULL,
    quarter INTEGER NOT NULL,
    
    -- Данные расписания в формате JSONB для гибкости
    schedule_data JSONB,

    -- Гарантируем, что для одного класса не может быть двух одинаковых расписаний
    CONSTRAINT uq_schedule_class_year_quarter UNIQUE (class_id, academic_year, quarter)
);

-- Индекс для "мягкого" удаления
CREATE INDEX IF NOT EXISTS idx_schedules_deleted_at ON public.schedules(deleted_at);

-- Добавляем права доступа для нового модуля
INSERT INTO public.permissions (name, description, category) VALUES
    ('schedules_view', 'Просмотр расписаний', 'Справочники'),
    ('schedules_create', 'Создание и редактирование расписаний', 'Справочники'),
    ('schedules_delete', 'Удаление расписаний', 'Справочники')
ON CONFLICT (name) DO NOTHING;

-- Назначаем права роли 'admin'
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin' AND p.category = 'Справочники'
ON CONFLICT (role_id, permission_id) DO NOTHING;


-- +goose Down
-- Команды для отката миграции
DROP TABLE IF EXISTS public.schedules;
DELETE FROM public.permissions WHERE category = 'Справочники' AND name LIKE 'schedules_%';