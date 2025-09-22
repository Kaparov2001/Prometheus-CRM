-- +goose Up
ALTER TABLE contracts
ADD COLUMN payment_form_id INTEGER REFERENCES payment_forms(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE contracts
DROP COLUMN payment_form_id;