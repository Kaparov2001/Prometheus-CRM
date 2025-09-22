import {
    fetchAuthenticated,
    showAlert,
    openModal,
    closeModal,
    populateDropdown,
    initializeActionDropdowns,
    renderPagination,
    formatDate,
    formatCurrency,
    showConfirm
} from './utils.js';

// --- 1. Глобальные переменные и состояние ---
let currentContractId = null; 
let currentEditingPaymentId = null;
let currentFilters = {};
let searchTimeout;

let dom = {};

/**
 * Главная функция инициализации страницы.
 */
window.initializePlannedPaymentsPage = function() {
    dom = {
        tableBody: document.getElementById('plannedPaymentsTableBody'),
        paginationContainer: document.getElementById('paginationContainer'),
        mainSearchInput: document.getElementById('plannedPaymentsSearchInput'),
        mainSearchBtn: document.getElementById('plannedPaymentsSearchBtn'),
        createPlanBtn: document.getElementById('createPlanBtn'),
        exportExcelBtn: document.getElementById('exportExcelBtn'),

        toggleFiltersBtn: document.getElementById('toggleFiltersBtn'),
        advancedFiltersContainer: document.getElementById('advancedFiltersContainer'),
        applyFiltersBtn: document.getElementById('applyFiltersBtn'),
        resetFiltersBtn: document.getElementById('resetFiltersBtn'),
        filterAmountFrom: document.getElementById('filterAmountFrom'),
        filterAmountTo: document.getElementById('filterAmountTo'),
        filterYearFrom: document.getElementById('filterYearFrom'),
        filterYearTo: document.getElementById('filterYearTo'),
        filterPaymentDate: document.getElementById('filterPaymentDate'),
        filterClass: document.getElementById('filterClass'),

        paymentModal: document.getElementById('paymentModal'),
        paymentModalTitle: document.getElementById('paymentModalTitle'),
        closePaymentModalBtn: document.getElementById('closePaymentModalBtn'),
        paymentForm: document.getElementById('paymentForm'),
        savePaymentBtn: document.getElementById('savePaymentBtn'),
        cancelPaymentBtn: document.getElementById('cancelPaymentBtn'),
        contractSelectionContainer: document.getElementById('contractSelectionContainer'),
        classSelect: document.getElementById('payment_classSelect'),
        studentSelect: document.getElementById('payment_studentSelect'),
        contractSelect: document.getElementById('payment_contractSelect'),
        
        planGeneratorContainer: document.getElementById('planGeneratorContainer'),
        planPaymentFormSelect: document.getElementById('plan_paymentForm'),
        planStartYear: document.getElementById('plan_startYear'),
        planEndYear: document.getElementById('plan_endYear'),
        planTotalAmount: document.getElementById('plan_totalAmount'),
        planDiscountedAmount: document.getElementById('plan_discountedAmount'),
        planInstallmentsContainer: document.getElementById('plan_installments_container'),

        editSinglePaymentModal: document.getElementById('editSinglePaymentModal'),
        editSinglePaymentForm: document.getElementById('editSinglePaymentForm'),
        closeEditSinglePaymentModalBtn: document.getElementById('closeEditSinglePaymentModalBtn'),
        cancelEditSinglePaymentBtn: document.getElementById('cancelEditSinglePaymentBtn'),

        viewModal: document.getElementById('viewPaymentModal'),
        viewModalBody: document.getElementById('viewPaymentModalBody'),
        closeViewModalBtn: document.getElementById('closeViewPaymentModalBtn'),
        closeViewModalFooterBtn: document.getElementById('closeViewModalFooterBtn'),
    };

    bindEventListeners();
    loadClassesFilter();
    fetchAndRenderPayments(1);
};


/**
 * Привязывает все обработчики событий.
 */
