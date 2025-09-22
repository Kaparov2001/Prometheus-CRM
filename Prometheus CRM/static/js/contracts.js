// ===================================================================
// Prometheus CRM/static/js/contracts.js
// Description: Manages the "Contracts" page, including listing, creating,
// editing, and deleting contract records, and handling associated modals.
// Depends on: utils.js
// ===================================================================

import {
    fetchAuthenticated,
    openModal,
    closeModal,
    showAlert,
    showConfirm,
    populateDropdown,
    initializeActionDropdowns, // оставим импорт, но используем свою версию для контракта
    renderPagination,
    formatDate,
    formatCurrency
} from './utils.js';

// --- 1. Глобальные переменные и состояние ---

// ID текущего редактируемого договора
let currentContractId = null;
// Таймер для задержки выполнения поиска
let searchTimeout;

// Объект для хранения ссылок на ключевые DOM-элементы страницы
const dom = {
    tableBody: document.getElementById('contractsTableBody'),
    paginationContainer: document.getElementById('paginationContainer'),
    contractsSearchInput: document.getElementById('contractsSearchInput'),

    // Модальное окно редактирования/просмотра договора
    contractModal: document.getElementById('contractModal'),
    contractForm: document.getElementById('contractForm'),
    closeContractModalBtn: document.getElementById('closeContractModalBtn'),
    cancelContractBtn: document.getElementById('cancelContractBtn'),
    contractModalTitle: document.getElementById('contractModalTitle'),

    // Модальное окно для файлов
    filesModal: document.getElementById('filesModal'),
    filesTableBody: document.getElementById('filesTableBody'),
    closeFilesModalBtn: document.getElementById('closeFilesModalBtn'),
    cancelFilesModalBtn: document.getElementById('cancelFilesModalBtn'),

    // Модальное окно для добавления оплаты
    addPaymentModal: document.getElementById('addPaymentModal'),
    addPaymentForm: document.getElementById('addPaymentForm'),
    closeAddPaymentModalBtn: document.getElementById('closeAddPaymentModalBtn'),
    cancelAddPaymentBtn: document.getElementById('cancelAddPaymentBtn'),

    // Модальное окно плана платежей
    planModal: document.getElementById('planModal'),
    planForm: document.getElementById('planForm'),
    planModalTitle: document.getElementById('planModalTitle'),
    closePlanModalBtn: document.getElementById('closePlanModalBtn'),
    cancelPlanBtn: document.getElementById('cancelPlanBtn'),
    savePlanBtn: document.getElementById('savePlanBtn'),
    planInstallmentsContainer: document.getElementById('plan_installments_container'),
};

/**
 * Главная функция инициализации страницы "Договоры".
 * Вызывается из dashboard.js после загрузки HTML-кода страницы.
 */
window.initializeContractsPage = function() {
    bindEventListeners();
    fetchAndRender(1); // Загружаем первую страницу договоров при инициализации
};


/**
 * Привязывает все необходимые обработчики событий к элементам страницы.
 */
function bindEventListeners() {
    // Поиск с задержкой для уменьшения нагрузки на сервер
    dom.contractsSearchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            fetchAndRender(1); // Выполняем поиск и переходим на первую страницу результатов
        }, 300); // Задержка в 300 мс
    });

    // Делегирование событий для всех кнопок в таблице
    dom.tableBody.addEventListener('click', handleTableActions);

    // Обработчики для модальных окон
    dom.closeContractModalBtn?.addEventListener('click', () => closeModal(dom.contractModal));
    dom.cancelContractBtn?.addEventListener('click', () => closeModal(dom.contractModal));
    dom.contractForm?.addEventListener('submit', handleContractFormSubmit);

    dom.closeFilesModalBtn?.addEventListener('click', () => closeModal(dom.filesModal));
    dom.cancelFilesModalBtn?.addEventListener('click', () => closeModal(dom.filesModal));

    dom.closeAddPaymentModalBtn?.addEventListener('click', () => closeModal(dom.addPaymentModal));
    dom.cancelAddPaymentBtn?.addEventListener('click', () => closeModal(dom.addPaymentModal));
    dom.addPaymentForm?.addEventListener('submit', handleAddPaymentSubmit);

    dom.closePlanModalBtn?.addEventListener('click', () => closeModal(dom.planModal));
    dom.cancelPlanBtn?.addEventListener('click', () => closeModal(dom.planModal));
    dom.planForm?.addEventListener('submit', handlePlanFormSubmit);

    // Переключатели скидок в модальном окне плана
    document.getElementById('sumDiscountBtn')?.addEventListener('click', () => toggleDiscountInput('sum'));
    document.getElementById('percentDiscountBtn')?.addEventListener('click', () => toggleDiscountInput('percent'));
    document.getElementById('plan_discountAmount')?.addEventListener('input', calculateDiscountedAmountFromSum);
    document.getElementById('plan_paymentForm')?.addEventListener('change', previewPaymentPlan);

    // Клик по «Скачать» в модалке файлов (делегирование)
    dom.filesTableBody?.addEventListener('click', handleFilesModalClick);
}

