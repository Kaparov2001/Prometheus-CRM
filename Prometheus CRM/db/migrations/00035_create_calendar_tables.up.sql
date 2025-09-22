-- +goose Up
CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    color VARCHAR(7),
    location TEXT,
    google_meet_link TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_participants (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined
    UNIQUE(event_id, user_id)
);

-- Индекс для быстрого поиска событий по пользователю
CREATE INDEX idx_events_owner_id ON events(owner_id);
-- Индекс для быстрого поиска событий, в которых пользователь участвует
CREATE INDEX idx_event_participants_user_id ON event_participants(user_id);

-- +goose Down
DROP TABLE IF EXISTS event_participants;
DROP TABLE IF EXISTS events;