function bindEventListeners() {
    dom.mainSearchBtn.addEventListener('click', () => applyFiltersAndSearch(1));
    dom.mainSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyFiltersAndSearch(1);
    });

    dom.createPlanBtn.addEventListener('click', openModalForCreatePlan);
    dom.exportExcelBtn.addEventListener('click', handleExport);
    dom.tableBody.addEventListener('click', handleTableActions);
    
    dom.toggleFiltersBtn.addEventListener('click', toggleFilters);
    dom.applyFiltersBtn.addEventListener('click', () => applyFiltersAndSearch(1));
    dom.resetFiltersBtn.addEventListener('click', resetFilters);

    dom.closePaymentModalBtn.addEventListener('click', () => closeModal(dom.paymentModal, resetPlanForm));
    dom.cancelPaymentBtn.addEventListener('click', () => closeModal(dom.paymentModal, resetPlanForm));
    dom.paymentForm.addEventListener('submit', handlePlanFormSubmit);

    dom.classSelect.addEventListener('change', handleClassChange);
    dom.studentSelect.addEventListener('change', handleStudentChange);
    dom.contractSelect.addEventListener('change', handleContractChange);
    dom.planPaymentFormSelect.addEventListener('change', previewPaymentPlan);

    dom.closeEditSinglePaymentModalBtn.addEventListener('click', () => closeModal(dom.editSinglePaymentModal));
    dom.cancelEditSinglePaymentBtn.addEventListener('click', () => closeModal(dom.editSinglePaymentModal));
    dom.editSinglePaymentForm.addEventListener('submit', handleEditSinglePaymentSubmit);

    dom.closeViewModalBtn.addEventListener('click', () => closeModal(dom.viewModal));
    dom.closeViewModalFooterBtn.addEventListener('click', () => closeModal(dom.viewModal));
}

// --- 2. Функции для работы с API и отрисовки ---

