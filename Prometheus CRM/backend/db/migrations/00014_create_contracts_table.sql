-- +goose Up
-- Создание таблицы для хранения договоров
CREATE TABLE IF NOT EXISTS public.contracts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    -- Основные данные договора
    contract_number VARCHAR(255) UNIQUE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    signing_method VARCHAR(100), -- Способ подписания (например, 'Бумажный', 'Электронный')
    payment_method VARCHAR(100), -- Форма оплаты (например, 'Ежемесячно', 'По четвертям')

    -- Финансовые данные
    -- Используем NUMERIC для точности финансовых расчетов
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_percentage NUMERIC(5, 2) DEFAULT 0.00,
    discounted_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,

    -- Связи с другими таблицами (Foreign Keys)
    student_id INTEGER NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT, -- Нельзя удалить ученика, если у него есть договор
    manager_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT, -- Нельзя удалить менеджера, если у него есть договоры

    -- Индексы для ускорения поиска
    CONSTRAINT fk_contracts_student FOREIGN KEY (student_id) REFERENCES public.students(id),
    CONSTRAINT fk_contracts_manager FOREIGN KEY (manager_id) REFERENCES public.users(id)
);

-- Индекс для "мягкого" удаления
CREATE INDEX IF NOT EXISTS idx_contracts_deleted_at ON public.contracts(deleted_at);

-- Индексы для внешних ключей для ускорения JOIN-операций
CREATE INDEX IF NOT EXISTS idx_contracts_student_id ON public.contracts(student_id);
CREATE INDEX IF NOT EXISTS idx_contracts_manager_id ON public.contracts(manager_id);


-- +goose Down
-- Команда для отката миграции
DROP TABLE IF EXISTS public.contracts;