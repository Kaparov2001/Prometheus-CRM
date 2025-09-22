// FILE: static/js/my-invoices.js
import { fetchAuthenticated, showAlert, openModal, closeModal, formatCurrency } from './utils.js';

// --- Структура бюджета (остается для модального окна доработки) ---
const budgetStructure = {
    "Учебная часть": {
        "АДМ": ["Обучение сотрудников", "Подписки/ПО", "Профессиональные услуги (юридич., переваоды, копирайтинг)", "Служебные командировки", "Услуги типографии", "Участие в конференции", "Школьные мероприятия"],
        "Услуги для основного образования": ["Концелярия на школу", "Расходники для учебных классов", "Уроки Робототехники", "ПО Перлем (Москва) для 9 классов", "Обучение по предпринимательству с 7 по 9 классы"],
        "Себестоимость": ["Членство CIS", "Летний Лагерь", "Директорский фонд", "Непредвиденные расходы"]
    },
    "АДМ": {
        "АДМ": ["Административные мероприятия", "Ежегодный аудит", "Профессиональные услуги", "Юридические и нотариальные услуги", "Подписки/ПО/взносы", "Маркетинг (SMM, таргет)", "Служебные командировки", "Снабжение офиса", "Услуги связи", "Канцтовары", "Услуги типографии", "Курьерские услуги", "Вода питьевая", "Непредвиденные расходы"]
    },
    "Отдел Доп. Образования (ДО)": {
        "Расходы дополнительных курсов": ["Партнеры", "ФОТ учителя (ГПХ) (к начислению)", "Налоги ГПХ", "Ассистенты (в руки)", "Налоги Ассистенты", "Корп. Такси", "Расходные материалы", "Бонусы (аренда) (в руки)", "Налоги Бонусы"],
        "Себестоимость": ["Баланс Непредвиденных расходов"],
        "Музотделение": ["Расходные материалы", "ФОТ учителя (ГПХ) (к начислению)", "Налоги ГПХ"]
    },
    "Daryn Go": {
        "Daryn Go": ["Закуп для аукциона", "Реквизит для мероприятий", "Закуп товаров для активности \"магазин\"", "Покупка призов для победителей", "Услуги типографии"],
        "Себестоимость": ["Баланс Непредвиденных расходов"]
    },
    "Библиотека": {
        "Учебные материалы": ["Booky-Wooky", "Библиотечный фонд", "Учебники (основное образование)", "Оформление библиотеки"],
        "Себестоимость": ["Баланс Непредвиденных расходов"]
    },
    "Транспорт": {
        "Транспортные расходы": ["Диз топливо", "Запчасти", "Колодки", "Летняя/Зимняя резина", "Антигель для машин", "Антифриз,стеклоочиститель", "Страхование авто", "Тех.осмотр", "Замена масла", "Замена рекламных наклеек", "Переобувка колес", "Услуги шиномонтажа"]
    },
    "Хоз. Блок": {
        "Клининг": ["Клининг"],
        "Охрана": ["Охрана"],
        "Коммунальные и прочие расходы": ["Коммунальные расходы"],
        "Эксплуатационные расходы": ["Обслуживание аквариума", "Обслуживание лифтов", "Обслуживание пожарной службы", "Обслуживание слаботочных систем", "Обслуживание столовой", "Обслуживание уч.классов", "Обучение сотрудников/Сертификация", "Диагностика/Сервис оборудования", "Расходные материалы", "Инструменты", "Хоз. Инвентарь", "Услуги прачечной", "Уход за растениями", "Сервисное обслуживание СТУ", "Промывка системы отопления"],
        "АДМ": ["Баланс Непредвиденных расходов"]
    },
    "Бухгалтерия": {
        "АДМ": ["Подписки/ПО", "Обучение сотрудников: тренинги", "Прочие налоги"]
    },
    "HR": {
        "АДМ": ["Подписки/ПО", "Страхование сотрудников 2024"]
    },
    "IT": {
        "IT": ["Интернет", "Bitrix24", "WhatsAPP", "Телефония", "Ремонт цветных принтеров", "Ремонт МФУ", "Расходники"]
    },
    "Кап. затраты": {
        "Оснащение": ["Оснащение IT", "Оснащение Школы"],
        "СМР": ["СМР"],
        "Летний ремонт": ["Летний ремонт"],
        "Капитальные затраты": ["Баланс Непредвиденных расходов"]
    }
};

