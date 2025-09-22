-- +goose Up
-- Создаем таблицу для хранения национальностей
CREATE TABLE IF NOT EXISTS nationalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Добавляем несколько примеров, чтобы справочник не был пустым
-- ON CONFLICT DO NOTHING предотвращает ошибки при повторном запуске миграции
INSERT INTO nationalities (name) VALUES
('Казах'),
('Русский'),
('Узбек'),
('Украинец'),
('Уйгур'),
('Татарин')
ON CONFLICT (name) DO NOTHING;

-- +goose Down
-- Команда для отката миграции
DROP TABLE IF EXISTS nationalities;
