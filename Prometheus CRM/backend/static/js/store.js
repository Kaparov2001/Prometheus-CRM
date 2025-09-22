// ===================================================================
// Prometheus CRM/static/js/store.js
// Description: Глобальное хранилище данных пользователя (профиль, права).
// ===================================================================

import { fetchAuthenticated } from './utils.js';

// Приватное состояние, которое хранит данные пользователя.
const state = {
    profile: null,
    isProfileLoaded: false
};

// Экспортируемый объект $user, который предоставляет безопасный доступ к данным.
export const $user = {
    /**
     * Возвращает текущее состояние профиля.
     * @returns {object|null} Профиль пользователя или null, если он не загружен.
     */
    get() {
        return state;
    },

    /**
     * Проверяет, есть ли у пользователя указанное право.
     * @param {string} permission - Системное имя права для проверки.
     * @returns {boolean} - true, если право есть, иначе false.
     */
    hasPermission(permission) {
        if (!state.isProfileLoaded || !state.profile || !state.profile.permissions) {
            console.warn(`Проверка права '${permission}' вызвана до полной загрузки профиля.`);
            return false;
        }

        // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ---
        // Если в списке прав пользователя есть строка 'admin',
        // эта функция ВСЕГДА будет возвращать true для любого запрошенного права.
        if (state.profile.permissions.includes('admin')) {
            return true;
        }
        
        // Если пользователь не админ, ищем право в его списке.
        return state.profile.permissions.includes(permission);
    },

    /**
     * Загружает профиль пользователя с сервера.
     * Если профиль уже загружен, возвращает его без повторного запроса.
     * @returns {Promise<object>} - Профиль пользователя.
     */
    async loadProfile() {
        if (state.isProfileLoaded) {
            return state.profile;
        }
        try {
            const profileData = await fetchAuthenticated('/api/profile');
            // Устанавливаем профиль и флаг, что загрузка завершена.
            setUserProfile(profileData);
            console.log("Профиль пользователя успешно загружен и сохранен в store.", state.profile);
            return state.profile;
        } catch (error) {
            console.error("Критическая ошибка: не удалось загрузить профиль пользователя.", error);
            // В случае ошибки перенаправляем на страницу входа.
            window.location.href = '/'; 
            throw error;
        }
    }
};

/**
 * Внешняя функция для установки профиля. Используется в dashboard.js.
 * @param {object} profileData - Данные профиля, полученные от сервера.
 */
export function setUserProfile(profileData) {
    state.profile = profileData;
    state.isProfileLoaded = true; // Устанавливаем флаг после успешной загрузки
}