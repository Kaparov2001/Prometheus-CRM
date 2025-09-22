-- +goose Up
-- Сначала удаляем таблицу, если она существует, чтобы гарантировать чистое состояние.
-- Это предотвращает ошибки при повторном запуске миграции после сбоя.
DROP TABLE IF EXISTS public.invoices CASCADE;

-- Создаем таблицу со всеми необходимыми полями и ограничениями
CREATE TABLE public.invoices (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- Внешний ключ на таблицу пользователей
    user_id BIGINT NOT NULL REFERENCES public.users(id),

    -- Детали счета
    department VARCHAR(255) NOT NULL,
    register_item TEXT NOT NULL,
    budget_item TEXT NOT NULL,
    kontragent VARCHAR(255),
    bin VARCHAR(50),
    invoice_number VARCHAR(100),
    invoice_date DATE,
    total_amount NUMERIC(12, 2),
    payment_purpose TEXT,
    
    -- Статус и рабочий процесс
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    rejection_reason TEXT,
    payment_date DATE,
    
    -- Пути к файлам
    invoice_file_url TEXT,
    contract_file_url TEXT,
    memo_file_url TEXT
);

-- Создаем индексы для ускорения запросов
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON public.invoices(deleted_at);

-- +goose Down
-- Команда отката просто удаляет таблицу
DROP TABLE IF EXISTS public.invoices;
