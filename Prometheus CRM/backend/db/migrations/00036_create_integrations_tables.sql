-- +goose Up
-- Таблица для хранения настроек различных интеграций
CREATE TABLE IF NOT EXISTS public.integration_settings (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    service_name VARCHAR(100) UNIQUE NOT NULL, -- Уникальное имя сервиса, например, 'trustme'
    is_enabled BOOLEAN DEFAULT FALSE,
    settings JSONB -- Поле для хранения настроек в формате JSON (токены, URL и т.д.)
);
COMMENT ON TABLE public.integration_settings IS 'Хранит настройки для внешних сервисов (API ключи, URL и т.д.)';

-- Таблица для отслеживания документов, отправленных во внешние сервисы
CREATE TABLE IF NOT EXISTS public.integration_documents (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    contract_id INTEGER NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE, -- Ссылка на наш внутренний договор
    service_name VARCHAR(100) NOT NULL, -- Название сервиса, куда отправлен документ
    external_document_id VARCHAR(255) NOT NULL, -- ID документа во внешней системе
    status VARCHAR(50) NOT NULL, -- Статус из внешней системы
    status_payload JSONB, -- Полный ответ по статусу от внешней системы
    UNIQUE(contract_id, service_name) -- Один договор можно отправить в один сервис только раз
);
COMMENT ON TABLE public.integration_documents IS 'Связывает договоры CRM с их аналогами во внешних сервисах подписания';


-- +goose Down
DROP TABLE IF EXISTS public.integration_documents;
DROP TABLE IF EXISTS public.integration_settings;