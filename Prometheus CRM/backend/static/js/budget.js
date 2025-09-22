// static/js/budget.js
import { fetchAuthenticated, showAlert, openModal, closeModal, populateDropdown, showConfirm, formatCurrency } from './utils.js';
import { $user } from './store.js';

// --- Глобальные переменные ---
let budgetTableBody;
let departmentModal, budgetItemModal, registryItemModal;
let departmentForm, budgetItemForm, registryItemForm;
let existingDepartmentsList;
let budgetItemDepartmentSelector, existingBudgetItemsContainer, existingBudgetItemsList, addNewBudgetItemsContainer;
let currentEditingRegistryEntryId = null;

// --- Инициализация ---
window.initializeBudgetPage = function() {
    budgetTableBody = document.getElementById('budgetTableBody');
    departmentModal = document.getElementById('departmentModal');
    budgetItemModal = document.getElementById('budgetItemModal');
    registryItemModal = document.getElementById('registryItemModal');
    departmentForm = document.getElementById('departmentForm');
    budgetItemForm = document.getElementById('budgetItemForm');
    registryItemForm = document.getElementById('registryItemForm');
    existingDepartmentsList = document.getElementById('existing-departments-list');
    budgetItemDepartmentSelector = document.getElementById('budgetItem_department_selector');
    existingBudgetItemsContainer = document.getElementById('existing-budget-items-container');
    existingBudgetItemsList = document.getElementById('existing-budget-items-list');
    addNewBudgetItemsContainer = document.getElementById('add-new-budget-items-container');
    
    const addDepartmentBtn = document.getElementById('addDepartmentBtn');
    const addBudgetItemBtn = document.getElementById('addBudgetItemBtn');
    const addRegistryItemBtn = document.getElementById('addRegistryItemBtn');

    if (!budgetTableBody || !addDepartmentBtn || !addBudgetItemBtn || !addRegistryItemBtn) {
        console.error("Ключевые элементы для страницы Бюджета не найдены.");
        return;
    }

    // --- События ---
    addDepartmentBtn.addEventListener('click', openManageDepartmentsModal);
    addBudgetItemBtn.addEventListener('click', openManageBudgetItemsModal);
    addRegistryItemBtn.addEventListener('click', openRegistryItemModalForCreate);

    registryItemModal.querySelector('#closeRegistryItemModalBtn').addEventListener('click', closeRegistryItemModalAndReset);
    registryItemModal.querySelector('#cancelRegistryItemBtn').addEventListener('click', closeRegistryItemModalAndReset);
    departmentModal.querySelector('#closeDepartmentModalBtn').addEventListener('click', () => closeModal(departmentModal));
    departmentModal.querySelector('#cancelDepartmentBtn').addEventListener('click', () => closeModal(departmentModal));
    budgetItemModal.querySelector('#closeBudgetItemModalBtn').addEventListener('click', () => closeModal(budgetItemModal));
    budgetItemModal.querySelector('#cancelBudgetItemBtn').addEventListener('click', () => closeModal(budgetItemModal));

    registryItemForm.addEventListener('submit', handleRegistryItemFormSubmit);
    departmentForm.addEventListener('submit', handleAddDepartments);
    budgetItemForm.addEventListener('submit', handleAddBudgetItems);

    document.getElementById('add-dept-field').addEventListener('click', addDepartmentField);
    document.getElementById('add-budget-item-field').addEventListener('click', addBudgetItemField);

    if (existingDepartmentsList) existingDepartmentsList.addEventListener('click', handleDepartmentItemActions);
    if (existingBudgetItemsList) existingBudgetItemsList.addEventListener('click', handleBudgetItemActions);
    if (budgetItemDepartmentSelector) budgetItemDepartmentSelector.addEventListener('change', handleDepartmentChangeForBudgetItems);
    budgetTableBody.addEventListener('click', handleBudgetTableActions);

    const depSelect = document.getElementById('registryItem_department');
    const budgetItemSelect = document.getElementById('registryItem_budgetItem');
    if (depSelect && budgetItemSelect) {
        depSelect.addEventListener('change', () => {
            const depId = depSelect.value;
            budgetItemSelect.disabled = !depId;
            if (depId) {
                populateDropdown(budgetItemSelect, `/api/budget/items?department_id=${depId}`, 'id', 'name', null, '-- Выберите статью --');
            } else {
                budgetItemSelect.innerHTML = '<option value="">-- Сначала выберите подразделение --</option>';
            }
        });
    }

    loadBudgetData();
};

