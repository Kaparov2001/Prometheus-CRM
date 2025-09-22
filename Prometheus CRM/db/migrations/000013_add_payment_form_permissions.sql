-- +goose Up
-- Создание таблицы для шаблонов договоров
CREATE TABLE IF NOT EXISTS public.contract_templates (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    name VARCHAR(255) NOT NULL,
    signature_type VARCHAR(50), -- 'Одностороннее', 'Двустороннее'
    classification VARCHAR(50), -- 'Контрагент', 'Сотрудник', 'Ученик'
    status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active' или 'inactive'
    
    -- Информация о файле
    file_path TEXT, -- Путь к файлу на сервере
    original_file_name TEXT,
    file_size BIGINT
);

CREATE INDEX IF NOT EXISTS idx_contract_templates_deleted_at ON public.contract_templates(deleted_at);

-- +goose Down
-- Команды для отката миграции
DROP TABLE IF EXISTS public.contract_templates;