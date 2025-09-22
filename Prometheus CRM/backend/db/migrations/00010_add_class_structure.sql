-- +goose Up
CREATE TABLE IF NOT EXISTS class_grades (
    grade_number INTEGER PRIMARY KEY
);
INSERT INTO class_grades (grade_number) VALUES
(0), (1), (2), (3), (4), (5), (6), (7), (8), (9), (10), (11)
ON CONFLICT (grade_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS class_liters (
    id SERIAL PRIMARY KEY,
    liter_char VARCHAR(3) UNIQUE NOT NULL
);
INSERT INTO class_liters (liter_char) VALUES
('А'), ('Ә'), ('Б'), ('В'), ('Г'), ('Д'), ('Е')
ON CONFLICT (liter_char) DO NOTHING;

CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    grade_number INTEGER NOT NULL REFERENCES class_grades(grade_number),
    liter_id INTEGER NOT NULL REFERENCES class_liters(id),
    teacher_id INTEGER,
    language VARCHAR(50),
    study_type VARCHAR(50), -- ИСПРАВЛЕНО: Добавлена колонка
    UNIQUE (grade_number, liter_id)
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS class_id INTEGER;

ALTER TABLE students
ADD CONSTRAINT fk_students_class_constraint
FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_students_class_constraint;
ALTER TABLE students DROP COLUMN IF EXISTS class_id;

DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS class_liters;
DROP TABLE IF EXISTS class_grades;