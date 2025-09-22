// crm/static/js/payment_fact.js
import { fetchAuthenticated, openModal, closeModal, showAlert, showConfirm, renderPagination, formatCurrency, formatDate, populateDropdown } from './utils.js';

let currentEditingId = null;
let searchTimeout;

// DOM Elements
const dom = {};

window.initializePaymentFactPage = function() {
    Object.assign(dom, {
        tableBody: document.getElementById('paymentFactTableBody'),
        paginationContainer: document.getElementById('paginationContainer'),
        searchInput: document.getElementById('paymentSearchInput'),
        addBtn: document.getElementById('addPaymentBtn'),
        viewModal: document.getElementById('viewPaymentModal'),
        viewModalBody: document.getElementById('viewPaymentModalBody'),
        editModal: document.getElementById('editPaymentModal'),
        editForm: document.getElementById('paymentForm'),
        modalTitle: document.getElementById('paymentModalTitle'),
        paymentIdField: document.getElementById('paymentId'),
        // Новые элементы для выбора договора
        classSelect: document.getElementById('payment_classSelect'),
        studentSelect: document.getElementById('payment_studentSelect'),
        contractSelect: document.getElementById('payment_contractSelect'),
    });

    bindEventListeners();
    fetchAndRenderPayments(1);
};

function bindEventListeners() {
    dom.addBtn.addEventListener('click', () => openEditModal());

    dom.searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => fetchAndRenderPayments(1), 300);
    });

    dom.tableBody.addEventListener('click', handleTableActions);
    
    [dom.viewModal, dom.editModal].forEach(modal => {
        modal.querySelectorAll('.close-button, .close-btn').forEach(btn => {
            btn.addEventListener('click', () => closeModal(modal));
        });
    });

    dom.editForm.addEventListener('submit', handleFormSubmit);

    // --- Обработчики для зависимых списков ---
    dom.classSelect.addEventListener('change', handleClassChange);
    dom.studentSelect.addEventListener('change', handleStudentChange);
}

// --- НОВЫЕ ФУНКЦИИ для управления зависимыми списками ---
async function handleClassChange() {
    const classId = dom.classSelect.value;
    dom.studentSelect.innerHTML = '<option value="">-- Сначала выберите класс --</option>';
    dom.contractSelect.innerHTML = '<option value="">-- Сначала выберите ученика --</option>';
    dom.studentSelect.disabled = true;
    dom.contractSelect.disabled = true;

    if (!classId) return;

    dom.studentSelect.disabled = false;
    await populateDropdown(
        dom.studentSelect, 
        `/api/students?all=true&class_id=${classId}`, 
        'ID', 
        item => `${item.lastName} ${item.firstName}`, 
        null, 
        '-- Выберите ученика --'
    );
}

async function handleStudentChange() {
    const studentId = dom.studentSelect.value;
    dom.contractSelect.innerHTML = '<option value="">-- Сначала выберите ученика --</option>';
    dom.contractSelect.disabled = true;

    if (!studentId) return;

    dom.contractSelect.disabled = false;
    await populateDropdown(
        dom.contractSelect, 
        `/api/students/${studentId}/contracts`, 
        'ID', 
        'contractNumber', 
        null, 
        '-- Выберите договор --'
    );
}
// --- КОНЕЦ НОВЫХ ФУНКЦИЙ ---


