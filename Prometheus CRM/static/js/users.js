// ===================================================================
// Prometheus CRM/static/js/users.js
// Description: Manages the "Users" page, including listing, creating,
// editing, and deleting user records.
// Depends on: utils.js
// ===================================================================

import { 
    fetchAuthenticated, 
    openModal, 
    closeModal, 
    showAlert, 
    populateDropdown, 
    initializeActionDropdowns, 
    setupPhotoPreview,
    renderPagination
} from './utils.js';

// Global variables for DOM elements and state
let userModal, userForm, closeModalBtn, cancelBtn, modalTitle, usersTableBody, addUserBtn, paginationContainer;
let userPhotoInput, userPhotoPreview;
let currentEditingId = null;

/**
 * Initializes all DOM elements and event listeners for the Users page.
 */
window.initializeUsersPage = function() {
    userModal = document.getElementById('userModal');
    userForm = document.getElementById('userForm');
    closeModalBtn = document.getElementById('closeUserModalBtn');
    cancelBtn = document.getElementById('cancelUserBtn');
    modalTitle = userModal ? userModal.querySelector('.modal-header h4') : null;
    usersTableBody = document.getElementById("usersTableBody");
    addUserBtn = document.getElementById('addUserBtn');
    userPhotoInput = document.getElementById('userPhotoInput');
    userPhotoPreview = document.getElementById('userPhotoPreview');
    paginationContainer = document.getElementById("paginationContainer");

    if (!userModal || !userForm || !usersTableBody || !addUserBtn || !modalTitle || !userPhotoInput || !userPhotoPreview) {
        console.error("Critical DOM elements for users page not found. Initialization aborted.");
        return;
    }

    // Event Listeners
    addUserBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => closeModal(userModal, () => userForm.reset()));
    cancelBtn.addEventListener('click', () => closeModal(userModal, () => userForm.reset()));
    userForm.addEventListener('submit', handleFormSubmit);
    usersTableBody.addEventListener('click', handleTableActions);
    setupPhotoPreview(userPhotoInput, userPhotoPreview);

    // Initial fetch
    fetchAndRenderUsers(1);
};

/**
 * Fetches and renders a list of users for a specific page.
 * @param {number} page - The page number to fetch.
 */
async function fetchAndRenderUsers(page = 1) {
    if (!usersTableBody || !paginationContainer) {
        console.error("Table body or pagination container for users not found.");
        return;
    }
    usersTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const response = await fetchAuthenticated(`/api/users?page=${page}`);
        const users = response.data;

        if (users && users.length > 0) {
            usersTableBody.innerHTML = users.map(user => {
                const statusClass = user.status === 'active' ? 'active' : 'blocked';
                const statusText = user.status === 'active' ? 'Активен' : 'Заблокирован';
                const roles = Array.isArray(user.roles) ? user.roles.join(', ') : 'Нет ролей';

                return `
                <tr data-id="${user.id}">
                    <td data-label="ID">${user.id}</td>
                    <td data-label="Логин">${user.login || '—'}</td>
                    <td data-label="ФИО">${user.fullName || '—'}</td>
                    <td data-label="Email">${user.email || '—'}</td>
                    <td data-label="Статус"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Роли">${roles}</td>
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-user-btn" data-id="${user.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-user-btn" data-id="${user.id}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        } else {
            usersTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Пользователи не найдены.</td></tr>`;
        }
        
        renderPagination(paginationContainer, response.currentPage, response.totalPages, fetchAndRenderUsers);
        
        initializeActionDropdowns();
        window.updateTableActionsVisibility();
    } catch (error) {
        usersTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Не удалось загрузить список пользователей: ${error.message}</td></tr>`;
        console.error("Error fetching users:", error);
    }
}

function openModalForCreate() {
    currentEditingId = null;
    modalTitle.textContent = "Создать пользователя";
    userForm.reset();
    document.getElementById('user_login').readOnly = false;
    document.getElementById('user-password-group').style.display = 'block';
    document.getElementById('user_password').placeholder = "Пароль (обязательно)";
    document.getElementById('user_password').required = true;
    userPhotoPreview.src = '/static/placeholder.png';
    userPhotoPreview.style.display = 'block';
    populateRolesSelect();
    openModal(userModal);
}

async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.textContent = "Изменить пользователя";
    userForm.reset();
    try {
        const user = await fetchAuthenticated(`/api/users/${id}`);
        document.getElementById('user_login').value = user.login;
        document.getElementById('user_login').readOnly = true;
        document.getElementById('user_fullName').value = user.fullName;
        document.getElementById('user_email').value = user.email;
        document.getElementById('user_phone').value = user.phone || '';
        document.getElementById('user_status').value = user.status;
        document.getElementById('user-password-group').style.display = 'block';
        document.getElementById('user_password').placeholder = "Оставьте пустым, чтобы не менять";
        document.getElementById('user_password').required = false;
        userPhotoPreview.src = user.photoUrl || '/static/placeholder.png';
        userPhotoPreview.style.display = 'block';
        const selectedRoleIds = user.roles ? user.roles.map(r => r.ID) : [];
        await populateRolesSelect(selectedRoleIds);
        openModal(userModal);
    } catch (error) {
        showAlert(`Ошибка при загрузке данных пользователя: ${error.message}`, 'error');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // 1. Используем FormData напрямую для отправки файла
    const formData = new FormData(userForm);

    // 2. Собираем ID ролей и добавляем их в formData
    const roleIds = Array.from(userForm.elements.roles.selectedOptions).map(option => option.value);
    formData.delete('roles'); 
    roleIds.forEach(id => {
        formData.append('roleIds', id);
    });

    let url, method;

    if (currentEditingId) {
        url = `/api/users/${currentEditingId}`;
        method = 'PUT';
        if (!formData.get('password')) {
            formData.delete('password');
        }
    } else {
        url = '/api/users';
        method = 'POST';
        if (!formData.get('password')) {
            showAlert("Пароль обязателен при создании нового пользователя.", 'warning');
            return;
        }
    }

    try {
        // 3. Отправляем formData. Content-Type указывать не нужно, браузер сделает это автоматически.
        await fetchAuthenticated(url, {
            method: method,
            body: formData 
        });

        showAlert(`Пользователь успешно ${currentEditingId ? 'обновлен' : 'создан'}!`, 'success');
        closeModal(userModal, () => userForm.reset());
        fetchAndRenderUsers(1);
    } catch (error) {
        showAlert(`Ошибка при сохранении пользователя: ${error.message}`, 'error');
    }
}

async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить пользователя ID ${id}? Это действие нельзя отменить.`);
    if (!confirmed) return;
    try {
        await fetchAuthenticated(`/api/users/${id}`, { method: 'DELETE' });
        showAlert('Пользователь успешно удален.', 'success');
        fetchAndRenderUsers(1); // Обновляем список с первой страницы
    } catch (error) {
        showAlert(`Ошибка при удалении пользователя: ${error.message}`, 'error');
    }
}

async function populateRolesSelect(selectedRoleIds = []) {
    const rolesSelect = document.getElementById('user_roles');
    await populateDropdown(rolesSelect, '/api/roles', 'id', 'name', selectedRoleIds, 'Выберите роли', false);
}

function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-user-btn');
    const deleteBtn = e.target.closest('.delete-user-btn');
    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
    
}
window.initializeUsersPage();