// --- Функция для заполнения выпадающих списков в окне доработки ---
function setupReworkFormDropdowns() {
    const departmentSelect = document.getElementById('rework_department');
    const registerItemSelect = document.getElementById('rework_registerItem');
    const budgetItemInput = document.getElementById('rework_budgetItem');

    if (!departmentSelect || !registerItemSelect || !budgetItemInput) return;

    departmentSelect.innerHTML = '<option value="">-- Выберите --</option>';
    for (const dep of Object.keys(budgetStructure)) {
        const option = document.createElement('option');
        option.value = dep;
        option.textContent = dep;
        departmentSelect.appendChild(option);
    }
    
    const updateRegisterItems = () => {
        const selectedDepartment = departmentSelect.value;
        registerItemSelect.innerHTML = '<option value="">-- Выберите --</option>';
        budgetItemInput.value = '';
        if (selectedDepartment && budgetStructure[selectedDepartment]) {
            const deptItems = budgetStructure[selectedDepartment];
            for (const budgetCat in deptItems) {
                deptItems[budgetCat].forEach(item => {
                    const option = document.createElement('option');
                    option.value = item;
                    option.textContent = item;
                    registerItemSelect.appendChild(option);
                });
            }
        }
        registerItemSelect.innerHTML += '<option value="Не входит в статью бюджетов">Не входит в статью бюджетов</option>';
    };

    const updateBudgetItem = () => {
        const selectedDepartment = departmentSelect.value;
        const selectedRegisterItem = registerItemSelect.value;

        if (selectedRegisterItem === 'Не входит в статью бюджетов') {
            budgetItemInput.value = 'Не входит в статью бюджетов';
            return;
        }

        budgetItemInput.value = '';
        if (selectedDepartment && selectedRegisterItem && budgetStructure[selectedDepartment]) {
            for (const budgetCat in budgetStructure[selectedDepartment]) {
                if (budgetStructure[selectedDepartment][budgetCat].includes(selectedRegisterItem)) {
                    budgetItemInput.value = budgetCat;
                    break;
                }
            }
        }
    };

    departmentSelect.addEventListener('change', () => {
        updateRegisterItems();
        updateBudgetItem();
    });

    registerItemSelect.addEventListener('change', updateBudgetItem);
}

