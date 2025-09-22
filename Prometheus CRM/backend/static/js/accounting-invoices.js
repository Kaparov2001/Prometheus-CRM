// FILE: crm/static/js/accounting-invoices.js

import { fetchAuthenticated, showAlert, showReasonPrompt, formatCurrency } from './utils.js';

window.initializeAccountingInvoicesPage = function() {
    const tableBody = document.getElementById('accountingInvoicesTableBody');
    const downloadBtn = document.getElementById('accountingDownloadExportBtn');
    
    const sidebar = document.getElementById('details-sidebar');
    const sidebarContent = document.getElementById('sidebar-content-area');
    const sidebarTitle = document.getElementById('sidebar-title');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarActionsContainer = document.getElementById('sidebar-actions-container');
    
    let currentInvoiceId = null;

    if (!tableBody || !sidebar) {
        console.error("Критические элементы для страницы бухгалтерии не найдены.");
        return;
    }

    const closeSidebar = () => {
        if(sidebar) sidebar.classList.remove('open');
        if(sidebarOverlay) sidebarOverlay.classList.remove('active');
        currentInvoiceId = null;
        if(sidebarActionsContainer) sidebarActionsContainer.innerHTML = ''; 
    };

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            showAlert('Начинаем формирование архива...', 'info');
            window.location.href = '/api/invoices/archive/download';
        });
    }

    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    async function loadAccountingQueue() {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center"><div class="loading-spinner"></div></td></tr>';
        try {
            const invoices = await fetchAuthenticated('/api/invoices/accounting-queue');
            renderInvoicesTable(invoices);
        } catch (error) {
            showAlert(`Ошибка загрузки счетов: ${error.message}`, 'error');
            tableBody.innerHTML = `<tr><td colspan="8" class="text-danger text-center">Ошибка загрузки данных.</td></tr>`;
        }
    }

    function renderInvoicesTable(invoices) {
        if (!invoices || invoices.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center">Нет счетов, ожидающих оплаты.</td></tr>`;
            return;
        }

        tableBody.innerHTML = invoices.map(invoice => {
            let statusText = 'Ожидает оплаты';
            let statusClass = 'approved';
            if (invoice.status === 'Paid') {
                statusText = 'Оплачен';
                statusClass = 'paid';
            }
            
            const closingDocsText = (invoice.closingDocuments && invoice.closingDocuments.length > 0) ? "Да" : "Нет";
            const applicantName = invoice.user && invoice.user.fullName ? invoice.user.fullName : 'Неизвестно';
            const submissionDate = new Date(invoice.CreatedAt).toLocaleDateString();

            return `
                <tr data-invoice-id="${invoice.ID}">
                    <td data-label="Дата подачи">${submissionDate}</td>
                    <td data-label="Номер счета">${invoice.invoiceNumber || 'б/н'}</td>
                    <td data-label="Контрагент">${invoice.kontragent || '—'}</td>
                    <td data-label="Сумма">${formatCurrency(invoice.totalAmount)}</td>
                    <td data-label="Статус"><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td data-label="Заявитель">${applicantName}</td>
                    <td data-label="Закр. док-ты">${closingDocsText}</td>
                    <td data-label="Действия" class="text-center">
                        <button class="button-secondary btn-sm view-details-btn" data-id="${invoice.ID}">Детали</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Убедитесь, что ваша функция выглядит именно так

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
        
        let statusText = invoice.status === 'Approved' ? 'К оплате' : invoice.status === 'Paid' ? 'Оплачен' : invoice.status;

        // --- БЛОК ДЛЯ ОТОБРАЖЕНИЯ ЗАКРЫВАЮЩИХ ДОКУМЕНТОВ ---
        let closingDocsHtml = '';
        if (invoice.closingDocuments && invoice.closingDocuments.length > 0) {
            const docLinks = invoice.closingDocuments.map(doc => 
                `<li><a href="${doc}" target="_blank">${doc.split('/').pop()}</a></li>`
            ).join('');
            closingDocsHtml = `
                <div class="detail-item">
                    <strong>Загруженные закрывающие документы</strong>
                    <ul class="file-list" style="list-style: none; padding-left: 0; margin-top: 5px;">${docLinks}</ul>
                </div>`;
        }

        // --- БЛОК ДЛЯ ЗАГРУЗКИ ФАЙЛОВ БУХГАЛТЕРИИ (ЕСЛИ СТАТУС "ОПЛАЧЕН") ---
        let accountingUploadsHtml = '';
        if (invoice.status === 'Paid') {
             accountingUploadsHtml = `
                <hr>
                <h4>Документы об оплате</h4>
                <form id="accountingDocsForm">
                    <div class="form-group">
                        <label for="paymentOrderFile">Платежное поручение</label>
                        <input type="file" name="paymentOrderFile" class="form-control">
                        ${invoice.paymentOrderFileUrl ? `<a href="${invoice.paymentOrderFileUrl}" target="_blank" style="color: green; font-size: 12px;">Текущий файл</a>` : ''}
                    </div>
                    <div class="form-group">
                        <label for="powerOfAttorneyFile">Доверенность</label>
                        <input type="file" name="powerOfAttorneyFile" class="form-control">
                        ${invoice.powerOfAttorneyFileUrl ? `<a href="${invoice.powerOfAttorneyFileUrl}" target="_blank" style="color: green; font-size: 12px;">Текущий файл</a>` : ''}
                    </div>
                    <button type="submit" class="button-primary" style="width: 100%;">Сохранить документы</button>
                </form>
             `;
        }

        sidebarContent.innerHTML = `
            <div class="details-grid">
                <div class="detail-item"><strong>Статус</strong><span>${statusText}</span></div>
                <div class="detail-item"><strong>Заявитель</strong><span>${applicantName}</span></div>
                <div class="detail-item"><strong>Подразделение</strong><span>${invoice.department || 'Не указано'}</span></div>
                <div class="detail-item"><strong>Контрагент</strong><span>${invoice.kontragent || 'Не указан'}</span></div>
                <div class="detail-item"><strong>Сумма</strong><span>${formatCurrency(invoice.totalAmount)}</span></div>
                <div class="detail-item"><strong>Приложенные файлы</strong>
                    <div class="file-links-sidebar">
                        <a href="${invoice.invoiceFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-file-earmark-pdf-fill"></i> Счет на оплату</a>
                        ${invoice.contractFileUrl ? `<a href="${invoice.contractFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-file-text-fill"></i> Договор</a>` : ''}
                        ${invoice.memoFileUrl ? `<a href="${invoice.memoFileUrl}" target="_blank" class="button-secondary btn-sm"><i class="bi bi-journal-text"></i> Служебная записка</a>` : ''}
                    </div>
                </div>
                ${closingDocsHtml}
            </div>
            ${accountingUploadsHtml}
        `;

        if(invoice.status === 'Approved') {
            sidebarActionsContainer.innerHTML = `
                <button class="button-secondary" id="reworkBtn"><i class="bi bi-arrow-counterclockwise"></i> На доработку</button>
                <button class="button-primary" id="markPaidBtn"><i class="bi bi-check-circle-fill"></i> Отметить как оплаченный</button>
            `;
        }

    } catch (error) {
        showAlert(`Не удалось загрузить детали: ${error.message}`, 'error');
        sidebarContent.innerHTML = `<div class="text-danger">Ошибка загрузки деталей.</div>`;
    }
    }

    // --- ОБРАБОТЧИК ДЛЯ НОВОЙ ФОРМЫ ЗАГРУЗКИ ---
    sidebarContent.addEventListener('submit', async (e) => {
        if (e.target.id === 'accountingDocsForm') {
            e.preventDefault();
            if (!currentInvoiceId) return;

            const form = e.target;
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Сохранение...';

            const formData = new FormData(form);
            try {
                await fetchAuthenticated(`/api/invoices/${currentInvoiceId}/upload-accounting-docs`, {
                    method: 'POST',
                    body: formData
                });
                showAlert('Документы бухгалтерии успешно сохранены!', 'success');
                // Перезагружаем детали, чтобы увидеть ссылки на новые файлы
                showInvoiceDetails(currentInvoiceId);
            } catch (error) {
                 showAlert(`Ошибка сохранения документов: ${error.message}`, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Сохранить документы';
            }
        }
    });

    sidebarActionsContainer.addEventListener('click', async (e) => {
        if (!currentInvoiceId) return;
        const target = e.target.closest('button');
        if (!target) return;
    
        if (target.id === 'markPaidBtn') {
            target.disabled = true;
            target.textContent = 'Обработка...';
            try {
                await fetchAuthenticated(`/api/invoices/${currentInvoiceId}/mark-paid`, { method: 'POST' });
                showAlert('Счет успешно отмечен как оплаченный!', 'success');
                // Не закрываем сайдбар, а перезагружаем его содержимое
                showInvoiceDetails(currentInvoiceId); 
                loadAccountingQueue(); // Обновляем основную таблицу
            } catch (error) {
                showAlert(`Ошибка: ${error.message}`, 'error');
                target.disabled = false;
                target.innerHTML = '<i class="bi bi-check-circle-fill"></i> Отметить как оплаченный';
            }
        }

        if (target.id === 'reworkBtn') {
            const reason = await showReasonPrompt("Причина отправки на доработку", "Укажите, что необходимо исправить...");
            if (reason) {
                try {
                    await fetchAuthenticated(`/api/invoices/${currentInvoiceId}/accounting-rework`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ rejectionReason: reason })
                    });
                    showAlert('Счет отправлен на доработку.', 'success');
                    closeSidebar();
                    loadAccountingQueue();
                } catch (error) {
                    showAlert(`Ошибка: ${error.message}`, 'error');
                }
            }
        }
    });

    tableBody.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.view-details-btn');
        if (detailsBtn) {
            const id = detailsBtn.dataset.id;
            showInvoiceDetails(id);
        }
    });

    loadAccountingQueue();
};