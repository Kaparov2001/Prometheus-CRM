-- crm/db/migrations/00034_create_subjects_table.sql

-- +goose Up
-- Создаем таблицу для хранения учебных предметов
CREATE TABLE IF NOT EXISTS public.subjects (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name VARCHAR(255) UNIQUE NOT NULL
);

-- Добавляем базовый набор предметов
INSERT INTO public.subjects (name) VALUES
('Алгебра'), ('Английский язык'), ('Биология'), ('География'),
('Геометрия'), ('Естествознание'), ('История Казахстана'),
('Казахский язык'), ('Математика'), ('Познание мира'),
('Русский язык'), ('Физика'), ('Физкультура'), ('Химия'),
('Художественный труд'), ('Цифровая грамотность'),
-- Школьные предметы
('Booky-wooky'), ('Daryn-go'), ('Робототехника')
ON CONFLICT (name) DO NOTHING;

-- +goose Down
-- Команда для отката миграции
DROP TABLE IF EXISTS public.subjects;