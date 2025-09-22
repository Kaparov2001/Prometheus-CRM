// ===================================================================
// Prometheus CRM/static/js/permissions.js
// Description: Manages the "Permissions" page, including listing, creating,
// editing, and deleting permission records, and handling associated modals.
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
let permissionModal, permissionForm, closeModalBtn, cancelBtn, modalTitle, permissionsTableBody, addPermissionBtn;
let currentEditingId = null; // To track if we are creating or editing a permission

/**
 * Initializes all DOM elements and event listeners for the Permissions page.
 * This function is called by dashboard.js after permissions.html is loaded.
 */
window.initializePermissionsPage = function() {
    // Assign DOM elements once the HTML is loaded
    permissionModal = document.getElementById('permissionModal');
    permissionForm = document.getElementById('permissionForm');
    closeModalBtn = document.getElementById('closePermissionModalBtn');
    cancelBtn = document.getElementById('cancelPermissionBtn');
    modalTitle = permissionModal ? permissionModal.querySelector('.modal-header h4') : null;
    permissionsTableBody = document.getElementById('permissionsTableBody');
    addPermissionBtn = document.getElementById('addPermissionBtn');

    // Basic validation that critical elements exist
    if (!permissionModal || !permissionForm || !permissionsTableBody || !addPermissionBtn || !modalTitle) {
        console.error("Critical DOM elements for Permissions page not found. Aborting initialization.");
        return;
    }

    // --- Event Listeners ---
    addPermissionBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => closeModal(permissionModal, () => permissionForm.reset()));
    cancelBtn.addEventListener('click', () => closeModal(permissionModal, () => permissionForm.reset()));
    permissionForm.addEventListener('submit', handleFormSubmit);

    // Delegate click events for edit/delete buttons on the table body
    permissionsTableBody.addEventListener('click', handleTableActions);

    // Initial fetch and render of permissions
    fetchAndRenderPermissions();
};

/**
 * Opens the permission modal for creating a new permission.
 */
function openModalForCreate() {
    currentEditingId = null;
    modalTitle.textContent = "Создать право доступа";
    permissionForm.reset(); // Clear form fields
    openModal(permissionModal); // Open the modal
}

/**
 * Opens the permission modal for editing an existing permission.
 * @param {string} id - The ID of the permission to edit.
 */
async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.textContent = "Изменить право доступа";
    permissionForm.reset(); // Clear form fields

    try {
        const permission = await fetchAuthenticated(`/api/permissions/${id}`);

        // Populate form fields
        permissionForm.elements.name.value = permission.name;
        permissionForm.elements.description.value = permission.description || '';
        permissionForm.elements.category.value = permission.category;

        openModal(permissionModal); // Open the modal
    } catch (error) {
        showAlert(`Ошибка при загрузке данных права: ${error.message}`, 'error');
    }
}

/**
 * Handles the submission of the permission form (create/update).
 * @param {Event} e - The form submit event.
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(permissionForm);

    const data = {
        name: formData.get('name'),
        description: formData.get('description'),
        category: formData.get('category'),
    };

    const url = currentEditingId ? `/api/permissions/${currentEditingId}` : '/api/permissions';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        showAlert(`Право доступа успешно ${currentEditingId ? 'обновлено' : 'создано'}!`, 'success');
        closeModal(permissionModal, () => permissionForm.reset()); // Close modal and reset form
        fetchAndRenderPermissions(); // Refresh the permissions list
    } catch (error) {
        showAlert(`Ошибка при сохранении права доступа: ${error.message}`, 'error');
    }
}

/**
 * Handles deleting a permission.
 * @param {string} id - The ID of the permission to delete.
 */
async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить право доступа ID ${id}? Это действие нельзя отменить.`);
    if (!confirmed) {
        return;
    }

    try {
        await fetchAuthenticated(`/api/permissions/${id}`, { method: 'DELETE' });
        showAlert('Право доступа успешно удалено.', 'success');
        fetchAndRenderPermissions(); // Refresh the permissions list
    } catch (error) {
        showAlert(`Ошибка при удалении права доступа: ${error.message}`, 'error');
    }
}

/**
 * Fetches and renders the list of permissions in the table.
 */
async function fetchAndRenderPermissions() {
    permissionsTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const permissions = await fetchAuthenticated("/api/permissions");

        if (permissions && permissions.length > 0) {
            permissionsTableBody.innerHTML = permissions.map(p => `
                <tr data-id="${p.id}">
                    <td data-label="ID">${p.id}</td>
                    <td data-label="Системное имя"><code>${p.name}</code></td>
                    <td data-label="Описание">${p.description || '—'}</td>
                    <td data-label="Категория">${p.category}</td>
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-permission-btn" data-id="${p.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-permission-btn" data-id="${p.id}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                </tr>`).join('');
        } else {
            permissionsTableBody.innerHTML = `<tr><td colspan="5" class="text-center">Права доступа еще не созданы.</td></tr>`;
        }
        initializeActionDropdowns(); // Re-initialize dropdowns after rendering
        window.updateTableActionsVisibility();
    } catch (error) {
        permissionsTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Не удалось загрузить список прав доступа: ${error.message}</td></tr>`;
    }
}

/**
 * Handles click events on the permissions table body for action buttons.
 * @param {Event} e - The click event.
 */
function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-permission-btn');
    const deleteBtn = e.target.closest('.delete-permission-btn');

    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
    // Action dropdowns are handled by initializeActionDropdowns
}
window.initializePermissionsPage();
