-- +goose Up
-- Шаг 1: Создание новой таблицы для связи классов и пользователей (сотрудников).
CREATE TABLE IF NOT EXISTS public.class_assignments (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_in_class VARCHAR(100) NOT NULL, -- Роль в классе (например, "Классный руководитель", "Ассистент")
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Гарантируем, что один и тот же пользователь не может быть назначен на один и тот же класс дважды.
    CONSTRAINT uq_class_user UNIQUE (class_id, user_id)
);

-- Комментарий к таблице для ясности.
COMMENT ON TABLE public.class_assignments IS 'Связывает пользователей (сотрудников) с классами и их ролями в этих классах.';

-- Шаг 2: Перенос существующих классных руководителей в новую таблицу.
-- Этот код найдет всех существующих "teacher_id" и скопирует их в новую таблицу
-- с ролью "Классный руководитель".
INSERT INTO public.class_assignments (class_id, user_id, role_in_class)
SELECT id, teacher_id, 'Классный руководитель'
FROM public.classes
WHERE teacher_id IS NOT NULL
ON CONFLICT (class_id, user_id) DO NOTHING;

-- Шаг 3: Удаление старой колонки teacher_id из таблицы classes.
-- Теперь, когда данные перенесены, эта колонка нам больше не нужна.
ALTER TABLE public.classes DROP COLUMN IF EXISTS teacher_id;


-- +goose Down
-- Команды для отката миграции (на случай, если что-то пойдет не так).

-- Шаг 1 (откат): Возвращаем колонку teacher_id в таблицу classes.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS teacher_id INTEGER;

-- Шаг 2 (откат): Пытаемся вернуть данные о классных руководителях обратно.
-- Примечание: если на один класс было назначено несколько человек, вернется только один из них.
UPDATE public.classes
SET teacher_id = (
    SELECT user_id
    FROM public.class_assignments
    WHERE public.class_assignments.class_id = public.classes.id
      AND public.class_assignments.role_in_class = 'Классный руководитель'
    LIMIT 1
);

-- Шаг 3 (откат): Удаляем новую таблицу.
DROP TABLE IF EXISTS public.class_assignments;