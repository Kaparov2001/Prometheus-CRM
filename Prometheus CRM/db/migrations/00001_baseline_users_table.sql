-- +goose Up

CREATE SEQUENCE IF NOT EXISTS public.users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS public.users (
    id BIGINT NOT NULL DEFAULT nextval('users_id_seq'::regclass),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name TEXT,
    email TEXT,
    password TEXT,
    role TEXT,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT uni_users_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
    ON public.users (deleted_at ASC NULLS LAST);

-- +goose Down
-- пусто
