-- +goose Up
-- Исправленная миграция для таблицы students, соответствующая Go-модели.
-- Включает все поля из Go-структуры models.Student с правильными именами в snake_case
-- и соответствующими типами данных.

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- --- ВКЛАДКА "ОСНОВНАЯ ИНФОРМАЦИЯ" ---
    -- is_studying: Добавлено, соответствует GORM-модели
    is_studying BOOLEAN DEFAULT TRUE,
    last_name VARCHAR(100) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    iin VARCHAR(12) UNIQUE,
    gender VARCHAR(10),
    birth_date DATE, -- Используем DATE, если время не важно
    student_phone VARCHAR(20), -- Соответствует Go-модели
    email VARCHAR(100),
    start_date DATE, -- Соответствует Go-модели
    end_date DATE,   -- Соответствует Go-модели
    mothers_name VARCHAR(255), -- Соответствует Go-модели
    mothers_phone VARCHAR(20), -- Соответствует Go-модели
    fathers_name VARCHAR(255), -- Соответствует Go-модели
    fathers_phone VARCHAR(20), -- Соответствует Go-модели
    relatives_info TEXT,
    comments TEXT, -- Соответствует Go-модели
    course_id INTEGER, -- Foreign Key, если есть таблица courses
    grade_id INTEGER,  -- Foreign Key, если есть таблица grades
    group_id INTEGER,  -- Foreign Key, если есть таблица groups

    -- --- ВКЛАДКА "ИНФОРМАЦИЯ ДЛЯ ДОГОВОРА" ---
    contract_parent_name VARCHAR(255),
    contract_parent_iin VARCHAR(12),
    contract_parent_birth_date DATE, -- Соответствует Go-модели
    contract_parent_email VARCHAR(100),
    contract_parent_phone VARCHAR(20),
    contract_parent_document_number VARCHAR(50), -- Соответствует Go-модели
    contract_parent_document_info TEXT, -- Соответствует Go-модели

    -- --- ВКЛАДКА "ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ" ---
    is_resident BOOLEAN DEFAULT TRUE,
    birth_certificate_number VARCHAR(50),
    birth_certificate_issue_info TEXT, -- Соответствует Go-модели
    mothers_work_place TEXT, -- Соответствует Go-модели
    fathers_work_place TEXT, -- Соответствует Go-модели
    mothers_job_title VARCHAR(255), -- Соответствует Go-модели
    fathers_job_title VARCHAR(255), -- Соответствует Go-модели
    home_address TEXT, -- Соответствует Go-модели
    medical_info TEXT, -- Соответствует Go-модели
    shuttle_route_id INTEGER,
    clinic_id INTEGER,
    nationality_id INTEGER,
    previous_school_id INTEGER
);

-- +goose Down
DROP TABLE IF EXISTS students;