// --- Загрузка и рендеринг основной таблицы ---
async function loadBudgetData() {
    budgetTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Загрузка...</td></tr>`;
    try {
        const data = await fetchAuthenticated('/api/budget/data');
        renderBudgetTable(data.tableRows);
    } catch (error) {
        showAlert(`Ошибка загрузки бюджета: ${error.message}`, 'error');
        budgetTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Не удалось загрузить данные.</td></tr>`;
    }
}

function renderBudgetTable(tableRows) {
    if (!tableRows || tableRows.length === 0) {
        budgetTableBody.innerHTML = `<tr><td colspan="6" class="text-center">Данные отсутствуют. Начните с добавления записи.</td></tr>`;
        return;
    }

    const canDelete = $user.hasPermission('delete_budget');
    const canEdit = $user.hasPermission('create_budget');

    budgetTableBody.innerHTML = tableRows.map(entry => {
        const formattedDeclared = formatCurrency(entry.declaredBudget);
        const formattedRemaining = formatCurrency(entry.remainingBudget);
        
        let actionsHtml = '';
        if (canEdit) {
            actionsHtml += `<button class="button-secondary btn-sm edit-entry-btn" data-id="${entry.registryEntryId}" title="Изменить запись"><i class="bi bi-pencil"></i></button>`;
        }
        if (canDelete) {
            actionsHtml += ` <button class="button-danger btn-sm delete-entry-btn" data-id="${entry.registryEntryId}" title="Удалить запись"><i class="bi bi-trash"></i></button>`;
        }
        if (actionsHtml.trim() === '') {
            actionsHtml = '—';
        }

        return `
            <tr data-id="${entry.registryEntryId}">
                <td data-label="Подразделение">${entry.departmentName}</td>
                <td data-label="Статья бюджета">${entry.budgetItemName}</td>
                <td data-label="Статья в реестре">${entry.registryEntryName}</td>
                <td data-label="Заложенная сумма" class="text-right">${formattedDeclared}</td>
                <td data-label="Остаток в бюджете" class="text-right">${formattedRemaining}</td>
                <td data-label="Действия" class="text-center">${actionsHtml}</td>
            </tr>
        `;
    }).join('');
}


// --- Обработчики действий в основной таблице ---
function handleBudgetTableActions(e) {
    const deleteBtn = e.target.closest('.delete-entry-btn');
    if (deleteBtn) {
        handleDeleteEntry(deleteBtn.dataset.id);
        return;
    }

    const editBtn = e.target.closest('.edit-entry-btn');
    if (editBtn) {
        handleEditEntry(editBtn.dataset.id);
        return;
    }
}

