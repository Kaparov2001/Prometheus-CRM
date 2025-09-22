// ===================================================================
// Prometheus CRM/static/js/nationalities.js
// Description: Manages the "Nationalities" page, including listing, creating,
// editing, and deleting nationality records, and handling associated modals.
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
let nationalityModal, nationalityForm, closeModalBtn, cancelBtn, modalTitle, nationalitiesTableBody, addNationalityBtn;
let nationalityNameInput; // Reference to the name input field
let currentEditingId = null; // To track if we are creating or editing a nationality

/**
 * Initializes all DOM elements and event listeners for the Nationalities page.
 * This function is called by dashboard.js after nationalities.html is loaded.
 */
window.initializeNationalitiesPage = function() {
    // Assign DOM elements once the HTML is loaded
    nationalityModal = document.getElementById('nationalityModal');
    nationalityForm = document.getElementById('nationalityForm');
    closeModalBtn = document.getElementById('closeNationalityModalBtn');
    cancelBtn = document.getElementById('cancelNationalityBtn');
    modalTitle = nationalityModal ? nationalityModal.querySelector('.modal-header h4') : null;
    nationalitiesTableBody = document.getElementById("nationalitiesTableBody");
    addNationalityBtn = document.getElementById('addNationalityBtn');
    nationalityNameInput = document.getElementById('nationalityName');

    // Basic validation that critical elements exist
    if (!nationalityModal || !nationalityForm || !nationalitiesTableBody || !addNationalityBtn || !nationalityNameInput || !modalTitle) {
        console.error("Critical DOM elements for Nationalities page not found. Aborting initialization.");
        return;
    }

    // --- Event Listeners ---
    addNationalityBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => closeModal(nationalityModal, () => nationalityForm.reset()));
    cancelBtn.addEventListener('click', () => closeModal(nationalityModal, () => nationalityForm.reset()));
    nationalityForm.addEventListener('submit', handleFormSubmit);

    // Delegate click events for edit/delete buttons on the table body
    nationalitiesTableBody.addEventListener('click', handleTableActions);

    // Initial fetch and render of nationalities
    fetchAndRenderNationalities();
};

/**
 * Opens the nationality modal for creating a new nationality.
 */
function openModalForCreate() {
    currentEditingId = null;
    modalTitle.textContent = "Создать национальность";
    nationalityForm.reset(); // Clear form fields
    openModal(nationalityModal); // Open the modal
}

/**
 * Opens the nationality modal for editing an existing nationality.
 * @param {string} id - The ID of the nationality to edit.
 */
async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.textContent = "Изменить национальность";
    nationalityForm.reset(); // Clear form fields

    try {
        const nationality = await fetchAuthenticated(`/api/nationalities/${id}`);

        // Populate form fields
        nationalityNameInput.value = nationality.name;

        openModal(nationalityModal); // Open the modal
    } catch (error) {
        showAlert(`Ошибка при загрузке данных национальности: ${error.message}`, 'error');
    }
}

/**
 * Handles the submission of the nationality form (create/update).
 * @param {Event} e - The form submit event.
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    const data = { name: nationalityNameInput.value };

    const url = currentEditingId ? `/api/nationalities/${currentEditingId}` : '/api/nationalities';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        showAlert(`Национальность успешно ${currentEditingId ? 'обновлена' : 'создана'}!`, 'success');
        closeModal(nationalityModal, () => nationalityForm.reset()); // Close modal and reset form
        fetchAndRenderNationalities(); // Refresh the nationalities list
    } catch (error) {
        showAlert(`Ошибка при сохранении национальности: ${error.message}`, 'error');
    }
}

/**
 * Handles deleting a nationality.
 * @param {string} id - The ID of the nationality to delete.
 */
async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить национальность ID ${id}? Это действие нельзя отменить.`);
    if (!confirmed) {
        return;
    }

    try {
        await fetchAuthenticated(`/api/nationalities/${id}`, { method: 'DELETE' });
        showAlert('Национальность успешно удалена.', 'success');
        fetchAndRenderNationalities(); // Refresh the nationalities list
    } catch (error) {
        showAlert(`Ошибка при удалении национальности: ${error.message}`, 'error');
    }
}

/**
 * Fetches and renders the list of nationalities in the table.
 */
async function fetchAndRenderNationalities() {
    nationalitiesTableBody.innerHTML = `<tr><td colspan="3" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const nationalities = await fetchAuthenticated("/api/nationalities");

        if (nationalities && nationalities.data && nationalities.data.length > 0) {
            // ---> ИЗМЕНЕНИЕ: рендерим все кнопки, видимость будет управляться глобально
            nationalitiesTableBody.innerHTML = nationalities.data.map(n => `
                <tr data-id="${n.id}">
                    <td data-label="ID">${n.id}</td>
                    <td data-label="Название">${n.name}</td>
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-nationality-btn" data-id="${n.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-nationality-btn" data-id="${n.id}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                </tr>`).join('');
        } else {
            nationalitiesTableBody.innerHTML = `<tr><td colspan="3" class="text-center">Национальности еще не созданы.</td></tr>`;
        }
        
        initializeActionDropdowns();
        
        // ---> ИЗМЕНЕНИЕ: Вызываем глобальную функцию для скрытия ненужных кнопок
        window.updateTableActionsVisibility();
        // --- КОНЕЦ ИЗМЕНЕНИЯ

    } catch (error) {
        nationalitiesTableBody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Не удалось загрузить список национальностей: ${error.message}</td></tr>`;
    }
}

/**
 * Handles click events on the nationalities table body for action buttons.
 * @param {Event} e - The click event.
 */
function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-nationality-btn');
    const deleteBtn = e.target.closest('.delete-nationality-btn');

    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
    // Action dropdowns are handled by initializeActionDropdowns
}
window.initializeNationalitiesPage();