async function fetchAndRenderPayments(page = 1) {
    const searchQuery = dom.searchInput.value;
    dom.tableBody.innerHTML = `<tr><td colspan="9" class="text-center">Загрузка...</td></tr>`;

    try {
        const response = await fetchAuthenticated(`/api/payment-facts?page=${page}&search=${searchQuery}`);
        const payments = response.data || [];

        if (payments.length > 0) {
            dom.tableBody.innerHTML = payments.map(p => `
                <tr data-id="${p.ID}">
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="view-btn" data-id="${p.ID}"><i class="bi bi-eye"></i> Просмотр</a>
                                <a href="#" class="edit-btn" data-id="${p.ID}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-btn" data-id="${p.ID}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Номер договора">${p.ContractNumber || '—'}</td>
                    <td data-label="ФИО ученика">${p.StudentFullName || '—'}</td>
                    <td data-label="Сумма оплаты">${formatCurrency(p.Amount)}</td>
                    <td data-label="Дата оплаты">${formatDate(p.PaymentDate)}</td>
                    <td data-label="Учебный год">${p.AcademicYear || '—'}</td>
                    <td data-label="Наименование платежа">${p.PaymentName || '—'}</td>
                    <td data-label="Способ оплаты">${p.PaymentMethod || '—'}</td>
                    <td data-label="Сумма комиссии">${formatCurrency(p.Commission)}</td>
                </tr>
            `).join('');
        } else {
            dom.tableBody.innerHTML = `<tr><td colspan="9" class="text-center">Платежи не найдены.</td></tr>`;
        }
        renderPagination(dom.paginationContainer, response.currentPage, response.totalPages, fetchAndRenderPayments);
    } catch (error) {
        dom.tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Ошибка: ${error.message}</td></tr>`;
    }
}

function handleTableActions(e) {
    const target = e.target.closest('a');
    if (!target) return;
    
    e.preventDefault();
    const id = target.dataset.id;

    if (target.classList.contains('view-btn')) {
        openViewModal(id);
    } else if (target.classList.contains('edit-btn')) {
        openEditModal(id);
    } else if (target.classList.contains('delete-btn')) {
        handleDelete(id);
    }
}

async function openViewModal(id) {
    dom.viewModalBody.innerHTML = '<div class="loading-spinner"></div>';
    openModal(dom.viewModal);
    try {
        const p = await fetchAuthenticated(`/api/payment-facts/${id}`);
        dom.viewModalBody.innerHTML = `
            <div class="details-grid">
                <div class="detail-item"><strong>Номер договора:</strong> <span>${p.ContractNumber || '—'}</span></div>
                <div class="detail-item"><strong>Учебный год начало:</strong> <span>${p.AcademicYear ? p.AcademicYear.split('-')[0] : '—'}</span></div>
                <div class="detail-item"><strong>ФИО ученика:</strong> <span>${p.StudentFullName || '—'}</span></div>
                <div class="detail-item"><strong>Учебный год окончание:</strong> <span>${p.AcademicYear ? p.AcademicYear.split('-')[1] : '—'}</span></div>
                 <div class="detail-item"><strong>Наименование платежа:</strong> <span>${p.PaymentName || '—'}</span></div>
                <div class="detail-item"><strong>Сумма:</strong> <span>${formatCurrency(p.Amount)}</span></div>
                <div class="detail-item"><strong>Способ оплаты:</strong> <span>${p.PaymentMethod || '—'}</span></div>
                 <div class="detail-item"><strong>Сумма комиссии:</strong> <span>${formatCurrency(p.Commission)}</span></div>
                <div class="detail-item"><strong>Дата оплаты:</strong> <span>${formatDate(p.PaymentDate)}</span></div>
            </div>
        `;
    } catch(error) {
        dom.viewModalBody.innerHTML = `<p class="text-danger">Не удалось загрузить детали: ${error.message}</p>`;
    }
}

async function openEditModal(id = null) {
    dom.editForm.reset();
    handleClassChange(); // Сбрасываем зависимые списки
    currentEditingId = id;
    if (id) {
        dom.modalTitle.textContent = 'Изменить оплату по договору факт';
        // При редактировании скрываем выбор договора, т.к. он уже привязан
        dom.classSelect.closest('.form-row').style.display = 'none';

        try {
            const payment = await fetchAuthenticated(`/api/payment-facts/${id}`);
            dom.paymentIdField.value = payment.ID;
            dom.editForm.querySelector('#startYear').value = payment.AcademicYear ? payment.AcademicYear.split('-')[0] : '';
            dom.editForm.querySelector('#endYear').value = payment.AcademicYear ? payment.AcademicYear.split('-')[1] : '';
            dom.editForm.querySelector('#paymentName').value = payment.PaymentName;
            dom.editForm.querySelector('#paymentMethod').value = payment.PaymentMethod;
            dom.editForm.querySelector('#paymentDate').value = payment.PaymentDate.split('T')[0];
            dom.editForm.querySelector('#amount').value = payment.Amount;
            dom.editForm.querySelector('#commission').value = payment.Commission;
            // Важно: ContractID будет взят из существующей записи на бэкенде
        } catch (error) {
             showAlert(`Ошибка загрузки данных: ${error.message}`, 'error');
             return;
        }
    } else {
        dom.modalTitle.textContent = 'Создать оплату по договору факт';
        dom.paymentIdField.value = '';
        // Показываем выбор договора при создании
        dom.classSelect.closest('.form-row').style.display = 'grid'; 
        // Загружаем список классов в первый дропдаун
        populateDropdown(dom.classSelect, '/api/classes?all=true', 'id', (item) => `${item.grade_number} ${item.liter_char}`, null, '-- Выберите класс --');
    }
    openModal(dom.editModal);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const startYear = dom.editForm.querySelector('#startYear').value;
    const endYear = dom.editForm.querySelector('#endYear').value;
    
    // --- ИЗМЕНЕНИЕ: Получаем ID договора ---
    const contractId = parseInt(dom.contractSelect.value, 10);
    
    // Валидация: при создании нового платежа договор должен быть выбран
    if (!currentEditingId && !contractId) {
        showAlert('Пожалуйста, выберите договор.', 'warning');
        return;
    }

    const data = {
        academicYear: `${startYear}-${endYear}`,
        paymentName: dom.editForm.querySelector('#paymentName').value,
        paymentMethod: dom.editForm.querySelector('#paymentMethod').value,
        paymentDate: dom.editForm.querySelector('#paymentDate').value,
        amount: parseFloat(dom.editForm.querySelector('#amount').value) || 0,
        commission: parseFloat(dom.editForm.querySelector('#commission').value) || 0,
        contractId: contractId // Добавляем ID в тело запроса
    };
    
    const url = currentEditingId ? `/api/payment-facts/${currentEditingId}` : '/api/payment-facts';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert(`Платеж успешно ${currentEditingId ? 'обновлен' : 'создан'}!`, 'success');
        closeModal(dom.editModal);
        fetchAndRenderPayments(1);
    } catch(error) {
        showAlert(`Ошибка: ${error.message}`, 'error');
    }
}

async function handleDelete(id) {
    const confirmed = await showConfirm('Вы уверены, что хотите удалить этот платеж?');
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/payment-facts/${id}`, { method: 'DELETE' });
        showAlert('Платеж успешно удален.', 'success');
        fetchAndRenderPayments(1);
    } catch(error) {
        showAlert(`Ошибка удаления: ${error.message}`, 'error');
    }
}