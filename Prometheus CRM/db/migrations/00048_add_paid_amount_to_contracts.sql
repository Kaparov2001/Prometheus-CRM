-- FILE: crm/db/migrations/00048_add_paid_amount_to_contracts.sql
-- +goose Up
ALTER TABLE contracts
ADD COLUMN paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- +goose Down
ALTER TABLE contracts
DROP COLUMN paid_amount;