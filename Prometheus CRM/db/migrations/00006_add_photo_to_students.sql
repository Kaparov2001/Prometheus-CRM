-- +goose Up
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- +goose Down
ALTER TABLE students DROP COLUMN IF EXISTS photo_url;