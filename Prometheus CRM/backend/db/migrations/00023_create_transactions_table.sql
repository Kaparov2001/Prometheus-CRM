-- +goose Up
-- Создаем таблицу для хранения транзакций по счетам
CREATE TABLE IF NOT EXISTS public.transactions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- ID записи в реестре, с которой списывается сумма
    registry_entry_id INTEGER NOT NULL REFERENCES public.registry_entries(id) ON DELETE CASCADE,

    -- ID счета, который является основанием для списания
    invoice_id INTEGER NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

    -- Сумма транзакции
    amount NUMERIC(12, 2) NOT NULL,

    -- Уникальный индекс, чтобы предотвратить двойное списание по одному счету
    CONSTRAINT uq_invoice_transaction UNIQUE (invoice_id)
);

-- Индексы для ускорения выборок
CREATE INDEX IF NOT EXISTS idx_transactions_registry_entry_id ON public.transactions(registry_entry_id);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice_id ON public.transactions(invoice_id);


-- +goose Down
-- Команда для отката миграции
DROP TABLE IF EXISTS public.transactions;