// --- 2. Функции для работы с API и отрисовки ---

/**
 * Загружает и отображает список договоров с пагинацией.
 * @param {number} page - Номер страницы для загрузки.
 */
async function fetchAndRender(page = 1) {
    const searchQuery = dom.contractsSearchInput.value;
    dom.tableBody.innerHTML = `<tr><td colspan="10" class="text-center">Загрузка данных...</td></tr>`;
    try {
        // Формируем URL с параметрами страницы и поиска
        const response = await fetchAuthenticated(`/api/contracts?page=${page}&search=${encodeURIComponent(searchQuery)}`);
        const items = response.data || [];

        if (items.length > 0) {
            dom.tableBody.innerHTML = items.map(item => {
                let actions;
                let contractNumber = '—';
                let startDate = '—';
                let endDate = '—';
                let status = '—'; // Заглушка для будущего статуса из TrustMe
                let discountedAmount = '—';
                let paymentForm = '—';
                let manager = '—';

                // Используем более строгую проверку (item.id != null).
                if (item.id != null) {
                    contractNumber = item.contractNumber || '—';
                    startDate = item.startDate ? formatDate(item.startDate) : '—';
                    endDate = item.endDate ? formatDate(item.endDate) : '—';
                    discountedAmount = item.discountedAmount != null ? formatCurrency(item.discountedAmount) : '—';
                    paymentForm = item.paymentFormName || 'Не задан';
                    manager = item.managerFullName || '—';

                    // Полное меню действий + "Скачать" + "Создать договор" для данного ученика
                    actions = `
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="view-contract-btn" data-id="${item.id}"><i class="bi bi-eye"></i> Просмотр</a>
                                <a href="#" class="edit-contract-btn" data-id="${item.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-contract-btn" data-id="${item.id}"><i class="bi bi-trash"></i> Удалить</a>
                                <a href="#" class="files-btn" data-student-id="${item.studentId}" data-contract-id="${item.id}"><i class="bi bi-folder2-open"></i> Файлы</a>
                                <a href="#" class="add-payment-btn" data-student-id="${item.studentId}" data-contract-id="${item.id}"><i class="bi bi-currency-dollar"></i> Добавить оплату</a>
                                <a href="#" class="plan-btn" data-id="${item.id}"><i class="bi bi-calendar-plus"></i> Создать план платежей</a>
                                <a href="#" class="download-contract-btn" data-id="${item.id}" data-number="${contractNumber}"><i class="bi bi-download"></i> Скачать</a>
                                <a href="#" class="send-trustme-btn" data-id="${item.id}"><i class="bi bi-send-check"></i> Отправить через TrustMe</a>
                                <hr>
                                <a href="#" class="create-contract-btn" data-student-id="${item.studentId}"><i class="bi bi-plus-lg"></i> Создать договор</a>
                            </div>
                        </div>
                    `;
                } else {
                    endDate = 'Договор не создан';
                    actions = `
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="create-contract-btn" data-student-id="${item.studentId}"><i class="bi bi-plus-lg"></i> Создать договор</a>
                            </div>
                        </div>
                    `;
                }

                // Возвращаем HTML-код строки таблицы
                return `
                <tr data-student-id="${item.studentId}" data-contract-id="${item.id || ''}">
                    <td data-label="Действия" class="text-center">${actions}</td>
                    <td data-label="Номер договора">${contractNumber}</td>
                    <td data-label="Дата заключения">${startDate}</td>
                    <td data-label="Дата окончания">${endDate}</td>
                    <td data-label="Статус договора">${status}</td>
                    <td data-label="Стоимость договора">${discountedAmount}</td>
                    <td data-label="План платежей">${paymentForm}</td>
                    <td data-label="ФИО Ученика"><b>${item.studentFullName || '—'}</b></td>
                    <td data-label="Класс">${(item.studentClass || '').trim() || '—'}</td>
                    <td data-label="Менеджер">${manager}</td>
                </tr>
                `;
            }).join('');
        } else {
            dom.tableBody.innerHTML = '<tr><td colspan="10" class="text-center">Договоры не найдены.</td></tr>';
        }

        // Отрисовываем пагинацию
        renderPagination(dom.paginationContainer, response.currentPage, response.totalPages, fetchAndRender);
        // Инициализируем выпадающие меню (с «порталом», чтобы не клипались)
        initializeContractsDropdowns();
    } catch (error) {
        dom.tableBody.innerHTML = `<tr><td colspan="10" class="text-center text-danger">Не удалось загрузить данные: ${error.message}</td></tr>`;
    }
}