async function fetchAndRenderPayments(page = 1) {
    dom.tableBody.innerHTML = `<tr><td colspan="8" class="text-center">Загрузка...</td></tr>`;
    
    const params = new URLSearchParams(currentFilters);
    params.append('page', page);

    try {
        const response = await fetchAuthenticated(`/api/planned-payments/?${params.toString()}`);
        const payments = response.data || [];

        if (payments.length > 0) {
            dom.tableBody.innerHTML = payments.map(p => `
                <tr data-id="${p.ID}" data-contract-id="${p.contractId}">
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="view-payment-btn" data-id="${p.ID}"><i class="bi bi-eye"></i> Просмотр</a>
                                <a href="#" class="edit-payment-btn" data-id="${p.ID}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="regenerate-plan-btn" data-contract-id="${p.contractId}"><i class="bi bi-arrow-repeat"></i> Пересоздать план</a>
                                <a href="#" class="delete-payment-btn" data-id="${p.ID}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Номер договора">${p.contractNumber || '—'}</td>
                    <td data-label="ФИО ученика">${p.studentFullName || '—'}</td>
                    <td data-label="Класс">${p.studentClass.trim() || '—'}</td>
                    <td data-label="Планируемая сумма">${formatCurrency(p.plannedAmount)}</td>
                    <td data-label="Планируемая дата">${p.paymentDate ? formatDate(p.paymentDate) : '—'}</td>
                    <td data-label="Наименование платежа">${p.paymentName || '—'}</td>
                    <td data-label="Комментарий">${p.comment || '—'}</td>
                </tr>
            `).join('');
        } else {
            dom.tableBody.innerHTML = '<tr><td colspan="8" class="text-center">Платежи не найдены.</td></tr>';
        }

        renderPagination(dom.paginationContainer, response.currentPage, response.totalPages, fetchAndRenderPayments);
        initializeActionDropdowns();
        window.updateTableActionsVisibility?.();
    } catch (error) {
        dom.tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Не удалось загрузить данные: ${error.message}</td></tr>`;
    }
}

// --- 3. Логика модального окна создания/редактирования плана ---

function resetPlanForm() {
    dom.paymentForm.reset();
    currentContractId = null;
    dom.studentSelect.innerHTML = '<option value="">-- Сначала выберите класс --</option>';
    dom.studentSelect.disabled = true;
    dom.contractSelect.innerHTML = '<option value="">-- Сначала выберите ученика --</option>';
    dom.contractSelect.disabled = true;
    dom.planGeneratorContainer.style.display = 'none';
    dom.planInstallmentsContainer.innerHTML = '';
    dom.contractSelectionContainer.style.display = 'block';
    [dom.classSelect, dom.studentSelect, dom.contractSelect].forEach(el => el.disabled = false);
}

async function openModalForCreatePlan() {
    resetPlanForm();
    dom.paymentModalTitle.textContent = 'Создать план платежей';
    dom.savePaymentBtn.textContent = 'Сгенерировать план';
    openModal(dom.paymentModal);
    await populateDropdown(dom.classSelect, '/api/classes?all=true', 'id', item => `${item.grade_number} ${item.liter_char}`, null, '-- Выберите класс --');
}

async function openPlanEditorModal(contractId) {
    resetPlanForm();
    dom.paymentModalTitle.textContent = 'Изменить план платежей';
    dom.savePaymentBtn.textContent = 'Пересоздать и сохранить';
    dom.contractSelectionContainer.style.display = 'none'; // Скрываем выбор, т.к. договор известен
    
    openModal(dom.paymentModal);
    await setupPlanGenerator(contractId);
}

async function setupPlanGenerator(contractId) {
    currentContractId = contractId;
    if (!contractId) {
        dom.planGeneratorContainer.style.display = 'none';
        return;
    }

    try {
        const contract = await fetchAuthenticated(`/api/contracts/${contractId}`);
        dom.planTotalAmount.value = formatCurrency(contract.totalAmount);
        dom.planDiscountedAmount.value = formatCurrency(contract.discountedAmount);
        
        const startYear = new Date(contract.startDate).getFullYear();
        dom.planStartYear.value = startYear;
        dom.planEndYear.value = startYear + 1;

        await populateDropdown(dom.planPaymentFormSelect, '/api/payment-forms?all=true', 'ID', 'name', contract.paymentFormId, '-- Выберите форму оплаты --');
        dom.planGeneratorContainer.style.display = 'block';

        if (contract.paymentFormId) {
            previewPaymentPlan();
        }
    } catch (error) {
        showAlert(`Ошибка загрузки данных договора: ${error.message}`, 'error');
    }
}

async function handleClassChange() {
    const classId = dom.classSelect.value;
    const selectedClassId = dom.classSelect.value;
    resetPlanForm(); 
    await populateDropdown(dom.classSelect, '/api/classes?all=true', 'id', item => `${item.grade_number} ${item.liter_char}`, selectedClassId, '-- Выберите класс --');
    dom.classSelect.value = selectedClassId;

    if (!classId) return;

    dom.studentSelect.disabled = false;
    await populateDropdown(dom.studentSelect, `/api/students?all=true&class_id=${classId}`, 'ID', item => `${item.lastName} ${item.firstName}`, null, '-- Выберите ученика --');
}

async function handleStudentChange() {
    const studentId = dom.studentSelect.value;
    
    dom.contractSelect.innerHTML = '<option value="">-- Сначала выберите ученика --</option>';
    dom.contractSelect.disabled = true;
    dom.planGeneratorContainer.style.display = 'none';
    currentContractId = null;

    if (!studentId) return;

    dom.contractSelect.disabled = false;
    await populateDropdown(dom.contractSelect, `/api/students/${studentId}/contracts`, 'ID', 'contractNumber', null, '-- Выберите договор --');
}

function handleContractChange() {
    setupPlanGenerator(dom.contractSelect.value);
}

async function previewPaymentPlan() {
    const paymentFormId = dom.planPaymentFormSelect.value;
    dom.planInstallmentsContainer.innerHTML = '';

    if (!paymentFormId || !currentContractId) return;

    try {
        const schedule = await fetchAuthenticated(`/api/contracts/${currentContractId}/preview-plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentFormId: parseInt(paymentFormId) })
        });

        if (schedule && schedule.length > 0) {
            const html = schedule.map((p, i) => `
                <div class="form-row" style="grid-template-columns: 1fr 1fr; gap: 1rem; align-items: center;">
                    <div class="form-group"><label>${i + 1}. Дата оплаты по договору</label><input type="text" class="form-control" value="${p.paymentDate}" readonly></div>
                    <div class="form-group"><label>${i + 1}. Сумма оплаты по договору</label><input type="text" class="form-control" value="${formatCurrency(p.amount)}" readonly></div>
                </div>`).join('');
            dom.planInstallmentsContainer.innerHTML = `<h5 style="margin-bottom: 1rem;">Предпросмотр графика</h5>${html}`;
        }
    } catch (error) {
        showAlert(`Не удалось загрузить превью плана: ${error.message}`, 'error');
    }
}

