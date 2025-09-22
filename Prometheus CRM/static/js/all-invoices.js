// FILE: static/js/all-invoices.js
import { fetchAuthenticated, renderPagination, formatCurrency } from './utils.js';

window.initializeAllInvoicesPage = function() {
    const tableBody = document.getElementById('allInvoicesTableBody');
    const paginationContainer = document.getElementById('paginationContainer');
    const sidebar = document.getElementById('details-sidebar');
    const sidebarContent = document.getElementById('sidebar-content-area');
    const sidebarTitle = document.getElementById('sidebar-title');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (!tableBody || !paginationContainer || !sidebar) {
        console.error("Critical elements for all-invoices page not found.");
        return;
    }
    
    const closeSidebar = () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
    };
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    async function showInvoiceDetails(invoiceId) {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
        sidebarContent.innerHTML = '<div class="loading-spinner"></div>';
        sidebarTitle.textContent = `Загрузка...`;

        try {
            const invoice = await fetchAuthenticated(`/api/invoices/${invoiceId}`);
            sidebarTitle.textContent = `Счет №${invoice.invoiceNumber || 'б/н'}`;

            let statusText = invoice.status;
             switch(invoice.status) {
                case 'Pending': statusText = 'На утверждении'; break;
                case 'Approved': statusText = 'К оплате'; break;
                case 'Paid': statusText = 'Оплачен'; break;
                case 'Rejected': statusText = 'Отклонен'; break;
                case 'Rework': statusText = 'На доработке'; break;
                case 'Archived': statusText = 'В архиве'; break;
            }

            let closingDocsHtml = '<div class="detail-item"><strong>Закрывающие документы</strong><span>Нет</span></div>';
            if (invoice.closingDocuments && invoice.closingDocuments.length > 0) {
                const docLinks = invoice.closingDocuments.map(doc => 
                    `<li><a href="${doc}" target="_blank">${doc.split('/').pop()}</a></li>`
                ).join('');
                closingDocsHtml = `
                    <div class="detail-item">
                        <strong>Закрывающие документы</strong>
                        <ul class="file-list" style="list-style: none; padding-left: 0;">${docLinks}</ul>
                    </div>`;
            }

            sidebarContent.innerHTML = `
                <div class="details-grid">
                    <div class="detail-item"><strong>Статус</strong><span>${statusText}</span></div>
                    ${invoice.rejectionReason ? `<div class="detail-item"><strong>Причина доработки/отклонения</strong><span>${invoice.rejectionReason}</span></div>` : ''}
                    <div class="detail-item"><strong>Заявитель</strong><span>${invoice.user.fullName}</span></div>
                    <div class="detail-item"><strong>Подразделение</strong><span>${invoice.department}</span></div>
                    <div class="detail-item"><strong>Контрагент</strong><span>${invoice.kontragent} (БИН: ${invoice.bin})</span></div>
                    <div class="detail-item"><strong>Сумма</strong><span>${formatCurrency(invoice.totalAmount)}</span></div>
                    <div class="detail-item"><strong>Назначение платежа</strong><span>${invoice.paymentPurpose}</span></div>
                    <div class="detail-item">
                        <strong>Основные файлы</strong>
                        <div class="file-links-sidebar">
                            <a href="${invoice.invoiceFileUrl}" target="_blank" class="button-secondary btn-sm">Счет на оплату</a>
                            ${invoice.contractFileUrl ? `<a href="${invoice.contractFileUrl}" target="_blank" class="button-secondary btn-sm">Договор</a>` : ''}
                            ${invoice.memoFileUrl ? `<a href="${invoice.memoFileUrl}" target="_blank" class="button-secondary btn-sm">Служебная записка</a>` : ''}
                        </div>
                    </div>
                    ${closingDocsHtml}
                </div>
            `;
        } catch (error) {
            sidebarContent.innerHTML = `<div class="text-danger">Ошибка загрузки деталей: ${error.message}</div>`;
        }
    }

    tableBody.addEventListener('click', (e) => {
        const detailsBtn = e.target.closest('.view-details-btn');
        if (detailsBtn) {
            e.preventDefault();
            const id = detailsBtn.dataset.id;
            showInvoiceDetails(id);
        }
    });

    async function fetchAndRenderAllInvoices(page = 1) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center">Загрузка...</td></tr>`;
        try {
            const response = await fetchAuthenticated(`/api/invoices/all?page=${page}`);
            const invoices = response.data;

            if (invoices && invoices.length > 0) {
                tableBody.innerHTML = invoices.map(inv => {
                    const statusClass = inv.status.toLowerCase();
                    let statusText = inv.status;
                    switch(inv.status) {
                        case 'Pending': statusText = 'На утверждении'; break;
                        case 'Approved': statusText = 'К оплате'; break;
                        case 'Paid': statusText = 'Оплачен'; break;
                        case 'Rejected': statusText = 'Отклонен'; break;
                        case 'Rework': statusText = 'На доработке'; break;
                        case 'Archived': statusText = 'В архиве'; break;
                    }
                    const applicantName = inv.user && inv.user.fullName ? inv.user.fullName : 'Неизвестно';
                    const paymentDate = inv.paymentDate ? new Date(inv.paymentDate).toLocaleDateString() : '—'; // ИЗМЕНЕНИЕ

                    let closingDocsHtml = '<span style="color: grey;">Нет</span>';
                    if (inv.closingDocuments && inv.closingDocuments.length > 0) {
                        const firstDocPath = inv.closingDocuments[0];
                        const fileName = firstDocPath ? firstDocPath.split('/').pop() : 'файл';
                        const shortFileName = fileName.length > 15 ? fileName.substring(0, 15) + '...' : fileName;
                        
                        let link = `<a href="${firstDocPath}" target="_blank">${shortFileName}</a>`;
                        if (inv.closingDocuments.length > 1) {
                            link += ` (+${inv.closingDocuments.length - 1})`;
                        }
                        closingDocsHtml = link;
                    }

                    return `
                        <tr data-id="${inv.ID}">
                            <td data-label="Дата подачи">${new Date(inv.CreatedAt).toLocaleDateString()}</td>
                            <td data-label="Номер счета">${inv.invoiceNumber || 'б/н'}</td>
                            <td data-label="Контрагент">${inv.kontragent || 'N/A'}</td>
                            <td data-label="Сумма">${formatCurrency(inv.totalAmount)}</td>
                            <td data-label="Статус"><span class="status-badge ${statusClass}">${statusText}</span></td>
                            <td data-label="Заявитель">${applicantName}</td>
                            <td data-label="Дата оплаты">${paymentDate}</td> <td data-label="Закр. док-ты">${closingDocsHtml}</td>
                            <td data-label="Действия">
                                <button class="button-secondary btn-sm view-details-btn" data-id="${inv.ID}">Детали</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tableBody.innerHTML = `<tr><td colspan="9" class="text-center">Заявлений не найдено.</td></tr>`;
            }
            renderPagination(paginationContainer, response.currentPage, response.totalPages, fetchAndRenderAllInvoices);

        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Ошибка загрузки заявлений.</td></tr>`;
        }
    }

    fetchAndRenderAllInvoices(1);
};