// --- 3. Обработка модальных окон и форм ---

/**
 * Обрабатывает все клики в таблице с помощью делегирования.
 * ВАЖНО: работает для элементов внутри строки; пункты «меню действий»
 * обрабатываются в initializeContractsDropdowns, т.к. меню переносится в <body>.
 * @param {Event} e - Событие клика.
 */
function handleTableActions(e) {
    const target = e.target.closest('a, button');
    if (!target) return;
    // Если клик пришёл из «портального» меню, он не на tbody — игнорируем тут.
    if (target.closest('.action-dropdown-content')) return;

    e.preventDefault();

    const classList = target.classList;
    const id = target.dataset.id;
    const studentId = target.dataset.studentId;
    const contractId = target.dataset.contractId; // Получаем ID договора из кнопки

    if (classList.contains('create-contract-btn')) {
        handleCreateContract(studentId);
    } else if (classList.contains('edit-contract-btn')) {
        openContractModal(id, false); // false = режим редактирования
    } else if (classList.contains('view-contract-btn')) {
        openContractModal(id, true); // true = режим только для чтения
    } else if (classList.contains('delete-contract-btn')) {
        handleDeleteContract(id);
    } else if (classList.contains('files-btn')) {
        openFilesModal(studentId);
    } else if (classList.contains('add-payment-btn')) {
        // Передаем ID договора в функцию
        openAddPaymentModal(studentId, contractId);
    } else if (classList.contains('plan-btn')) {
        openPlanModal(id);
    } else if (classList.contains('send-trustme-btn')) {
        handleSendToTrustMe(id);
    } else if (classList.contains('download-contract-btn')) {
        const number = target.dataset.number || 'contract';
        downloadContract(id, number);
    }
}

/**
 * Создает новый договор для ученика.
 * - Сумма берётся из «Стоимость обучения»:
 *   admissionYear <= 2023 → цена 2023; иначе → текущая (максимальный год).
 * @param {string} studentId - ID ученика.
 */
async function handleCreateContract(studentId) {
    const confirmed = await showConfirm(
        'Создать новый договор для этого ученика?',
        'Сумма будет определена автоматически из «Стоимость обучения».'
    );
    if (!confirmed) return;

    try {
        // 1) Считаем сумму по правилу
        const { amount } = await computeTuitionAmountForStudent(studentId);

        // 2) Создаём контракт (если бэк принимает totalAmount — укажем сразу)
        await postContractWithDuplicateRetry({
            studentId: parseInt(studentId, 10),
            totalAmount: amount || undefined
        });

        showAlert('Договор успешно создан!', 'success');
        fetchAndRender(1);
    } catch (error) {
        showAlert(`Ошибка создания договора: ${error.message}`, 'error');
    }
}

/**
 * Повторная попытка создания договора при конфликте номера (уникальный ключ).
 * Сервер вернёт 409/500 с сообщением о duplicate — пробуем ещё несколько раз.
 */
