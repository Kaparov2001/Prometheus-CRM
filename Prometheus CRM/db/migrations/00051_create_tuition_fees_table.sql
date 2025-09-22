-- +goose Up
-- Create the table for tuition fees
CREATE TABLE IF NOT EXISTS public.tuition_fees (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    grade INT UNIQUE NOT NULL,
    cost_for2023 NUMERIC(12, 2) DEFAULT 0.00,
    current_cost NUMERIC(12, 2) DEFAULT 0.00
);

-- Pre-populate with grades 0 through 11
INSERT INTO public.tuition_fees (grade)
SELECT s.g FROM generate_series(0,11) AS s(g)
ON CONFLICT (grade) DO NOTHING;

-- Add permissions for the new page
INSERT INTO public.permissions (name, description, category) VALUES
    ('tuition_fees_view', 'View Tuition Fees', 'Directories'),
    ('tuition_fees_edit', 'Edit Tuition Fees', 'Directories')
ON CONFLICT (name) DO NOTHING;

-- Grant permissions to the admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN ('tuition_fees_view', 'tuition_fees_edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS public.tuition_fees;
DELETE FROM public.permissions WHERE name LIKE 'tuition_fees_%';