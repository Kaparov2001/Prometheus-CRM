-- +goose Up
-- These indexes are critical for speeding up common filtering and sorting operations.

-- Index for searching by student's last and first names
CREATE INDEX IF NOT EXISTS idx_students_last_name_first_name ON public.students (last_name, first_name);

-- Index for quickly finding students in a specific class
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students (class_id);

-- Index for filtering by studying status
CREATE INDEX IF NOT EXISTS idx_students_is_studying ON public.students (is_studying);


-- +goose Down
-- Commands to roll back the migration

DROP INDEX IF EXISTS idx_students_last_name_first_name;
DROP INDEX IF EXISTS idx_students_class_id;
DROP INDEX IF EXISTS idx_students_is_studying;