async function postContractWithDuplicateRetry(body, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            await fetchAuthenticated('/api/contracts', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            return;
        } catch (err) {
            const msg = String(err?.message || '');
            const isDuplicate =
                msg.includes('duplicate') ||
                msg.includes('unique') ||
                msg.includes('уникаль') ||
                msg.includes('contracts_contract_number_key');
            if (isDuplicate && i < retries - 1) {
                await new Promise(r => setTimeout(r, 400));
                continue;
            }
            throw err;
        }
    }
}

/**
 * Открывает модальное окно для просмотра или редактирования договора.
 * @param {string} id - ID договора.
 * @param {boolean} [isReadOnly=false] - Флаг режима "только для чтения".
 */
async function openContractModal(id, isReadOnly = false) {
    currentContractId = id;
    dom.contractForm.reset();
    dom.contractModalTitle.textContent = isReadOnly ? "Просмотр договора" : "Изменить договор";

    try {
        const contract = await fetchAuthenticated(`/api/contracts/${id}`);

        dom.contractForm.dataset.studentId = contract.studentId;

        // Заполнение полей формы
        dom.contractForm.elements.studentFullName.value = contract.student.lastName + ' ' + contract.student.firstName;
        dom.contractForm.elements.contractNumber.value = contract.contractNumber;
        dom.contractForm.elements.signingMethod.value = contract.signingMethod;
        dom.contractForm.elements.startDate.value = contract.startDate ? new Date(contract.startDate).toISOString().split('T')[0] : '';
        dom.contractForm.elements.endDate.value = contract.endDate ? new Date(contract.endDate).toISOString().split('T')[0] : '';
        dom.contractForm.elements.totalAmount.value = contract.totalAmount;
        dom.contractForm.elements.discountPercentage.value = contract.discountPercentage;
        dom.contractForm.elements.discountedAmount.value = contract.discountedAmount;

        // Блокировка/разблокировка полей в зависимости от режима
        const fields = dom.contractForm.querySelectorAll('input, select');
        fields.forEach(field => field.disabled = isReadOnly);
        dom.contractForm.querySelector('button[type="submit"]').style.display = isReadOnly ? 'none' : 'block';

        openModal(dom.contractModal);
    } catch (error) {
        showAlert(`Ошибка загрузки данных договора: ${error.message}`, 'error');
    }
}

/**
 * Открывает модальное окно со списком всех договоров ученика.
 * @param {string} studentId - ID ученика.
 */
async function openFilesModal(studentId) {
    dom.filesTableBody.innerHTML = `<tr><td colspan="4" class="text-center">Загрузка...</td></tr>`;
    openModal(dom.filesModal);
    try {
        // Используем эндпоинт, который возвращает все договоры, включая удаленные
        const contracts = await fetchAuthenticated(`/api/students/${studentId}/contracts`);
        if (contracts && contracts.length > 0) {
            dom.filesTableBody.innerHTML = contracts.map(contract => {
                const cid = contract.ID ?? contract.id ?? contract.Id;
                const number = contract.contractNumber ?? contract.number ?? 'contract';
                return `
                <tr>
                    <td>${number}</td>
                    <td>${formatDate(contract.CreatedAt || contract.createdAt || contract.created_at)}</td>
                    <td>${contract.DeletedAt ? 'Удален' : 'Активен'}</td>
                    <td class="text-center">
                        <button type="button" class="button-secondary btn-sm download-contract-btn" data-id="${cid}" data-number="${number}">
                            <i class="bi bi-download"></i> Скачать
                        </button>
                    </td>
                </tr>`;
            }).join('');
        } else {
            dom.filesTableBody.innerHTML = `<tr><td colspan="4" class="text-center">Для этого ученика нет договоров.</td></tr>`;
        }
    } catch (error) {
        showAlert(`Ошибка загрузки файлов: ${error.message}`, 'error');
    }
}

/**
 * Делегированный обработчик клика по кнопке "Скачать" в модалке "Файлы ученика".
 */
function handleFilesModalClick(e) {
    const btn = e.target.closest('.download-contract-btn');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.id;
    const number = btn.dataset.number || 'contract';
    if (!id) {
        showAlert('Не удалось определить ID договора для скачивания.', 'warning');
        return;
    }
    downloadContract(id, number);
}

/**
 * Открывает модальное окно для добавления платежа, загружает договоры и формы оплаты.
 * @param {string} studentId - ID ученика.
 * @param {string} contractIdFromButton - ID договора из кнопки, на которую нажали.
 */
