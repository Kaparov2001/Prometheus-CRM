-- +goose Up
-- Создаем статичного пользователя для ИИ-Ассистента
-- Используем высокий ID (99999), чтобы избежать конфликтов с обычными пользователями
INSERT INTO public.users (id, login, full_name, email, password, status, created_at, updated_at, photo_url)
VALUES (
    99999,
    'ai_assistant',
    'ИИ-Ассистент',
    'ai@prometheus.school',
    '--locked--', -- Пароль не нужен, так как вход не предполагается
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    '/static/images/ai_avatar.png' -- Путь к аватару ИИ
)
ON CONFLICT (id) DO NOTHING;

-- Сбрасываем счетчик, чтобы следующий реальный пользователь не получил ID 100000
-- Находим максимальный "человеческий" ID и устанавливаем счетчик на следующее значение
SELECT setval('public.users_id_seq', COALESCE((SELECT MAX(id) FROM public.users WHERE id < 99999), 1), true);


-- +goose Down
-- Удаляем пользователя ИИ-Ассистента
DELETE FROM public.users WHERE id = 99999;