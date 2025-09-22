import { fetchAuthenticated, openModal, closeModal, showAlert, showConfirm, initializeActionDropdowns, hasPermission } from './utils.js';

let modal, form, tableBody, addBtn, statusSwitch, statusLabel, downloadLinkContainer, downloadLink;
let currentEditingId = null;

window.initializeContractTemplatesPage = function() {
    modal = document.getElementById('templateModal');
    form = document.getElementById('templateForm');
    tableBody = document.getElementById('templatesTableBody');
    addBtn = document.getElementById('addTemplateBtn');
    statusSwitch = document.getElementById('template_status');
    statusLabel = document.getElementById('statusLabel');
    downloadLinkContainer = document.getElementById('downloadLinkContainer');
    downloadLink = document.getElementById('downloadLink');
    
    addBtn.addEventListener('click', openModalForCreate);
    modal.querySelector('#closeTemplateModalBtn').addEventListener('click', () => closeModal(modal));
    modal.querySelector('#cancelTemplateBtn').addEventListener('click', () => closeModal(modal));
    form.addEventListener('submit', handleFormSubmit);
    statusSwitch.addEventListener('change', () => {
        statusLabel.textContent = statusSwitch.checked ? 'Активен' : 'Не активен';
    });
    tableBody.addEventListener('click', handleTableActions);

    fetchAndRenderTemplates();
};

async function fetchAndRenderTemplates() {
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center">Загрузка...</td></tr>`;
    try {
        const templates = await fetchAuthenticated('/api/contract-templates');
        
        // Эта проверка больше не нужна, так как window.updateTableActionsVisibility() сделает всё сама.
        // const canEdit = hasPermission('contract_templates_edit');
        // const canDelete = hasPermission('contract_templates_delete');

        if (templates.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center">Шаблоны не найдены.</td></tr>`;
            return;
        }

        tableBody.innerHTML = templates.map(t => {
            // Мы просто рендерим все кнопки, а dashboard.js сам решит, какие скрыть
            return `
                <tr data-id="${t.ID}">
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-contract-template-btn" data-id="${t.ID}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-contract-template-btn" data-id="${t.ID}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Название">${t.name}</td>
                    <td data-label="Классификация">${t.classification}</td>
                    <td data-label="Тип подписи">${t.signatureType}</td>
                </tr>
            `;
        }).join('');
        
        initializeActionDropdowns();
        // Эта функция вызовется и скроет кнопки, если у пользователя нет прав
        window.updateTableActionsVisibility(); 
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Ошибка: ${error.message}</td></tr>`;
    }
}

function openModalForCreate() {
    currentEditingId = null;
    form.reset();
    modal.querySelector('h4').textContent = 'Добавить шаблон';
    statusSwitch.checked = true;
    statusLabel.textContent = 'Активен';
    downloadLinkContainer.style.display = 'none';
    form.querySelector('#template_file').required = true;
    openModal(modal);
}

async function openModalForEdit(id) {
    currentEditingId = id;
    form.reset();
    modal.querySelector('h4').textContent = 'Изменить шаблон';
    form.querySelector('#template_file').required = false;

    try {
        const template = await fetchAuthenticated(`/api/contract-templates/${id}`);
        form.elements.name.value = template.name;
        form.elements.signatureType.value = template.signatureType;
        form.elements.classification.value = template.classification;
        statusSwitch.checked = template.status === 'active';
        statusLabel.textContent = statusSwitch.checked ? 'Активен' : 'Не активен';
        
        if (template.filePath) {
            downloadLink.href = template.filePath;
            downloadLinkContainer.style.display = 'block';
        } else {
            downloadLinkContainer.style.display = 'none';
        }
        
        openModal(modal);
    } catch (error) {
        showAlert(`Ошибка загрузки шаблона: ${error.message}`, 'error');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const formData = new FormData(form);
    formData.set('status', statusSwitch.checked ? 'active' : 'inactive');

    const url = currentEditingId ? `/api/contract-templates/${currentEditingId}` : '/api/contract-templates';
    // ИСПРАВЛЕНО: Метод теперь PUT для обновления, а POST для создания.
    const method = currentEditingId ? 'PUT' : 'POST'; 

    try {
        // ИСПРАВЛЕНО: fetchAuthenticated теперь не требует Content-Type для FormData
        await fetchAuthenticated(url, {
            method: method,
            body: formData
        });
        showAlert(`Шаблон успешно ${currentEditingId ? 'обновлен' : 'создан'}!`, 'success');
        closeModal(modal);
        fetchAndRenderTemplates();
    } catch (error) {
        showAlert(`Ошибка сохранения: ${error.message}`, 'error');
    }
}

function handleTableActions(e) {
    // Ищем кнопки по правильным классам
    const editBtn = e.target.closest('.edit-contract-template-btn');
    const deleteBtn = e.target.closest('.delete-contract-template-btn');

    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        const id = deleteBtn.dataset.id;
        showConfirm('Вы уверены, что хотите удалить этот шаблон?').then(async confirmed => {
            if (confirmed) {
                try {
                    await fetchAuthenticated(`/api/contract-templates/${id}`, { method: 'DELETE' });
                    showAlert('Шаблон удален.', 'success');
                    fetchAndRenderTemplates();
                } catch (error) {
                    showAlert(`Ошибка удаления: ${error.message}`, 'error');
                }
            }
        });
    }
}
window.initializeContractTemplatesPage();