async function openAddPaymentModal(studentId, contractIdFromButton) {
    dom.addPaymentForm.reset();
    document.getElementById('paymentStudentId').value = studentId;
    const contractSelect = document.getElementById('paymentContractSelect');
    const paymentFormSelect = document.getElementById('payment_form_id');

    // Сбрасываем и подготавливаем выпадающие списки
    contractSelect.disabled = false;
    contractSelect.innerHTML = '<option value="">Загрузка договоров...</option>';
    paymentFormSelect.innerHTML = '<option value="">Загрузка форм оплаты...</option>';
    
    try {
        // Параллельно загружаем договоры и формы оплаты для ускорения
        const [contracts] = await Promise.all([
            fetchAuthenticated(`/api/students/${studentId}/contracts`),
            populateDropdown(paymentFormSelect, '/api/payment-forms?all=true', 'ID', 'name', null, 'Выберите форму оплаты')
        ]);

        if (!contracts || contracts.length === 0) {
            contractSelect.innerHTML = '<option value="">Договоры не найдены</option>';
            contractSelect.disabled = true;
            openModal(dom.addPaymentModal);
            return;
        }
        
        // Определяем какой договор выбрать по умолчанию
        const defaultContractId = contractIdFromButton || (contracts[0].ID ?? contracts[0].id ?? contracts[0].Id);
        
        // Заполняем список договоров
        await populateDropdown(
            contractSelect,
            `/api/students/${studentId}/contracts`,
            'ID',
            (item) => `${(item.contractNumber ?? item.number)} от ${formatDate(item.CreatedAt || item.createdAt || item.created_at)}`,
            defaultContractId,
            'Выберите договор'
        );

        openModal(dom.addPaymentModal);
    } catch (error) {
        showAlert(`Ошибка загрузки данных для модального окна: ${error.message}`, 'error');
        contractSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        paymentFormSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        contractSelect.disabled = true;
    }
}


/**
 * Открывает модальное окно для создания плана платежей.
 * @param {string} contractId - ID договора.
 */
async function openPlanModal(contractId) {
    currentContractId = contractId;
    dom.planForm.reset();
    dom.planInstallmentsContainer.innerHTML = ''; // Очищаем предыдущий план

    try {
        const contract = await fetchAuthenticated(`/api/contracts/${contractId}`);

        document.getElementById('plan_totalAmount').value = contract.totalAmount.toFixed(2);
        document.getElementById('plan_discountPercentage').value = contract.discountPercentage;
        document.getElementById('plan_discountedAmount').value = contract.discountedAmount.toFixed(2);
        document.getElementById('planContractId').value = contractId;

        await populateDropdown(
            document.getElementById('plan_paymentForm'),
            '/api/payment-forms?all=true', 'ID', 'name', contract.paymentFormId, 'Выберите план'
        );

        // Если форма оплаты уже выбрана, сразу показываем превью плана
        if (contract.paymentFormId) {
            previewPaymentPlan();
        }

        openModal(dom.planModal);
    } catch (error) {
        showAlert(`Ошибка загрузки данных для плана: ${error.message}`, 'error');
    }
}

/**
 * Обрабатывает отправку формы редактирования договора.
 */
