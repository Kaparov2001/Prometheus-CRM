-- +goose Up
-- Удаляем старые колонки для одного файла из таблицы новостей
ALTER TABLE public.news_posts
DROP COLUMN IF EXISTS file_url,
DROP COLUMN IF EXISTS file_type;

-- Создаем новую таблицу для хранения нескольких файлов для одного поста
CREATE TABLE IF NOT EXISTS public.news_post_files (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    news_post_id INTEGER NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_type VARCHAR(50) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_post_files_deleted_at ON public.news_post_files(deleted_at);


-- +goose Down
-- Удаляем новую таблицу
DROP TABLE IF EXISTS public.news_post_files;

-- Возвращаем старые колонки
ALTER TABLE public.news_posts
ADD COLUMN file_url TEXT,
ADD COLUMN file_type VARCHAR(255);