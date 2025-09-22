-- +goose Up
CREATE TABLE contract_payments (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    contract_id INT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL,
    payment_form_id INT NOT NULL REFERENCES payment_forms(id),
    comment TEXT
);

CREATE INDEX idx_contract_payments_deleted_at ON contract_payments(deleted_at);
CREATE INDEX idx_contract_payments_contract_id ON contract_payments(contract_id);

-- +goose Down
DROP TABLE contract_payments;