async function handleContractFormSubmit(e) {
    e.preventDefault();
    if (!currentContractId) return;

    const studentId = parseInt(dom.contractForm.dataset.studentId, 10);
    if (!studentId) {
        showAlert('Ошибка: ID ученика не найден. Невозможно сохранить договор.', 'error');
        return;
    }

    const formData = new FormData(dom.contractForm);
    const data = {
        studentId: studentId,
        signingMethod: formData.get('signingMethod'),
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        totalAmount: parseFloat(formData.get('totalAmount')),
        discountPercentage: parseFloat(formData.get('discountPercentage')),
    };

    try {
        await fetchAuthenticated(`/api/contracts/${currentContractId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        showAlert('Договор успешно обновлен!', 'success');
        closeModal(dom.contractModal);
        fetchAndRender(1); // Обновляем таблицу
    } catch (error) {
        showAlert(`Ошибка сохранения договора: ${error.message}`, 'error');
    }
}


/**
 * Обрабатывает отправку формы добавления платежа.
 */
async function handleAddPaymentSubmit(e) {
    e.preventDefault();
    const formData = new FormData(dom.addPaymentForm);
    const contractId = formData.get('contractId');
    const paymentFormId = formData.get('payment_form_id'); // Получаем ID формы оплаты

    // Проверяем, что оба обязательных поля выбраны
    if (!contractId || !paymentFormId) {
        showAlert('Пожалуйста, выберите договор и форму оплаты.', 'warning');
        return;
    }

    const data = {
        contractId: parseInt(contractId, 10),
        payment_form_id: parseInt(paymentFormId, 10), // Добавляем в тело запроса
        amount: parseFloat(formData.get('amount')),
        paymentDate: formData.get('paymentDate'),
        comment: formData.get('comment'),
    };

    try {
        // Используем правильный эндпоинт для добавления фактического платежа.
        await fetchAuthenticated('/api/payments/actual', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert('Оплата успешно добавлена!', 'success');
        closeModal(dom.addPaymentModal);
        fetchAndRender(1); // Обновляем список, чтобы увидеть изменения
    } catch (error) {
        showAlert(`Ошибка добавления оплаты: ${error.message}.`, 'error');
    }
}


/**
 * Обрабатывает отправку формы создания плана платежей.
 */
async function handlePlanFormSubmit(e) {
    e.preventDefault();
    const paymentFormId = dom.planForm.elements.paymentFormId.value;
    if (!paymentFormId) {
        showAlert('Пожалуйста, выберите форму оплаты.', 'warning');
        return;
    }

    const confirmed = await showConfirm(
        'Вы уверены, что хотите сгенерировать новый план?',
        'Существующий план платежей для этого договора будет полностью удален и заменен новым.'
    );
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/contracts/${currentContractId}/generate-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentFormId: parseInt(paymentFormId)
            })
        });
        showAlert('План платежей успешно сгенерирован!', 'success');
        closeModal(dom.planModal);
        fetchAndRender(1);
    } catch (error) {
        showAlert(`Ошибка при генерации плана: ${error.message}`, 'error');
    }
}

/**
 * Удаляет договор.
 * @param {string} id - ID договора.
 */
async function handleDeleteContract(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить этот договор?`);
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/contracts/${id}`, {
            method: 'DELETE'
        });
        showAlert('Договор успешно удален.', 'success');
        fetchAndRender(1);
    } catch (error) {
        showAlert(`Ошибка при удалении договора: ${error.message}`, 'error');
    }
}

/**
 * Отправляет договор в TrustMe.
 * @param {string} contractId - ID договора.
 */
async function handleSendToTrustMe(contractId) {
    const confirmed = await showConfirm('Отправить этот договор на подписание через TrustMe?');
    if (!confirmed) return;
    showAlert('Функционал отправки в TrustMe в разработке.', 'info');
}

// --- 4. Вспомогательные функции ---

/**
 * Скачивание PDF договора с авторизацией по Bearer-токену.
 * Работает как из меню действий, так и из модалки «Файлы ученика».
 */
async function downloadContract(contractId, contractNumber = 'contract') {
    try {
        const token = localStorage.getItem('token'); // тот же источник, что использует fetchAuthenticated
        const resp = await fetch(`/api/contracts/${contractId}/download`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });

        if (!resp.ok) {
            // попробуем вытащить сообщение об ошибке
            let msg = `HTTP ${resp.status}`;
            try {
                const j = await resp.json();
                msg = j.error || j.message || msg;
            } catch (_) {}
            throw new Error(msg);
        }

        const blob = await resp.blob();
        // если сервер вернул JSON по ошибке, content-type может быть application/json
        if (blob.type && blob.type.includes('json')) {
            const text = await blob.text();
            throw new Error(text || 'Сервер вернул JSON вместо PDF');
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${contractNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        showAlert(`Не удалось скачать договор: ${err.message}`, 'error');
    }
}

/**
 * Показывает превью плана платежей при выборе формы оплаты.
 */
async function previewPaymentPlan() {
    const paymentFormId = document.getElementById('plan_paymentForm').value;
    dom.planInstallmentsContainer.innerHTML = '';

    if (!paymentFormId) return;

    try {
        const schedule = await fetchAuthenticated(`/api/contracts/${currentContractId}/preview-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paymentFormId: parseInt(paymentFormId)
            })
        });

        if (schedule && schedule.length > 0) {
            let html = '';
            schedule.forEach((payment, index) => {
                html += `
                    <div class="form-row">
                        <div class="form-group">
                            <label>${index + 1}. Дата оплаты по договору</label>
                            <input type="text" class="form-control" value="${payment.paymentDate}" readonly>
                        </div>
                        <div class="form-group">
                            <label>${index + 1}. Сумма оплаты по договору</label>
                            <input type="text" class="form-control" value="${formatCurrency(payment.amount)}" readonly>
                        </div>
                    </div>
                `;
            });
            dom.planInstallmentsContainer.innerHTML = html;
        }
    } catch (error) {
        showAlert(`Не удалось загрузить превью плана: ${error.message}`, 'error');
    }
}

