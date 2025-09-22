-- +goose Up
-- Шаг 1: Удаляем старое ограничение уникальности, которое работало на всю таблицу.
-- Название ограничения "students_iin_key" взято из вашей ошибки.
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_iin_key;

-- Шаг 2: Создаем новое, частичное уникальное ограничение.
-- Оно будет проверять уникальность ИИН только для записей, у которых deleted_at IS NULL (т.е. для активных записей).
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_iin_unique_when_not_deleted
ON students (iin)
WHERE (deleted_at IS NULL);

-- +goose Down
-- Команды для отката миграции (если понадобится)

-- Удаляем новый, правильный индекс
DROP INDEX IF EXISTS idx_students_iin_unique_when_not_deleted;

-- Возвращаем старое, глобальное ограничение уникальности
ALTER TABLE students ADD CONSTRAINT students_iin_key UNIQUE (iin);