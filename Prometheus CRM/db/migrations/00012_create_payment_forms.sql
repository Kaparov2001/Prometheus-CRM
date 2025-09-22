-- +goose Up
-- Создание таблицы для форм оплаты
CREATE TABLE IF NOT EXISTS public.payment_forms (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name VARCHAR(255) NOT NULL,
    installments_count INTEGER NOT NULL DEFAULT 1
);

-- Создание таблицы для хранения конкретных платежей (частей формы)
CREATE TABLE IF NOT EXISTS public.payment_installments (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    payment_form_id INTEGER NOT NULL REFERENCES public.payment_forms(id) ON DELETE CASCADE,
    month VARCHAR(20) NOT NULL,
    day INTEGER NOT NULL,
    formula TEXT -- Поле для индивидуальной формулы
);

-- Индексы для ускорения выборок
CREATE INDEX IF NOT EXISTS idx_payment_forms_deleted_at ON public.payment_forms(deleted_at);
CREATE INDEX IF NOT EXISTS idx_payment_installments_payment_form_id ON public.payment_installments(payment_form_id);


-- +goose Down
-- Команды для отката миграции
DROP TABLE IF EXISTS public.payment_installments;
DROP TABLE IF EXISTS public.payment_forms;