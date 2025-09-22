// FILE: static/js/finance-invoices.js

import { fetchAuthenticated, showAlert, showReasonPrompt, formatCurrency } from './utils.js';

window.initializeFinanceInvoicesPage = function() {
    const container = document.getElementById('finance-invoice-list');
    const invoiceCountElement = document.getElementById('invoice-count');
    if (!container || !invoiceCountElement) {
        console.error("Critical elements for finance page not found.");
        return;
    }
    
    const showAllInvoicesBtn = document.getElementById('showAllInvoicesBtn');
    if (showAllInvoicesBtn) {
        showAllInvoicesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.loadAllInvoicesPage();
        });
    }

    const headerArchiveBtn = document.getElementById('headerDownloadArchiveBtn');
    if (headerArchiveBtn) {
        headerArchiveBtn.addEventListener('click', () => {
            showAlert('Начинаем формировать архив. Это может занять некоторое время...', 'info');
            window.location.href = '/api/invoices/archive/download';
        });
    }

    const sidebar = document.getElementById('details-sidebar');
    const sidebarContent = document.getElementById('sidebar-content-area');
    const sidebarTitle = document.getElementById('sidebar-title');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarActionsContainer = document.getElementById('sidebar-actions-container');

    let currentInvoiceId = null;

    const closeSidebar = () => {
        if(sidebar) sidebar.classList.remove('open');
        if(sidebarOverlay) sidebarOverlay.classList.remove('active');
        currentInvoiceId = null;
        if(sidebarActionsContainer) sidebarActionsContainer.innerHTML = '';
    };

    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    async function loadFinanceInvoices() {
        container.innerHTML = `<div class="loading-spinner" style="grid-column: 1 / -1;"></div>`;
        try {
            const invoices = await fetchAuthenticated('/api/invoices/finance-queue');
            invoiceCountElement.textContent = `${invoices.length} на согласовании`;

            if (!invoices || invoices.length === 0) {
                container.innerHTML = `<div class="text-center" style="grid-column: 1 / -1;"><p>Нет счетов на согласовании.</p></div>`;
                return;
            }

            container.innerHTML = invoices.map(inv => {
                const statusClass = `status-${inv.status.toLowerCase()}`;
                const applicantName = inv.user && inv.user.fullName ? inv.user.fullName : 'Неизвестно';
                const formattedAmount = formatCurrency(inv.totalAmount);

                return `
                    <div class="invoice-card ${statusClass}" data-id="${inv.ID}" title="Нажмите, чтобы просмотреть детали">
                        <h4>Счет №${inv.invoiceNumber || 'б/н'}</h4>
                        <p class="invoice-date">${new Date(inv.invoiceDate).toLocaleDateString()}</p>
                        <p><strong>Заявитель:</strong> ${applicantName}</p>
                        <p class="invoice-amount">${formattedAmount}</p>
                    </div>
                `;
            }).join('');
        } catch (error) {
            showAlert(`Ошибка загрузки счетов: ${error.message}`, 'error');
            container.innerHTML = `<p class="text-danger text-center" style="grid-column: 1 / -1;">Ошибка загрузки счетов.</p>`;
        }
    }

    async function showInvoiceDetails(invoiceId) {
        currentInvoiceId = invoiceId;
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        sidebarContent.innerHTML = '<div class="loading-spinner"></div>';
        sidebarTitle.textContent = `Загрузка...`;
        sidebarActionsContainer.innerHTML = '';

        try {
            const invoice = await fetchAuthenticated(`/api/invoices/${invoiceId}`);
            sidebarTitle.textContent = `Счет №${invoice.invoiceNumber || 'б/н'}`;
            const applicantName = invoice.user && invoice.user.fullName ? invoice.user.fullName : 'Неизвестно';
            const formattedAmount = formatCurrency(invoice.totalAmount);

            const detailsHtml = `
                <div class="details-grid">
                    <div class="detail-item"><strong>Статус</strong><span>На утверждении у фин.отдела</span></div>
                    <div class="detail-item"><strong>Заявитель</strong><span>${applicantName}</span></div>
                    <div class="detail-item"><strong>Подразделение</strong><span>${invoice.department || 'Не указано'}</span></div>
                    <div class="detail-item"><strong>Статья бюджета</strong><span>${invoice.budgetItem || 'Не указана'}</span></div>
                    <div class="detail-item"><strong>Статья в реестре</strong><span>${invoice.registerItem || 'Не указана'}</span></div>
                    <div class="detail-item"><strong>Контрагент</strong><span>${invoice.kontragent || 'Не указан'} (БИН: ${invoice.bin || 'Не указан'})</span></div>
                    <div class="detail-item"><strong>Сумма</strong><span>${formattedAmount}</span></div>
                    <div class="detail-item"><strong>Назначение платежа</strong><span>${invoice.paymentPurpose || 'Не указано'}</span></div>
                    <div class="detail-item"><strong>Приложенные файлы</strong>
                        <div class="file-links-sidebar">
                            <a href="${invoice.invoiceFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-file-earmark-pdf-fill"></i> Счет на оплату</a>
                            ${invoice.contractFileUrl ? `<a href="${invoice.contractFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-file-text-fill"></i> Договор</a>` : ''}
                            ${invoice.memoFileUrl ? `<a href="${invoice.memoFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-journal-text"></i> Служебная записка</a>` : ''}
                        </div>
                    </div>
                    <div class="detail-item"><strong>Проверка баланса</strong>
                        <div class="balance-checker" style="margin-top: 10px;">
                             <div class="form-group"><label for="balance_budget_${invoice.ID}">Остаток по статье бюджета:</label><input type="text" id="balance_budget_${invoice.ID}" class="form-control form-control-sm" readonly></div>
                             <div class="form-group"><label for="balance_register_${invoice.ID}">Остаток по статье в реестре:</label><input type="text" id="balance_register_${invoice.ID}" class="form-control form-control-sm" readonly></div>
                             <button class="button-secondary btn-sm balance-btn" data-id="${invoice.ID}"><i class="bi bi-wallet2"></i> Показать баланс</button>
                        </div>
                    </div>
                </div>`;
            sidebarContent.innerHTML = detailsHtml;

            sidebarActionsContainer.innerHTML = `
                <button class="button-secondary" id="reworkActionBtn"><i class="bi bi-arrow-counterclockwise"></i> На доработку</button>
                <button class="button-danger" id="rejectActionBtn"><i class="bi bi-x-octagon-fill"></i> Отклонить</button>
                <button class="button-primary" id="approveActionBtn"><i class="bi bi-check-circle-fill"></i> Согласовать</button>
            `;
        } catch (error) {
            showAlert(`Не удалось загрузить детали: ${error.message}`, 'error');
            sidebarContent.innerHTML = `<div class="text-danger">Ошибка загрузки деталей.</div>`;
        }
    }

    sidebarActionsContainer.addEventListener('click', async (e) => {
        if (!currentInvoiceId) return;
        const target = e.target.closest('button');
        if (!target) return;
    
        if (target.id === 'approveActionBtn') {
            handleInvoiceDecision(currentInvoiceId, 'approve');
        } else if (target.id === 'reworkActionBtn') {
            const reason = await showReasonPrompt('Причина отправки на доработку', 'Укажите, что именно нужно исправить...');
            if (reason) {
                handleInvoiceDecision(currentInvoiceId, 'rework', { rejectionReason: reason });
            }
        } else if (target.id === 'rejectActionBtn') {
            const reason = await showReasonPrompt('Причина отклонения', 'Опишите причину, по которой счет отклонен...');
            if (reason) {
                handleInvoiceDecision(currentInvoiceId, 'reject', { rejectionReason: reason });
            }
        }
    });

    async function handleInvoiceDecision(invoiceId, decision, payload = {}) {
        try {
            await fetchAuthenticated(`/api/invoices/${invoiceId}/decide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ decision, ...payload })
            });
            showAlert(`Счет №${invoiceId} успешно обработан.`, 'success');
            document.querySelector(`.invoice-card[data-id="${invoiceId}"]`)?.remove();
            closeSidebar();
            loadFinanceInvoices();
        } catch (error) {
            showAlert(`Ошибка обработки счета: ${error.message}`, 'error');
        }
    }

    container.addEventListener('click', (e) => {
        const card = e.target.closest('.invoice-card');
        if (card) {
            const id = card.dataset.id;
            showInvoiceDetails(id);
        }
    });

    sidebarContent.addEventListener('click', async (e) => {
        const balanceBtn = e.target.closest('.balance-btn');
        if (balanceBtn && currentInvoiceId) {
            const id = balanceBtn.dataset.id;
            const budgetInput = document.getElementById(`balance_budget_${id}`);
            const registerInput = document.getElementById(`balance_register_${id}`);
            if(!budgetInput || !registerInput) return;

            budgetInput.value = "Загрузка...";
            registerInput.value = "Загрузка...";
            try {
                const data = await fetchAuthenticated(`/api/invoices/${id}/balance`);
                budgetInput.value = data.budgetBalance;
                registerInput.value = data.registerBalance;
            } catch (error) {
                showAlert(`Ошибка получения баланса: ${error.message}`, 'error');
                budgetInput.value = "Ошибка";
                registerInput.value = "Ошибка";
            }
        }
    });

    loadFinanceInvoices();
};