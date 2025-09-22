// static/js/payment_forms.js

import {
    fetchAuthenticated,
    openModal,
    closeModal,
    showAlert,
    showConfirm,
    initializeActionDropdowns,
    renderPagination
} from './utils.js';

// --- Глобальные переменные ---
let paymentFormModal, paymentForm, closeModalBtn, cancelBtn, modalTitle, tableBody, addBtn, paginationContainer;
let installmentsContainer, installmentsCountInput;

// Элементы для фильтрации
let searchInput, searchBtn, nameFilterInput, applyFiltersBtn, resetFiltersBtn, toggleFiltersBtn, advancedFiltersContainer;

let currentEditingId = null;
const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

/**
 * Инициализация страницы "Формы оплаты".
 */
window.initializePaymentFormsPage = function() {
    // Получаем DOM элементы
    paymentFormModal = document.getElementById('paymentFormModal');
    paymentForm = document.getElementById('paymentForm');
    modalTitle = paymentFormModal ? paymentFormModal.querySelector('.modal-header h4') : null;
    tableBody = document.getElementById('paymentFormsTableBody');
    paginationContainer = document.getElementById('paginationContainer');
    addBtn = document.getElementById('addPaymentFormBtn');
    closeModalBtn = document.getElementById('closePaymentFormModalBtn');
    cancelBtn = document.getElementById('cancelPaymentFormBtn');
    installmentsContainer = document.getElementById('installmentsContainer');
    installmentsCountInput = document.getElementById('paymentFormInstallmentsCount');

    // Элементы фильтров
    searchInput = document.getElementById('paymentFormSearchInput');
    searchBtn = document.getElementById('searchBtn');
    nameFilterInput = document.getElementById('paymentFormNameFilter');
    applyFiltersBtn = document.getElementById('applyPaymentFormFiltersBtn');
    resetFiltersBtn = document.getElementById('resetPaymentFormFiltersBtn');
    toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    advancedFiltersContainer = document.getElementById('advancedFiltersContainer');

    // Проверка наличия ключевых элементов
    if (!paymentFormModal || !tableBody || !addBtn || !toggleFiltersBtn || !paymentForm) {
        console.error("Ключевые элементы для страницы 'Формы оплаты' не найдены.");
        return;
    }

    // --- Навешиваем события ---
    addBtn.addEventListener('click', openModalForCreate);
    closeModalBtn.addEventListener('click', () => closeModal(paymentFormModal));
    cancelBtn.addEventListener('click', () => closeModal(paymentFormModal));
    paymentForm.addEventListener('submit', handleFormSubmit);
    installmentsCountInput.addEventListener('change', () => renderInstallmentFields(installmentsCountInput.value));
    
    tableBody.addEventListener('click', handleTableActions);

    // События для фильтров
    searchBtn.addEventListener('click', () => fetchAndRenderForms(1));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Предотвращаем стандартное поведение Enter
            fetchAndRenderForms(1);
        }
    });
    applyFiltersBtn.addEventListener('click', () => fetchAndRenderForms(1));
    resetFiltersBtn.addEventListener('click', () => {
        if(searchInput) searchInput.value = '';
        if(nameFilterInput) nameFilterInput.value = '';
        fetchAndRenderForms(1);
    });

    // Событие для переключателя доп. фильтров
    toggleFiltersBtn.addEventListener('click', () => {
        const icon = toggleFiltersBtn.querySelector('i');
        const textSpan = toggleFiltersBtn.querySelector('span');

        if (advancedFiltersContainer.style.display === 'none' || advancedFiltersContainer.style.display === '') {
            advancedFiltersContainer.style.display = 'block';
            if(textSpan) textSpan.textContent = 'Скрыть дополнительные фильтры';
            if(icon) {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-up');
            }
        } else {
            advancedFiltersContainer.style.display = 'none';
            if(textSpan) textSpan.textContent = 'Показать дополнительные фильтры';
            if(icon) {
                icon.classList.remove('bi-chevron-up');
                icon.classList.add('bi-chevron-down');
            }
        }
    });

    // Загружаем и отображаем данные
    fetchAndRenderForms(1);
};