/**
 * Переключает видимость полей для ввода скидки (сумма/процент).
 * @param {'sum' | 'percent'} type - Тип отображаемого поля.
 */
function toggleDiscountInput(type) {
    const sumGroup = document.getElementById('plan_sumDiscountGroup');
    const percentGroup = document.getElementById('plan_percentDiscountGroup');
    const sumBtn = document.getElementById('sumDiscountBtn');
    const percentBtn = document.getElementById('percentDiscountBtn');

    if (type === 'sum') {
        sumGroup.style.display = 'block';
        percentGroup.style.display = 'none';
        sumBtn.classList.add('active');
        percentBtn.classList.remove('active');
    } else {
        sumGroup.style.display = 'none';
        percentGroup.style.display = 'block';
        sumBtn.classList.remove('active');
        percentBtn.classList.add('active');
    }
}

/**
 * Рассчитывает итоговую сумму и процент скидки при вводе суммы скидки.
 */
function calculateDiscountedAmountFromSum() {
    const totalInput = document.getElementById('plan_totalAmount');
    const discountSumInput = document.getElementById('plan_discountAmount');
    const discountPercentInput = document.getElementById('plan_discountPercentage');
    const discountedAmountInput = document.getElementById('plan_discountedAmount');

    const total = parseFloat(totalInput.value) || 0;
    const discountSum = parseFloat(discountSumInput.value) || 0;

    if (total > 0 && discountSum >= 0) {
        const discountedAmount = total - discountSum;
        const discountPercent = (discountSum / total) * 100;

        discountedAmountInput.value = discountedAmount.toFixed(2);
        discountPercentInput.value = discountPercent.toFixed(2);
    } else {
        discountedAmountInput.value = total.toFixed(2);
        discountPercentInput.value = 0;
    }
}

/* ============================
   5) Меню действий «через портал»
   ============================ */

/**
 * Делаем так, чтобы выпадающее меню действий не «обрезалось» контейнерами
 * с overflow. При открытии переносим .action-dropdown-content в <body>
 * и позиционируем относительно кнопки. Добавлены обработчики кликов
 * по пунктам меню (так как делегирование на tbody их не поймает).
 */