async function handleDeleteEntry(entryId) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить эту запись?`);
    if (!confirmed) return;
    try {
        await fetchAuthenticated(`/api/budget/registry-items/${entryId}`, { method: 'DELETE' });
        showAlert('Запись успешно удалена.', 'success');
        loadBudgetData();
    } catch (error) {
        showAlert(`Ошибка при удалении: ${error.message}`, 'error');
    }
}

async function handleEditEntry(entryId) {
    try {
        const entryData = await fetchAuthenticated(`/api/budget/registry-items/${entryId}`);
        if (!entryData) throw new Error("Сервер вернул пустой ответ.");
        openRegistryItemModalForEdit(entryData);
    } catch (error) {
        showAlert(`Не удалось загрузить данные для редактирования: ${error.message}`, 'error');
    }
}


// --- Управление модальным окном "Статья в реестре" ---
function openRegistryItemModalForCreate() {
    currentEditingRegistryEntryId = null;
    registryItemForm.reset();
    
    registryItemModal.querySelector('h4').textContent = 'Добавить статью в реестре';
    registryItemModal.querySelector('.button-primary').textContent = 'Сохранить';

    const budgetItemSelect = document.getElementById('registryItem_budgetItem');
    budgetItemSelect.disabled = true;
    budgetItemSelect.innerHTML = '<option value="">-- Сначала выберите подразделение --</option>';
    
    populateDropdown(document.getElementById('registryItem_department'), '/api/budget/departments?all=true', 'id', 'name', null, '-- Выберите --');
    openModal(registryItemModal);
}

async function openRegistryItemModalForEdit(entry) {
    // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Проверяем budget_item (snake_case) ---
    if (!entry.budget_item) {
        showAlert('Ошибка данных: отсутствует информация о статье бюджета. Невозможно отредактировать запись.', 'error');
        return;
    }

    currentEditingRegistryEntryId = entry.id;
    registryItemForm.reset();
    
    registryItemModal.querySelector('h4').textContent = 'Изменить статью в реестре';
    registryItemModal.querySelector('.button-primary').textContent = 'Сохранить изменения';

    const departmentSelect = registryItemForm.querySelector('#registryItem_department');
    const budgetItemSelect = registryItemForm.querySelector('#registryItem_budgetItem');
    
    // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Используем budget_item и departmentId ---
    const departmentId = entry.budget_item.departmentId;
    const budgetItemId = entry.budget_item_id;

    await populateDropdown(departmentSelect, '/api/budget/departments?all=true', 'id', 'name', departmentId);
    
    budgetItemSelect.disabled = false;
    await populateDropdown(budgetItemSelect, `/api/budget/items?department_id=${departmentId}`, 'id', 'name', budgetItemId);

    registryItemForm.querySelector('#registryItem_name').value = entry.name;
    // --- ИСПРАВЛЕНИЕ ЗДЕСЬ: Используем budget_amount ---
    registryItemForm.querySelector('#registryItem_amount').value = entry.budget_amount;

    openModal(registryItemModal);
}

function closeRegistryItemModalAndReset() {
    currentEditingRegistryEntryId = null;
    closeModal(registryItemModal);
    registryItemForm.reset();
}

function handleRegistryItemFormSubmit(e) {
    e.preventDefault();
    if (currentEditingRegistryEntryId) {
        handleUpdateRegistryItem(currentEditingRegistryEntryId);
    } else {
        handleAddRegistryItem();
    }
}

async function handleAddRegistryItem() {
    const budgetItemId = registryItemForm.querySelector('#registryItem_budgetItem').value;
    const name = registryItemForm.querySelector('#registryItem_name').value;
    const amount = registryItemForm.querySelector('#registryItem_amount').value;

    if (!budgetItemId || !name.trim() || !amount) {
        showAlert('Пожалуйста, заполните все поля.', 'warning');
        return;
    }

    try {
        await fetchAuthenticated('/api/budget/registry-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name.trim(),
                budget_amount: parseInt(amount, 10),
                budget_item_id: parseInt(budgetItemId, 10)
            })
        });
        showAlert('Запись в реестре успешно добавлена!', 'success');
        closeRegistryItemModalAndReset();
        loadBudgetData();
    } catch (error) {
        showAlert(`Ошибка при добавлении записи: ${error.message}`, 'error');
    }
}

async function handleUpdateRegistryItem(entryId) {
    const budgetItemId = registryItemForm.querySelector('#registryItem_budgetItem').value;
    const name = registryItemForm.querySelector('#registryItem_name').value;
    const amount = registryItemForm.querySelector('#registryItem_amount').value;

    if (!budgetItemId || !name.trim() || !amount) {
        showAlert('Пожалуйста, заполните все поля.', 'warning');
        return;
    }

    try {
        // --- НАЧАЛО ИЗМЕНЕНИЯ ---
        // Сохраняем результат fetch в переменную updatedEntry
        const updatedEntry = await fetchAuthenticated(`/api/budget/registry-items/${entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name.trim(),
                budget_amount: parseInt(amount, 10),
                budget_item_id: parseInt(budgetItemId, 10)
            })
        });

        showAlert('Запись успешно обновлена!', 'success');
        closeRegistryItemModalAndReset();

        // Вместо полной перезагрузки таблицы, перезагружаем данные.
        // Это самый надежный способ, который решит проблему с кэшированием.
        loadBudgetData();
        // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    } catch (error) {
        showAlert(`Ошибка при обновлении: ${error.message}`, 'error');
    }
}

