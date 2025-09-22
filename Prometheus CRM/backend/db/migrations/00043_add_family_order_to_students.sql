-- +goose Up
-- Добавляем колонку для определения порядка скидки в семье
ALTER TABLE students ADD COLUMN family_order INTEGER DEFAULT 999;
-- Создаем индекс для ускорения сортировки
CREATE INDEX idx_students_family_order ON students (family_order);

-- +goose Down
ALTER TABLE students DROP COLUMN family_order;