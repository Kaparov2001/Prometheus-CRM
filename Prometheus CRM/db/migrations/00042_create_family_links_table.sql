-- +goose Up
-- Создаем таблицу для хранения родственных связей между учениками
CREATE TABLE IF NOT EXISTS public.family_links (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- ID ученика, к которому привязывают родственника
    student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

    -- ID ученика, который является родственником
    relative_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

    -- Тип родства (на будущее, если понадобится)
    relationship_type VARCHAR(100) DEFAULT 'sibling', -- например, 'брат/сестра'

    -- Уникальность пары, чтобы нельзя было дважды добавить одного и того же родственника
    CONSTRAINT uq_student_relative UNIQUE (student_id, relative_id)
);

-- Индекс для быстрого поиска связей
CREATE INDEX IF NOT EXISTS idx_family_links_student_id ON public.family_links(student_id);
CREATE INDEX IF NOT EXISTS idx_family_links_relative_id ON public.family_links(relative_id);

-- Удаляем старую текстовую колонку из таблицы студентов
ALTER TABLE public.students DROP COLUMN IF EXISTS relatives_info;


-- +goose Down
-- Команды для отката миграции
DROP TABLE IF EXISTS public.family_links;

-- Возвращаем старую колонку
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS relatives_info TEXT;