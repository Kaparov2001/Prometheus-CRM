-- +goose Up
CREATE TABLE IF NOT EXISTS public.payment_facts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    contract_id INTEGER NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_date DATE NOT NULL,
    academic_year VARCHAR(100),
    payment_name VARCHAR(255),
    payment_method VARCHAR(255)
);

CREATE INDEX idx_payment_facts_contract_id ON public.payment_facts(contract_id);
CREATE INDEX idx_payment_facts_deleted_at ON public.payment_facts(deleted_at);

-- +goose Down
DROP TABLE IF EXISTS public.payment_facts;