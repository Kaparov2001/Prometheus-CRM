// ===================================================================
// Prometheus CRM/static/js/roles.js
// Description: Manages the "Roles" page, including listing, creating,
// editing, and deleting role records, and handling associated modals.
// Depends on: utils.js
// ===================================================================

import {
    fetchAuthenticated,
    openModal,
    closeModal,
    showAlert,
    showConfirm,
    initializeActionDropdowns
} from './utils.js';

// Global variables for DOM elements and state
let roleModal, roleForm, closeModalBtn, cancelBtn, modalTitle, rolesTableBody, addRoleBtn;
let permissionsContainer;
let allPermissions = []; // Cache for all available permissions
let currentEditingId = null; // To track if we are creating or editing a role

/**
 * Initializes all DOM elements and event listeners for the Roles page.
 * This function is called by dashboard.js after roles.html is loaded.
 */
window.initializeRolesPage = function() {
    // Assign DOM elements once the HTML is loaded
    roleModal = document.getElementById('roleModal');
    roleForm = document.getElementById('roleForm');
    closeModalBtn = document.getElementById('closeRoleModalBtn');
    cancelBtn = document.getElementById('cancelRoleBtn');
    modalTitle = roleModal ? roleModal.querySelector('.modal-header h4') : null;
    rolesTableBody = document.getElementById("rolesTableBody");
    addRoleBtn = document.getElementById('addRoleBtn');
    permissionsContainer = document.getElementById('permissionsContainer');

    // Basic validation that critical elements exist
    if (!roleModal || !roleForm || !rolesTableBody || !addRoleBtn || !permissionsContainer || !modalTitle) {
        console.error("Critical DOM elements for Roles page not found. Aborting initialization.");
        return;
    }

    // --- Event Listeners ---
    addRoleBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => closeModal(roleModal, () => roleForm.reset()));
    cancelBtn.addEventListener('click', () => closeModal(roleModal, () => roleForm.reset()));
    roleForm.addEventListener('submit', handleFormSubmit);
    rolesTableBody.addEventListener('click', handleTableActions);

    // Initial fetch of all permissions (only once)
    fetchAllPermissions().then(() => {
        // After permissions are loaded, fetch and render roles
        fetchAndRenderRoles();
    });
};

/**
 * Fetches all available permissions from the API and caches them.
 */
async function fetchAllPermissions() {
    try {
        allPermissions = await fetchAuthenticated('/api/permissions');
        // Sort permissions by category and then by name for consistent display
        allPermissions.sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });
        renderPermissions(); // Render initial empty checkboxes
    } catch (error) {
        showAlert(`Ошибка загрузки прав: ${error.message}`, 'error');
        permissionsContainer.innerHTML = '<p class="text-danger">Ошибка загрузки прав</p>';
    }
}

/**
 * Fetches and renders the list of roles in the table.
 */
async function fetchAndRenderRoles() {
    if (!rolesTableBody) {
        console.error("Roles table body not found after content load.");
        return;
    }

    rolesTableBody.innerHTML = `<tr><td colspan="4" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const roles = await fetchAuthenticated("/api/roles");

        if (roles && roles.data && roles.data.length > 0) {
            rolesTableBody.innerHTML = roles.data.map(r => `
                <tr data-id="${r.id}">
                    <td data-label="ID">${r.id}</td>
                    <td data-label="Название">${r.name}</td>
                    <td data-label="Описание">${r.description || '—'}</td>
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-role-btn" data-id="${r.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-role-btn" data-id="${r.id}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                </tr>`).join('');
        } else {
            rolesTableBody.innerHTML = `<tr><td colspan="4" class="text-center">Роли не найдены.</td></tr>`;
        }
        initializeActionDropdowns();
        window.updateTableActionsVisibility();
    } catch (error) {
        rolesTableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Не удалось загрузить список ролей: ${error.message}</td></tr>`;
    }
}
/**
 * Renders the permission checkboxes in the modal.
 * @param {Array<number>} [selectedIds=[]] - Array of permission IDs to be checked.
 */
function renderPermissions(selectedIds = []) {
    if (!allPermissions.length) {
        permissionsContainer.innerHTML = '<p class="text-color-secondary">Права не загружены или отсутствуют.</p>';
        return;
    }

    // Group permissions by category
    const groupedPermissions = allPermissions.reduce((acc, p) => {
        (acc[p.category] = acc[p.category] || []).push(p);
        return acc;
    }, {});

    permissionsContainer.innerHTML = Object.entries(groupedPermissions).map(([category, perms]) => `
        <div class="permission-category">
            <h5>${category}</h5>
            ${perms.map(p => `
                <div class="permission-item">
                    <label>
                        <input type="checkbox" name="permissionIds" value="${p.id}" ${selectedIds.includes(p.id) ? 'checked' : ''}>
                        ${p.description || p.name}
                    </label>
                </div>
            `).join('')}
        </div>
    `).join('');
}

/**
 * Opens the role modal for creating a new role.
 */
function openModalForCreate() {
    currentEditingId = null;
    modalTitle.textContent = "Создать роль";
    roleForm.reset(); // Clear form fields
    renderPermissions(); // Render empty checkboxes for new role
    openModal(roleModal); // Open the modal
}

/**
 * Opens the role modal for editing an existing role.
 * @param {string} id - The ID of the role to edit.
 */
async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.textContent = "Изменить роль";
    roleForm.reset(); // Clear form fields

    try {
        const role = await fetchAuthenticated(`/api/roles/${id}`);

        // Populate form fields
        roleForm.elements.name.value = role.name;
        roleForm.elements.description.value = role.description || '';

        // Render permissions with selected ones checked
        // ИСПРАВЛЕНИЕ: p.ID заменено на p.id (нижний регистр)
        const selectedPermissionIds = role.permissions ? role.permissions.map(p => p.id) : [];
        renderPermissions(selectedPermissionIds);

        openModal(roleModal); // Open the modal
    } catch (error) {
        showAlert(`Ошибка при загрузке данных роли: ${error.message}`, 'error');
    }
}

/**
 * Handles the submission of the role form (create/update).
 * @param {Event} e - The form submit event.
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(roleForm);

    // Collect selected permission IDs
    const permissionIds = Array.from(roleForm.querySelectorAll('input[name="permissionIds"]:checked')).map(cb => Number(cb.value));

    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        permissionIds: permissionIds,
    };

    const url = currentEditingId ? `/api/roles/${currentEditingId}` : '/api/roles';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        showAlert(`Роль успешно ${currentEditingId ? 'обновлена' : 'создана'}!`, 'success');
        closeModal(roleModal, () => roleForm.reset()); // Close modal and reset form
        fetchAndRenderRoles(); // Refresh the roles list
    } catch (error) {
        showAlert(`Ошибка при сохранении роли: ${error.message}`, 'error');
    }
}

/**
 * Handles deleting a role.
 * @param {string} id - The ID of the role to delete.
 */
async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить роль ID ${id}? Это действие нельзя отменить.`);
    if (!confirmed) {
        return;
    }

    try {
        await fetchAuthenticated(`/api/roles/${id}`, { method: 'DELETE' });
        showAlert('Роль успешно удалена.', 'success');
        fetchAndRenderRoles(); // Refresh the roles list
    } catch (error) {
        showAlert(`Ошибка при удалении роли: ${error.message}`, 'error');
    }
}

/**
 * Handles click events on the roles table body for action buttons.
 * @param {Event} e - The click event.
 */
function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-role-btn');
    const deleteBtn = e.target.closest('.delete-role-btn');

    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
}
window.initializeRolesPage()