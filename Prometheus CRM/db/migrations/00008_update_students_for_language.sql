-- +goose Up
ALTER TABLE students DROP COLUMN IF EXISTS course_id;
ALTER TABLE students ADD COLUMN IF NOT EXISTS language VARCHAR(50);

-- +goose Down
ALTER TABLE students DROP COLUMN IF EXISTS language;
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_id INTEGER;