// --- Основная функция инициализации ---
window.initializeMyInvoicesPage = function() {
    const tableBody = document.getElementById('myInvoicesTableBody');
    if (!tableBody) return;

    const sidebar = document.getElementById('details-sidebar');
    const sidebarContent = document.getElementById('sidebar-content-area');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    const reworkModal = document.getElementById('reworkInvoiceModal');
    const reworkForm = document.getElementById('reworkInvoiceForm');
    const closeReworkModalBtn = document.getElementById('closeReworkModalBtn');
    let currentReworkingInvoice = null;

    const closeSidebar = () => {
        if(sidebar) sidebar.classList.remove('open');
        if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    };

    const closeReworkModal = () => {
        if (reworkModal) closeModal(reworkModal);
        currentReworkingInvoice = null;
        if(reworkForm) reworkForm.reset();
    };

    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);
    if (closeReworkModalBtn) closeReworkModalBtn.addEventListener('click', closeReworkModal);
    
    setupReworkFormDropdowns();

    async function loadMyInvoices() {
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center">Загрузка...</td></tr>`;
        try {
            const invoices = await fetchAuthenticated('/api/invoices?type=my');
            
            if (invoices.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" class="text-center">У вас пока нет поданных заявлений.</td></tr>`;
                return;
            }

            tableBody.innerHTML = invoices.map(inv => {
                const statusClass = inv.status.toLowerCase();
                let statusText = inv.status;
                switch(inv.status) {
                    case 'Pending': statusText = 'На утверждении у фин.отдела'; break;
                    case 'Approved': statusText = 'К оплате'; break;
                    case 'Paid': statusText = 'Оплачен'; break;
                    case 'Rejected': statusText = 'Отклонен'; break;
                    case 'Rework': statusText = 'На доработке'; break;
                    case 'Archived': statusText = 'В архиве'; break;
                }

                let closingDocsIcon = '<span style="color: red; font-size: 1.5rem; font-weight: bold;">&times;</span>';
                if (inv.closingDocuments && inv.closingDocuments.length > 0) {
                    closingDocsIcon = '<span style="color: green; font-size: 1.5rem;">&#10004;</span>';
                }
                
                const formattedAmount = formatCurrency(inv.totalAmount);

                return `
                <tr data-id="${inv.ID}">
                    <td data-label="Дата подачи">${new Date(inv.CreatedAt).toLocaleDateString()}</td>
                    <td data-label="Номер счета">${inv.invoiceNumber || 'б/н'}</td>
                    <td data-label="Контрагент">${inv.kontragent || 'N/A'}</td>
                    <td data-label="Сумма">${formattedAmount}</td>
                    <td data-label="Статус"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Закрывающие документы">${closingDocsIcon}</td>
                    <td data-label="Действия">
                        <button class="button-secondary btn-sm view-details-btn" data-id="${inv.ID}">Детали</button>
                    </td>
                </tr>
                `
            }).join('');
        } catch (error) {
            showAlert(`Ошибка загрузки заявлений: ${error.message}`, 'error');
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Ошибка загрузки.</td></tr>`;
        }
    }

    function renderInvoiceDetails(invoice) {
        let statusText = invoice.status;
        switch(invoice.status) {
            case 'Pending': statusText = 'На утверждении у фин.отдела'; break;
            case 'Approved': statusText = 'К оплате'; break;
            case 'Paid': statusText = 'Оплачен'; break;
            case 'Rejected': statusText = 'Отклонен'; break;
            case 'Rework': statusText = 'На доработке'; break;
            case 'Archived': statusText = 'В архиве'; break;
        }

        let actionButton = '';
        if (invoice.status === 'Rework') {
            actionButton = `<button class="button-primary" id="reworkInvoiceBtn" data-invoice-id="${invoice.ID}" style="width: 100%; margin-top: 1rem;"><i class="bi bi-pencil-square"></i> Доработать</button>`;
        }
        
        let existingDocsHtml = '';
        if (invoice.closingDocuments && invoice.closingDocuments.length > 0) {
            const docLinks = invoice.closingDocuments.map(doc => 
                `<li><a href="${doc}" target="_blank">${doc.split('/').pop()}</a></li>`
            ).join('');
            existingDocsHtml = `
                <div class="detail-item">
                    <strong>Приложенные закрывающие документы</strong>
                    <ul class="file-list" style="list-style: none; padding-left: 0;">${docLinks}</ul>
                </div>
            `;
        }
        
        const paymentDateHtml = invoice.paymentDate 
            ? `<div class="detail-item"><strong>Дата оплаты</strong><span>${new Date(invoice.paymentDate).toLocaleDateString()}</span></div>` 
            : '';

        let accountingDocsHtml = '';
        if (invoice.paymentOrderFileUrl || invoice.powerOfAttorneyFileUrl) {
            accountingDocsHtml = `
                <div class="detail-item" style="background-color: #e9f5ff; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                    <strong>Документы от бухгалтерии</strong>
                    <div class="file-links-sidebar" style="margin-top: 0.5rem;">
                        ${invoice.paymentOrderFileUrl ? `<a href="${invoice.paymentOrderFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-receipt"></i> Платежное поручение</a>` : ''}
                        ${invoice.powerOfAttorneyFileUrl ? `<a href="${invoice.powerOfAttorneyFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-person-badge"></i> Доверенность</a>` : ''}
                    </div>
                </div>
            `;
        }

        let uploadFormHtml = '';
        if (invoice.status === 'Paid') {
            uploadFormHtml = `
                <div class="detail-item" style="background-color: #f7f8fc; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                    <strong>Загрузить закрывающие документы</strong>
                    <p style="font-size: 0.8rem; color: #718096;">Прикрепите АВР, накладные и другие подтверждающие документы.</p>
                    <form id="closingDocsForm">
                        <input type="file" name="closingDocuments" multiple required class="form-control" style="margin-top: 0.5rem;">
                        <button type="submit" class="button-primary" style="width: 100%; margin-top: 1rem;">
                            <i class="bi bi-upload"></i> Загрузить
                        </button>
                    </form>
                </div>
            `;
        }
        
        const formattedAmount = formatCurrency(invoice.totalAmount);

        const detailsHtml = `
            <div class="details-grid">
                <div class="detail-item"><strong>Статус</strong><span>${statusText}</span></div>
                ${invoice.rejectionReason ? `<div class="detail-item"><strong>Причина доработки</strong><span>${invoice.rejectionReason}</span></div>` : ''}
                ${paymentDateHtml}
                <div class="detail-item"><strong>Заявитель</strong><span>${invoice.user && invoice.user.fullName ? invoice.user.fullName : 'Неизвестно'}</span></div>
                <div class="detail-item"><strong>Подразделение</strong><span>${invoice.department}</span></div>
                <div class="detail-item"><strong>Контрагент</strong><span>${invoice.kontragent} (БИН: ${invoice.bin})</span></div>
                <div class="detail-item"><strong>Счет</strong><span>№ ${invoice.invoiceNumber || 'б/н'} от ${new Date(invoice.invoiceDate).toLocaleDateString()}</span></div>
                <div class="detail-item"><strong>Сумма</strong><span>${formattedAmount}</span></div>
                <div class="detail-item"><strong>Назначение платежа</strong><span>${invoice.paymentPurpose}</span></div>
                <div class="detail-item">
                    <strong>Приложенные файлы</strong>
                    <div class="file-links-sidebar">
                        <a href="${invoice.invoiceFileUrl}" target="_blank" class="button-secondary btn-sm">Счет на оплату</a>
                        ${invoice.contractFileUrl ? `<a href="${invoice.contractFileUrl}" target="_blank" class="button-secondary btn-sm">Договор</a>` : ''}
                        ${invoice.memoFileUrl ? `<a href="${invoice.memoFileUrl}" target="_blank" class="button-secondary btn-sm">Служебная записка</a>` : ''}
                    </div>
                </div>
                ${existingDocsHtml}
            </div>
            ${accountingDocsHtml} 
            ${actionButton}
            ${uploadFormHtml}
        `;
        sidebarContent.innerHTML = detailsHtml;

        const reworkBtn = document.getElementById('reworkInvoiceBtn');
        if (reworkBtn) {
            reworkBtn.addEventListener('click', () => {
                closeSidebar(); 
                openReworkModal(invoice);
            });
        }
        
        const closingDocsForm = document.getElementById('closingDocsForm');
        if (closingDocsForm) {
            closingDocsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const submitBtn = closingDocsForm.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Загрузка...';

                const formData = new FormData(closingDocsForm);
                try {
                    await fetchAuthenticated(`/api/invoices/${invoice.ID}/upload-closing-docs`, {
                        method: 'POST',
                        body: formData
                    });
                    showAlert('Документы успешно загружены!', 'success');
                    closeSidebar();
                    loadMyInvoices();
                } catch (error) {
                    showAlert(`Ошибка загрузки: ${error.message}`, 'error');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="bi bi-upload"></i> Загрузить';
                }
            });
        }
    }

    function openReworkModal(invoice) {
        currentReworkingInvoice = invoice;
        
        const departmentSelect = reworkForm.querySelector('#rework_department');
        const registerItemSelect = reworkForm.querySelector('#rework_registerItem');
        
        reworkForm.querySelector('#rework_applicant').value = invoice.user.fullName;
        departmentSelect.value = invoice.department;
        
        departmentSelect.dispatchEvent(new Event('change'));
        
        registerItemSelect.value = invoice.registerItem;
        registerItemSelect.dispatchEvent(new Event('change'));

        reworkForm.querySelector('#rework_kontragent').value = invoice.kontragent;
        reworkForm.querySelector('#rework_bin').value = invoice.bin;
        reworkForm.querySelector('#rework_invoiceNumber').value = invoice.invoiceNumber;
        reworkForm.querySelector('#rework_invoiceDate').value = new Date(invoice.invoiceDate).toISOString().split('T')[0];
        reworkForm.querySelector('#rework_totalAmount').value = invoice.totalAmount;
        reworkForm.querySelector('#rework_paymentPurpose').value = invoice.paymentPurpose;

        const existingFilesContainer = document.getElementById('rework_existingFiles');
        existingFilesContainer.innerHTML = `
            <p style="font-weight: 500;">Текущие файлы:</p>
            <ul style="list-style-type: none; padding-left: 0; margin-top: 5px; font-size: 14px;">
                <li style="margin-bottom: 5px;">Счет: <a href="${invoice.invoiceFileUrl}" target="_blank">${invoice.invoiceFileUrl.split('/').pop()}</a></li>
                ${invoice.contractFileUrl ? `<li style="margin-bottom: 5px;">Договор: <a href="${invoice.contractFileUrl}" target="_blank">${invoice.contractFileUrl.split('/').pop()}</a></li>` : ''}
                ${invoice.memoFileUrl ? `<li style="margin-bottom: 5px;">Служ. записка: <a href="${invoice.memoFileUrl}" target="_blank">${invoice.memoFileUrl.split('/').pop()}</a></li>` : ''}
            </ul>
            <p class="text-color-secondary" style="font-size: 12px; margin-top: 10px;">Чтобы заменить файл, просто загрузите новый в соответствующее поле ниже.</p>
        `;
        
        openModal(reworkModal);
    }

    if (reworkForm) {
        reworkForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = reworkForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Отправка...';

            const formData = new FormData(reworkForm);

            try {
                await fetchAuthenticated(`/api/invoices/${currentReworkingInvoice.ID}/resubmit`, {
                    method: 'POST',
                    body: formData
                });
                showAlert('Счет успешно отправлен на повторное согласование!', 'success');
                closeReworkModal();
                loadMyInvoices();
            } catch (error) {
                showAlert(`Ошибка отправки: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Отправить на повторное согласование';
            }
        });
    }

    tableBody.addEventListener('click', async (e) => {
        const detailsBtn = e.target.closest('.view-details-btn');
        if (detailsBtn) {
            e.preventDefault();
            const invoiceId = detailsBtn.dataset.id;
            
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('active');
            sidebarContent.innerHTML = '<div class="loading-spinner"></div>';

            try {
                const invoiceDetails = await fetchAuthenticated(`/api/invoices/${invoiceId}`);
                renderInvoiceDetails(invoiceDetails);
            } catch (error) {
                showAlert(`Не удалось загрузить детали: ${error.message}`, 'error');
                sidebarContent.innerHTML = `<p class="text-danger">Ошибка загрузки деталей.</p>`;
            }
        }
    });

    loadMyInvoices();
};