async function handlePlanFormSubmit(e) {
    e.preventDefault();
    const paymentFormId = dom.planPaymentFormSelect.value;
    
    if (!currentContractId || !paymentFormId) {
        showAlert('Пожалуйста, выберите договор и форму оплаты.', 'warning');
        return;
    }

    const confirmed = await showConfirm('Вы уверены?', 'Существующий план для этого договора будет удален и заменен новым.');
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/contracts/${currentContractId}/generate-plan`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ paymentFormId: parseInt(paymentFormId) })
        });
        showAlert('План платежей успешно сгенерирован!', 'success');
        closeModal(dom.paymentModal, resetPlanForm);
        fetchAndRenderPayments(1);
    } catch (error) {
        showAlert(`Ошибка при генерации плана: ${error.message}`, 'error');
    }
}

// --- 4. Обработка действий в таблице и модальные окна ---

function handleTableActions(e) {
    const target = e.target.closest('a');
    if (!target) return;
    e.preventDefault();

    const paymentId = target.dataset.id;
    const contractId = target.dataset.contractId;

    if (target.classList.contains('view-payment-btn')) {
        openViewModal(paymentId);
    } else if (target.classList.contains('edit-payment-btn')) {
        openModalForEditSinglePayment(paymentId);
    } else if (target.classList.contains('regenerate-plan-btn')) {
        openPlanEditorModal(contractId);
    } else if (target.classList.contains('delete-payment-btn')) {
        handleDeletePayment(paymentId);
    }
}

async function openModalForEditSinglePayment(paymentId) {
    currentEditingPaymentId = paymentId;
    dom.editSinglePaymentForm.reset();
    try {
        const payment = await fetchAuthenticated(`/api/planned-payments/${paymentId}`);
        dom.editSinglePaymentForm.querySelector('#edit_paymentId').value = paymentId;
        dom.editSinglePaymentForm.querySelector('#edit_paymentName').value = payment.paymentName || '';
        dom.editSinglePaymentForm.querySelector('#edit_paymentDate').value = payment.paymentDate ? new Date(payment.paymentDate).toISOString().split('T')[0] : '';
        dom.editSinglePaymentForm.querySelector('#edit_plannedAmount').value = payment.plannedAmount || 0;
        dom.editSinglePaymentForm.querySelector('#edit_comment').value = payment.comment || '';
        openModal(dom.editSinglePaymentModal);
    } catch (error) {
        showAlert(`Не удалось загрузить данные для редактирования: ${error.message}`, 'error');
    }
}

async function handleEditSinglePaymentSubmit(e) {
    e.preventDefault();
    const paymentId = dom.editSinglePaymentForm.querySelector('#edit_paymentId').value;
    const data = {
        paymentName: dom.editSinglePaymentForm.querySelector('#edit_paymentName').value,
        paymentDate: dom.editSinglePaymentForm.querySelector('#edit_paymentDate').value,
        plannedAmount: parseFloat(dom.editSinglePaymentForm.querySelector('#edit_plannedAmount').value),
        comment: dom.editSinglePaymentForm.querySelector('#edit_comment').value,
    };

    try {
        await fetchAuthenticated(`/api/planned-payments/${paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert('Запись успешно обновлена!', 'success');
        closeModal(dom.editSinglePaymentModal);
        fetchAndRenderPayments(1);
    } catch (error) {
        showAlert(`Ошибка обновления: ${error.message}`, 'error');
    }
}

