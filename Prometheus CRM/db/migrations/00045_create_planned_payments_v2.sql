-- +goose Up
CREATE TABLE IF NOT EXISTS public.planned_payments (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- Связь с договором
    contract_id INTEGER NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,

    -- Данные платежа
    payment_date DATE NOT NULL,
    planned_amount NUMERIC(12, 2) NOT NULL, -- Сумма, которую запланировали
    paid_amount NUMERIC(12, 2) DEFAULT 0.00, -- Сумма, которую фактически оплатили
    payment_name TEXT,
    comment TEXT,
    
    -- Статус для отслеживания (Ожидается, Оплачен, Частично оплачен, Просрочен)
    status VARCHAR(50) NOT NULL DEFAULT 'Ожидается',
    
    -- Поля для будущей интеграции с 1С
    external_id VARCHAR(255), -- Уникальный ID платежа из 1С
    last_sync_at TIMESTAMPTZ -- Время последней синхронизации с 1С
);

-- Индексы для ускорения
CREATE INDEX IF NOT EXISTS idx_planned_payments_contract_id ON public.planned_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_planned_payments_status ON public.planned_payments(status);
CREATE INDEX IF NOT EXISTS idx_planned_payments_external_id ON public.planned_payments(external_id);

-- Добавляем права (если не сделали ранее)
INSERT INTO public.permissions (name, description, category) VALUES
    ('planned_payments_view', 'Просмотр плана платежей', 'Договора и оплаты'),
    ('planned_payments_edit', 'Редактирование планов платежей', 'Договора и оплаты'),
    ('planned_payments_generate', 'Генерация планов платежей', 'Договора и оплаты')
ON CONFLICT (name) DO NOTHING;