// ... (Остальной код файла без изменений) ...

// --- УПРАВЛЕНИЕ ПОДРАЗДЕЛЕНИЯМИ ---
async function openManageDepartmentsModal() {
    departmentForm.reset();
    document.getElementById('departments-container').innerHTML = '';
    addDepartmentField();
    existingDepartmentsList.innerHTML = `<div class="text-center">Загрузка...</div>`;
    openModal(departmentModal);

    try {
        const departments = await fetchAuthenticated('/api/budget/departments?all=true');
        renderDepartmentsList(departments);
    } catch (error) {
        showAlert(`Ошибка загрузки подразделений: ${error.message}`, 'error');
        existingDepartmentsList.innerHTML = `<div class="text-center text-danger">Не удалось загрузить список.</div>`;
    }
}

function renderDepartmentsList(departments) {
    if (!departments || departments.length === 0) {
        existingDepartmentsList.innerHTML = `<p class="text-center text-color-secondary">Созданных подразделений пока нет.</p>`;
        return;
    }
    existingDepartmentsList.innerHTML = departments.map(dept => `
        <div class="department-item" data-id="${dept.id}">
            <div class="department-item-name"><span>${dept.name}</span></div>
            <div class="department-item-actions">
                <button class="edit-dept-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
                <button class="delete-dept-btn" title="Удалить"><i class="bi bi-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function handleDepartmentItemActions(e) {
    const target = e.target;
    const itemDiv = target.closest('.department-item');
    if (!itemDiv) return;
    
    const id = itemDiv.dataset.id;
    const nameContainer = itemDiv.querySelector('.department-item-name');
    const actionsDiv = itemDiv.querySelector('.department-item-actions');

    if (target.closest('.delete-dept-btn')) {
        const confirmed = await showConfirm('Вы уверены, что хотите удалить это подразделение?');
        if (confirmed) {
            try {
                await fetchAuthenticated(`/api/budget/departments/${id}`, { method: 'DELETE' });
                showAlert('Подразделение удалено.', 'success');
                itemDiv.remove();
                loadBudgetData();
            } catch (error) {
                showAlert(`Ошибка удаления: ${error.message}`, 'error');
            }
        }
    }

    if (target.closest('.edit-dept-btn')) {
        const currentName = nameContainer.querySelector('span').textContent;
        nameContainer.innerHTML = `<input type="text" class="form-control" value="${currentName}">`;
        actionsDiv.innerHTML = `
            <button class="save-dept-btn" title="Сохранить"><i class="bi bi-check-lg"></i></button>
            <button class="cancel-edit-dept-btn" title="Отмена"><i class="bi bi-x-lg"></i></button>
        `;
        nameContainer.querySelector('input').focus();
    }
    
    if (target.closest('.cancel-edit-dept-btn')) {
        const originalName = nameContainer.querySelector('input').defaultValue;
        nameContainer.innerHTML = `<span>${originalName}</span>`;
        actionsDiv.innerHTML = `
            <button class="edit-dept-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
            <button class="delete-dept-btn" title="Удалить"><i class="bi bi-trash"></i></button>
        `;
    }

    if (target.closest('.save-dept-btn')) {
        const nameInput = nameContainer.querySelector('input');
        const newName = nameInput.value.trim();

        if (!newName) {
            showAlert('Название не может быть пустым.', 'warning');
            return;
        }

        try {
            const updatedDept = await fetchAuthenticated(`/api/budget/departments/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            nameContainer.innerHTML = `<span>${updatedDept.name}</span>`;
            actionsDiv.innerHTML = `
                <button class="edit-dept-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
                <button class="delete-dept-btn" title="Удалить"><i class="bi bi-trash"></i></button>
            `;
            showAlert('Название обновлено.', 'success');
            loadBudgetData();
        } catch (error) {
            showAlert(`Ошибка обновления: ${error.message}`, 'error');
        }
    }
}