function initializeContractsDropdowns() {
    document.querySelectorAll('#contractsTableBody .action-dropdown').forEach(box => {
        const btn  = box.querySelector('.action-button');
        const menu = box.querySelector('.action-dropdown-content');
        if (!btn || !menu) return;

        let opened = false;

        const handleMenuClick = (e) => {
            const link = e.target.closest('a');
            if (!link) return;
            e.preventDefault();
            e.stopPropagation();

            const id         = link.dataset.id;
            const studentId  = link.dataset.studentId;
            const contractId = link.dataset.contractId || id;

            close(); // закрываем перед действием

            if (link.classList.contains('create-contract-btn')) {
                handleCreateContract(studentId);
            } else if (link.classList.contains('edit-contract-btn')) {
                openContractModal(id, false);
            } else if (link.classList.contains('view-contract-btn')) {
                openContractModal(id, true);
            } else if (link.classList.contains('delete-contract-btn')) {
                handleDeleteContract(id);
            } else if (link.classList.contains('files-btn')) {
                openFilesModal(studentId);
            } else if (link.classList.contains('add-payment-btn')) {
                openAddPaymentModal(studentId, contractId);
            } else if (link.classList.contains('plan-btn')) {
                openPlanModal(id);
            } else if (link.classList.contains('send-trustme-btn')) {
                handleSendToTrustMe(id);
            } else if (link.classList.contains('download-contract-btn')) {
                const number = link.dataset.number || 'contract';
                downloadContract(id, number);
            }
        };

        const open = () => {
            if (opened) return;
            opened = true;

            // вычисляем позицию кнопки
            const rect = btn.getBoundingClientRect();

            // размеры/позиционирование и перенос в <body>
            menu.style.position  = 'fixed';
            menu.style.zIndex    = '3000';
            menu.style.width     = 'max-content';
            menu.style.minWidth  = '260px';
            menu.style.maxWidth  = '360px';
            menu.style.maxHeight = '60vh';
            menu.style.overflow  = 'auto';
            menu.style.top       = `${Math.round(rect.bottom + 6)}px`;

            const approx = Math.max(menu.offsetWidth || 260, 260);
            const left = Math.min(rect.left, window.innerWidth - approx - 8);
            menu.style.left = `${Math.max(8, Math.round(left))}px`;

            document.body.appendChild(menu);
            menu.classList.add('open');
            menu.addEventListener('click', handleMenuClick);
        };

        const close = () => {
            if (!opened) return;
            opened = false;

            menu.classList.remove('open');
            menu.removeEventListener('click', handleMenuClick);
            // вернуть меню обратно в ячейку
            box.appendChild(menu);

            // сброс инлайновых стилей
            menu.style.position  = '';
            menu.style.zIndex    = '';
            menu.style.width     = '';
            menu.style.minWidth  = '';
            menu.style.maxWidth  = '';
            menu.style.maxHeight = '';
            menu.style.overflow  = '';
            menu.style.top       = '';
            menu.style.left      = '';
        };

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            opened ? close() : open();
        });

        document.addEventListener('click', (e) => {
            if (opened && !menu.contains(e.target) && !btn.contains(e.target)) close();
        });
        window.addEventListener('resize', () => opened && close());
        window.addEventListener('scroll', () => opened && close(), true);
    });
}

/* ============================================
   6) Связь с «Стоимость обучения» (расчёт суммы)
   ============================================ */

/**
 * Загружает карту цен по годам из /api/tuition-fees в виде:
 * { "2021": 3000000, "2023": 3429500, "2024": 3610000 }
 */
async function loadTuitionFeesMap() {
    const data = await fetchAuthenticated('/api/tuition-fees');
    const map = {};

    // разные возможные форматы
    if (data && typeof data.byYear === 'object') {
        Object.entries(data.byYear).forEach(([y, price]) => map[String(y)] = Number(price));
    }
    if (Array.isArray(data?.prices)) {
        data.prices.forEach(p => {
            const y = String(p.year ?? p.Year);
            const amount = Number(p.amount ?? p.price ?? p.Amount ?? p.Price);
            if (y && !Number.isNaN(amount)) map[y] = amount;
        });
    }
    if (Array.isArray(data)) {
        data.forEach(p => {
            const y = String(p.year ?? p.Year);
            const amount = Number(p.amount ?? p.price ?? p.Amount ?? p.Price);
            if (y && !Number.isNaN(amount)) map[y] = amount;
        });
    }
    return map;
}

function getLatestYear(feesMap) {
    const years = Object.keys(feesMap).map(Number).filter(n => !Number.isNaN(n));
    return years.length ? Math.max(...years) : new Date().getFullYear();
}

function resolveTuitionAmountForStudent(feesMap, admissionYear) {
    const CUTOFF = 2023;
    const latest = getLatestYear(feesMap);
    const yearToUse = (Number(admissionYear) && Number(admissionYear) <= CUTOFF) ? CUTOFF : latest;
    const amount = Number(feesMap[String(yearToUse)]) || 0;
    return { amount, usedYear: yearToUse };
}

/**
 * Комплексная функция: получить год поступления ученика и выбрать сумму.
 */
async function computeTuitionAmountForStudent(studentId) {
    const student = await fetchAuthenticated(`/api/students/${studentId}`);
    const admissionYear = student?.admissionYear;
    const feesMap = await loadTuitionFeesMap();
    if (!Object.keys(feesMap).length) return { amount: 0, usedYear: null };
    return resolveTuitionAmountForStudent(feesMap, admissionYear);
}