async function fetchAndRenderForms(page = 1) {
    tableBody.innerHTML = `<tr><td colspan="3" class="text-center">Загрузка...</td></tr>`;

    const params = new URLSearchParams();
    params.append('page', page);
    if (searchInput && searchInput.value) {
        params.append('search', searchInput.value);
    }
    if (nameFilterInput && nameFilterInput.value) {
        params.append('name', nameFilterInput.value);
    }

    try {
        const response = await fetchAuthenticated(`/api/payment-forms?${params.toString()}`);
        const forms = response.data;

        if (forms && forms.length > 0) {
            tableBody.innerHTML = forms.map(form => `
                <tr data-id="${form.ID}">
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-payment-form-btn" data-id="${form.ID}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-payment-form-btn" data-id="${form.ID}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Имя">${form.name}</td>
                    <td data-label="Количество платежей">${form.installments_count}</td>
                </tr>`).join('');
        } else {
            tableBody.innerHTML = `<tr><td colspan="3" class="text-center">Формы оплаты не найдены.</td></tr>`;
        }
        
        renderPagination(paginationContainer, response.currentPage, response.totalPages, fetchAndRenderForms);
        
        initializeActionDropdowns();
        if (window.updateTableActionsVisibility) {
            window.updateTableActionsVisibility();
        }
    } catch (error) {
        console.error("Ошибка при загрузке форм оплаты:", error);
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Не удалось загрузить формы оплаты: ${error.message}</td></tr>`;
    }
}

function renderInstallmentFields(count, installmentsData = []) {
    installmentsContainer.innerHTML = '';
    const validCount = Number(count) || 0;
    for (let i = 0; i < validCount; i++) {
        const data = installmentsData[i] || {};
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'form-group border p-3 mb-3';
        fieldset.innerHTML = `
            <legend class="w-auto px-2 h6">Платеж ${i + 1}</legend>
            <div class="row">
                <div class="col-md-6 mb-3">
                    <label class="form-label">Месяц</label>
                    <select class="form-select installment-month" required>
                        ${monthNames.map((m, index) => `<option value="${index + 1}" ${data.month === (index + 1) ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
                <div class="col-md-6 mb-3">
                    <label class="form-label">День</label>
                    <input type="number" class="form-control installment-day" min="1" max="31" value="${data.day || 15}" required>
                </div>
            </div>
            <div class="mb-2">
                <label class="form-label">Формула платежа</label>
                <input type="text" class="form-control installment-formula" placeholder="Например: [Сумма с учётом скидки] / 9 * 2" value="${data.formula || ''}">
            </div>
        `;
        installmentsContainer.appendChild(fieldset);
    }
}


function openModalForCreate() {
    currentEditingId = null;
    modalTitle.textContent = "Создать форму оплаты";
    paymentForm.reset();
    renderInstallmentFields(1); // Начинаем с одного поля по умолчанию
    openModal(paymentFormModal);
}

async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.textContent = "Изменить форму оплаты";
    paymentForm.reset();
    try {
        const form = await fetchAuthenticated(`/api/payment-forms/${id}`);
        // Преобразуем месяцы из строк в числа для корректного выбора
        const installments = form.installments.map(inst => ({
            ...inst,
            month: monthNames.indexOf(inst.month) + 1
        }));

        paymentForm.elements.name.value = form.name;
        paymentForm.elements.installments_count.value = form.installments_count;
        renderInstallmentFields(form.installments_count, installments);
        openModal(paymentFormModal);
    } catch (error) {
        showAlert(`Ошибка загрузки формы: ${error.message}`, 'error');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const installments = [];
    installmentsContainer.querySelectorAll('fieldset').forEach(fs => {
        installments.push({
            // Отправляем месяц как число, а не как название
            month: parseInt(fs.querySelector('.installment-month').value, 10),
            day: parseInt(fs.querySelector('.installment-day').value, 10),
            formula: fs.querySelector('.installment-formula').value
        });
    });

    const data = {
        name: paymentForm.elements.name.value,
        installments_count: parseInt(paymentForm.elements.installments_count.value, 10),
        installments: installments
    };

    const url = currentEditingId ? `/api/payment-forms/${currentEditingId}` : '/api/payment-forms';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert(`Форма оплаты успешно ${currentEditingId ? 'обновлена' : 'создана'}!`, 'success');
        closeModal(paymentFormModal);
        fetchAndRenderForms(1); // Обновляем таблицу после сохранения
    } catch (error) {
        showAlert(`Ошибка сохранения: ${error.message}`, 'error');
    }
}

async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить эту форму оплаты?`);
    if (!confirmed) return;
    try {
        await fetchAuthenticated(`/api/payment-forms/${id}`, { method: 'DELETE' });
        showAlert('Форма оплаты успешно удалена.', 'success');
        fetchAndRenderForms(1); // Обновляем таблицу после удаления
    } catch (error) {
        showAlert(`Ошибка удаления: ${error.message}`, 'error');
    }
}

function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-payment-form-btn');
    const deleteBtn = e.target.closest('.delete-payment-form-btn');
    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
}

// Запускаем инициализацию при загрузке скрипта
window.initializePaymentFormsPage();