// --- УПРАВЛЕНИЕ СТАТЬЯМИ БЮДЖЕТА ---
function openManageBudgetItemsModal() {
    budgetItemForm.reset();
    document.getElementById('budget-items-container').innerHTML = '';
    existingBudgetItemsList.innerHTML = '';
    
    existingBudgetItemsContainer.style.display = 'none';
    addNewBudgetItemsContainer.style.display = 'none';

    populateDropdown(budgetItemDepartmentSelector, '/api/budget/departments?all=true', 'id', 'name', null, '-- Выберите подразделение --');
    
    openModal(budgetItemModal);
}

async function handleDepartmentChangeForBudgetItems() {
    const departmentId = budgetItemDepartmentSelector.value;
    
    existingBudgetItemsList.innerHTML = '';

    if (!departmentId) {
        existingBudgetItemsContainer.style.display = 'none';
        addNewBudgetItemsContainer.style.display = 'none';
        return;
    }

    existingBudgetItemsContainer.style.display = 'block';
    addNewBudgetItemsContainer.style.display = 'block';
    addBudgetItemField();
    
    existingBudgetItemsList.innerHTML = `<div class="text-center">Загрузка...</div>`;
    try {
        const items = await fetchAuthenticated(`/api/budget/items?department_id=${departmentId}`);
        renderBudgetItemsList(items);
    } catch (error) {
        showAlert(`Ошибка загрузки статей: ${error.message}`, 'error');
        existingBudgetItemsList.innerHTML = `<div class="text-center text-danger">Не удалось загрузить список.</div>`;
    }
}

function renderBudgetItemsList(items) {
    if (!items || items.length === 0) {
        existingBudgetItemsList.innerHTML = `<p class="text-center text-color-secondary">Для этого подразделения статей бюджета пока нет.</p>`;
        return;
    }
    existingBudgetItemsList.innerHTML = items.map(item => `
        <div class="department-item" data-id="${item.id}">
            <div class="department-item-name"><span>${item.name}</span></div>
            <div class="department-item-actions">
                <button class="edit-budget-item-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
                <button class="delete-budget-item-btn" title="Удалить"><i class="bi bi-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function handleBudgetItemActions(e) {
    const target = e.target;
    const itemDiv = target.closest('.department-item');
    if (!itemDiv) return;
    
    const id = itemDiv.dataset.id;
    const nameContainer = itemDiv.querySelector('.department-item-name');
    const actionsDiv = itemDiv.querySelector('.department-item-actions');

    if (target.closest('.delete-budget-item-btn')) {
        const confirmed = await showConfirm('Вы уверены, что хотите удалить эту статью бюджета?');
        if (confirmed) {
            try {
                await fetchAuthenticated(`/api/budget/items/${id}`, { method: 'DELETE' });
                showAlert('Статья бюджета удалена.', 'success');
                itemDiv.remove();
                loadBudgetData();
            } catch (error) {
                showAlert(`Ошибка удаления: ${error.message}`, 'error');
            }
        }
    }

    if (target.closest('.edit-budget-item-btn')) {
        const currentName = nameContainer.querySelector('span').textContent;
        nameContainer.innerHTML = `<input type="text" class="form-control" value="${currentName}">`;
        actionsDiv.innerHTML = `
            <button class="save-budget-item-btn" title="Сохранить"><i class="bi bi-check-lg"></i></button>
            <button class="cancel-edit-budget-item-btn" title="Отмена"><i class="bi bi-x-lg"></i></button>
        `;
        nameContainer.querySelector('input').focus();
    }
    
    if (target.closest('.cancel-edit-budget-item-btn')) {
        const originalName = nameContainer.querySelector('input').defaultValue;
        nameContainer.innerHTML = `<span>${originalName}</span>`;
        actionsDiv.innerHTML = `
            <button class="edit-budget-item-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
            <button class="delete-budget-item-btn" title="Удалить"><i class="bi bi-trash"></i></button>
        `;
    }

    if (target.closest('.save-budget-item-btn')) {
        const nameInput = nameContainer.querySelector('input');
        const newName = nameInput.value.trim();
        if (!newName) {
            showAlert('Название не может быть пустым.', 'warning');
            return;
        }
        try {
            const updatedItem = await fetchAuthenticated(`/api/budget/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            nameContainer.innerHTML = `<span>${updatedItem.name}</span>`;
            actionsDiv.innerHTML = `
                <button class="edit-budget-item-btn" title="Редактировать"><i class="bi bi-pencil"></i></button>
                <button class="delete-budget-item-btn" title="Удалить"><i class="bi bi-trash"></i></button>
            `;
            showAlert('Название статьи обновлено.', 'success');
            loadBudgetData();
        } catch (error) {
            showAlert(`Ошибка обновления: ${error.message}`, 'error');
        }
    }
}