async function openViewModal(paymentId) {
    dom.viewModalBody.innerHTML = '<div class="loading-spinner"></div>';
    openModal(dom.viewModal);
    try {
        const payment = await fetchAuthenticated(`/api/planned-payments/${paymentId}`);
        const detailsHtml = `
            <div class="details-grid" style="display: grid; gap: 1rem;">
                <div class="detail-item"><strong>Номер договора:</strong> <span>${payment.contractNumber || '—'}</span></div>
                <div class="detail-item"><strong>ФИО ученика:</strong> <span>${payment.studentFullName || '—'}</span></div>
                <div class="detail-item"><strong>Класс:</strong> <span>${payment.studentClass.trim() || '—'}</span></div>
                <div class="detail-item"><strong>Планируемая сумма:</strong> <span>${formatCurrency(payment.plannedAmount)}</span></div>
                <div class="detail-item"><strong>Планируемая дата:</strong> <span>${payment.paymentDate ? formatDate(payment.paymentDate) : '—'}</span></div>
                <div class="detail-item"><strong>Наименование:</strong> <span>${payment.paymentName || '—'}</span></div>
                <div class="detail-item"><strong>Комментарий:</strong> <span>${payment.comment || '—'}</span></div>
            </div>
        `;
        dom.viewModalBody.innerHTML = detailsHtml;
    } catch (error) {
        dom.viewModalBody.innerHTML = `<p class="text-danger">Не удалось загрузить детали: ${error.message}</p>`;
    }
}

async function handleDeletePayment(paymentId) {
    const confirmed = await showConfirm('Вы уверены, что хотите удалить этот платеж?');
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/planned-payments/${paymentId}`, { method: 'DELETE' });
        showAlert('Платеж успешно удален.', 'success');
        fetchAndRenderPayments(1);
    } catch (error) {
        showAlert(`Ошибка удаления: ${error.message}`, 'error');
    }
}

// --- 5. Логика фильтров и экспорта ---

function handleExport() {
    const params = new URLSearchParams(currentFilters);
    const exportUrl = `/api/planned-payments/export?${params.toString()}`;
    window.location.href = exportUrl;
    showAlert('Формирование отчета начато...', 'info');
}

function toggleFilters() {
    const icon = dom.toggleFiltersBtn.querySelector('i');
    const textSpan = dom.toggleFiltersBtn.querySelector('span');

    if (dom.advancedFiltersContainer.style.display === 'none') {
        dom.advancedFiltersContainer.style.display = 'block';
        textSpan.textContent = 'Скрыть дополнительные фильтры';
        icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
    } else {
        dom.advancedFiltersContainer.style.display = 'none';
        textSpan.textContent = 'Показать дополнительные фильтры';
        icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
    }
}

function applyFiltersAndSearch(page = 1) {
    currentFilters = {
        search: dom.mainSearchInput.value,
        amount_from: dom.filterAmountFrom.value,
        amount_to: dom.filterAmountTo.value,
        year_from: dom.filterYearFrom.value,
        year_to: dom.filterYearTo.value,
        date: dom.filterPaymentDate.value,
        class_id: dom.filterClass.value,
    };

    Object.keys(currentFilters).forEach(key => {
        if (!currentFilters[key]) delete currentFilters[key];
    });

    fetchAndRenderPayments(page);
}

function resetFilters() {
    currentFilters = {};
    dom.mainSearchInput.value = '';
    dom.filterAmountFrom.value = '';
    dom.filterAmountTo.value = '';
    dom.filterYearFrom.value = '';
    dom.filterYearTo.value = '';
    dom.filterPaymentDate.value = '';
    dom.filterClass.value = '';
    fetchAndRenderPayments(1);
}

function loadClassesFilter() {
    populateDropdown(dom.filterClass, '/api/classes?all=true', 'id', item => `${item.grade_number} ${item.liter_char}`, null, 'Все классы');
}
