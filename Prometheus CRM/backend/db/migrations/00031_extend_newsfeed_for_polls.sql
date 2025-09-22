-- +goose Up
-- Расширяем существующую таблицу news_posts
ALTER TABLE public.news_posts RENAME COLUMN user_id TO author_id;
ALTER TABLE public.news_posts
    ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'message',
    ADD COLUMN IF NOT EXISTS poll_question TEXT;
ALTER TABLE public.news_posts RENAME COLUMN media_url TO file_url;
ALTER TABLE public.news_posts RENAME COLUMN media_type TO file_type;

-- Создаем таблицу для вариантов ответов в опросах
CREATE TABLE IF NOT EXISTS public.poll_options (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    news_post_id INTEGER NOT NULL REFERENCES public.news_posts(id) ON DELETE CASCADE,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poll_options_deleted_at ON public.poll_options(deleted_at);


-- Создаем таблицу для голосов
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    poll_option_id INTEGER NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_vote_on_poll UNIQUE (poll_option_id, user_id) -- Пользователь может проголосовать только один раз за вариант
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_deleted_at ON public.poll_votes(deleted_at);


-- +goose Down
DROP TABLE IF EXISTS public.poll_votes;
DROP TABLE IF EXISTS public.poll_options;

ALTER TABLE public.news_posts RENAME COLUMN author_id TO user_id;
ALTER TABLE public.news_posts DROP COLUMN IF EXISTS type;
ALTER TABLE public.news_posts DROP COLUMN IF EXISTS poll_question;
ALTER TABLE public.news_posts RENAME COLUMN file_url TO media_url;
ALTER TABLE public.news_posts RENAME COLUMN file_type TO media_type;