// --- Функции добавления/сохранения ---
function addDepartmentField() {
    const container = document.getElementById('departments-container');
    const newField = document.createElement('div');
    newField.className = 'form-group';
    newField.style.display = 'flex';
    newField.style.alignItems = 'center';
    newField.style.gap = '10px';
    newField.innerHTML = `
        <input type="text" name="name" class="form-control" placeholder="Название подразделения" required>
        <button type="button" class="remove-field-btn button-danger btn-sm"><i class="bi bi-trash"></i></button>
    `;
    newField.querySelector('.remove-field-btn').addEventListener('click', () => newField.remove());
    container.appendChild(newField);
}

function addBudgetItemField() {
    const container = document.getElementById('budget-items-container');
    const newField = document.createElement('div');
    newField.className = 'form-group';
    newField.style.display = 'flex';
    newField.style.alignItems = 'center';
    newField.style.gap = '10px';
    newField.innerHTML = `
        <input type="text" name="name" class="form-control" placeholder="Название статьи бюджета" required>
        <button type="button" class="remove-field-btn button-danger btn-sm"><i class="bi bi-trash"></i></button>
    `;
    newField.querySelector('.remove-field-btn').addEventListener('click', () => newField.remove());
    container.appendChild(newField);
}

async function handleAddDepartments(e) {
    e.preventDefault();
    const inputs = departmentForm.querySelectorAll('input[name="name"]');
    const departments = Array.from(inputs).map(input => ({ name: input.value.trim() })).filter(d => d.name);
    if (departments.length === 0) {
        showAlert('Введите хотя бы одно название.', 'warning');
        return;
    }
    try {
        await fetchAuthenticated('/api/budget/departments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(departments)
        });
        showAlert('Подразделения успешно созданы!', 'success');
        document.getElementById('departments-container').innerHTML = '';
        addDepartmentField();
        const depts = await fetchAuthenticated('/api/budget/departments?all=true');
        renderDepartmentsList(depts);
        loadBudgetData();
    } catch (error) {
        showAlert(`Ошибка: ${error.message}`, 'error');
    }
}

async function handleAddBudgetItems(e) {
    e.preventDefault();
    const departmentId = parseInt(budgetItemDepartmentSelector.value); 
    const inputs = budgetItemForm.querySelectorAll('input[name="name"]');
    const items = Array.from(inputs).map(input => ({
        name: input.value.trim(),
        departmentId: departmentId
    })).filter(item => item.name);

    if (isNaN(departmentId)) {
        showAlert('Пожалуйста, выберите подразделение.', 'warning');
        return;
    }
    if (items.length === 0) {
        showAlert('Введите название хотя бы для одной новой статьи.', 'warning');
        return;
    }

    try {
        await fetchAuthenticated('/api/budget/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(items)
        });
        showAlert('Новые статьи бюджета успешно созданы!', 'success');
        document.getElementById('budget-items-container').innerHTML = '';
        addBudgetItemField();
        handleDepartmentChangeForBudgetItems();
        loadBudgetData();
    } catch (error) {
        showAlert(`Ошибка: ${error.message}`, 'error');
    }
}