-- +goose Up
-- Создаем таблицу для хранения постов в новостной ленте
CREATE TABLE IF NOT EXISTS public.news_posts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT,
    media_url TEXT, -- URL для фото или видео
    media_type VARCHAR(50) -- 'image' или 'video'
);

-- Индекс для ускорения выборки постов пользователя
CREATE INDEX IF NOT EXISTS idx_news_posts_user_id ON public.news_posts(user_id);

-- +goose Down
-- Команда для отката миграции
DROP TABLE IF EXISTS public.news_posts;