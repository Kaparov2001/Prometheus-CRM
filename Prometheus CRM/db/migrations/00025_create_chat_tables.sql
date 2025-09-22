-- +goose Up
-- Таблица для хранения чатов (диалогов и групп)
CREATE TABLE IF NOT EXISTS public.chats (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name VARCHAR(255), -- Название для групповых чатов
    type VARCHAR(50) NOT NULL, -- 'personal', 'group', 'general'
    created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
    -- Поле для связи с сущностями CRM
    related_entity_type VARCHAR(50), -- например, 'deal', 'contact'
    related_entity_id INT
);

-- Связующая таблица для участников чата
CREATE TABLE IF NOT EXISTS public.chat_participants (
    chat_id INTEGER NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'member', 'admin'
    is_pinned BOOLEAN DEFAULT FALSE, -- Закреплен ли чат у этого пользователя
    PRIMARY KEY (chat_id, user_id)
);

-- Таблица для хранения сообщений
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    chat_id INTEGER NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    parent_message_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL -- Для ответов (reply)
);

-- Таблица для отслеживания статуса прочтения (последнее прочитанное сообщение)
CREATE TABLE IF NOT EXISTS public.message_read_statuses (
    chat_id INTEGER NOT NULL,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    last_read_message_id BIGINT,
    PRIMARY KEY (chat_id, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS public.message_read_statuses;
DROP TABLE IF EXISTS public.chat_messages;
DROP TABLE IF EXISTS public.chat_participants;
DROP TABLE IF EXISTS public.chats;