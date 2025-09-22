import { fetchAuthenticated, showAlert, openModal, closeModal, renderPagination, formatCurrency, formatDate, initializeActionDropdowns } from './utils.js';

// Глобальные переменные DOM
const dom = {};

window.initializePaymentReconciliationPage = function() {
    Object.assign(dom, {
        tableBody: document.getElementById('debtorsTableBody'),
        paginationContainer: document.getElementById('paginationContainer'),
        sendWhatsappBtn: document.getElementById('sendWhatsappBtn'),
        exportExcelBtn: document.getElementById('exportExcelBtn'),
        commentModal: document.getElementById('commentModal'),
        commentForm: document.getElementById('commentForm'),
        closeCommentModalBtn: document.getElementById('closeCommentModalBtn'),
        cancelCommentBtn: document.getElementById('cancelCommentBtn'),
        commentText: document.getElementById('commentText'),
        charCounter: document.getElementById('charCounter'),
        commentContractId: document.getElementById('commentContractId'),
    });

    bindEventListeners();
    fetchAndRenderDebtors(1);
};

function bindEventListeners() {
    dom.sendWhatsappBtn.addEventListener('click', () => {
        showAlert('Функция рассылки в WhatsApp находится в разработке.', 'info');
    });

    dom.exportExcelBtn.addEventListener('click', () => {
        showAlert('Функция экспорта в Excel находится в разработке.', 'info');
    });
    
    dom.tableBody.addEventListener('click', handleTableClick);
    
    if (dom.commentModal) {
        dom.closeCommentModalBtn.addEventListener('click', () => closeModal(dom.commentModal));
        dom.cancelCommentBtn.addEventListener('click', () => closeModal(dom.commentModal));
        dom.commentForm.addEventListener('submit', handleCommentSubmit);
    }
    
    if (dom.commentText) {
        dom.commentText.addEventListener('input', () => {
            const count = dom.commentText.value.length;
            dom.charCounter.textContent = `${count}/100`;
        });
    }
}

async function fetchAndRenderDebtors(page = 1) {
    dom.tableBody.innerHTML = `<tr><td colspan="7" class="text-center">Загрузка...</td></tr>`;
    try {
        const response = await fetchAuthenticated(`/api/payment-reconciliation/debtors?page=${page}`);
        renderTable(response.data || []);
        renderPagination(dom.paginationContainer, response.currentPage, response.totalPages, fetchAndRenderDebtors);
    } catch (error) {
        showAlert(`Ошибка загрузки данных: ${error.message}`, 'error');
        dom.tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Не удалось загрузить список должников.</td></tr>`;
    }
}

function renderTable(debtors) {
    if (debtors.length === 0) {
        dom.tableBody.innerHTML = `<tr><td colspan="7" class="text-center">Должники не найдены.</td></tr>`;
        return;
    }

    dom.tableBody.innerHTML = debtors.map(debtor => `
        <tr class="debtor-row" data-contract-id="${debtor.contractId}">
            <td class="details-col">
                <button class="details-toggle-btn"><i class="bi bi-plus-circle"></i></button>
            </td>
            <td data-label="Действия">
                <div class="action-dropdown">
                    <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                    <div class="action-dropdown-content">
                        <a href="#" class="placeholder-action"><i class="bi bi-telephone"></i> Позвонить</a>
                        <a href="#" class="placeholder-action"><i class="bi bi-clock-history"></i> История звонков</a>
                        <a href="#" class="placeholder-action"><i class="bi bi-chat-left-text"></i> Написать</a>
                        <a href="#" class="add-comment-btn"><i class="bi bi-card-text"></i> Добавить комментарий</a>
                    </div>
                </div>
            </td>
            <td data-label="Номер договора">${debtor.contractNumber}</td>
            <td data-label="Фамилия ребенка">${debtor.studentFullName}</td>
            <td data-label="Класс или группа">${debtor.studentClass}</td>
            <td data-label="Разница" class="debt-amount">${formatCurrency(debtor.debtAmount)}</td>
            <td data-label="Комментарий" class="comment-cell">${debtor.comment || ''}</td>
        </tr>
        <tr class="details-row" style="display: none;">
            <td colspan="7">
                <div class="details-content">
                    <p>Загрузка деталей...</p>
                </div>
            </td>
        </tr>
    `).join('');

    initializeActionDropdowns();
}

function handleTableClick(e) {
    const target = e.target;

    if (target.closest('.details-toggle-btn')) {
        toggleDebtDetails(target.closest('.debtor-row'));
    } else if (target.closest('.placeholder-action')) {
        e.preventDefault();
        showAlert('Этот функционал находится в разработке.', 'info');
    } else if (target.closest('.add-comment-btn')) {
        e.preventDefault();
        openCommentModal(target.closest('.debtor-row'));
    }
}

// --- НАЧАЛО ОБНОВЛЕННОГО БЛОКА ---
async function toggleDebtDetails(row) {
    const detailsRow = row.nextElementSibling;
    const icon = row.querySelector('.details-toggle-btn i');
    const contractId = row.dataset.contractId;
    const contentCell = detailsRow.querySelector('.details-content');

    const isOpening = detailsRow.style.display === 'none';

    if (!isOpening) {
        detailsRow.style.display = 'none';
        icon.classList.replace('bi-dash-circle', 'bi-plus-circle');
        return;
    }

    detailsRow.style.display = 'table-row';
    icon.classList.replace('bi-plus-circle', 'bi-dash-circle');
    contentCell.innerHTML = '<p>Загрузка деталей...</p>';

    try {
        // 1. Параллельно запрашиваем плановые и фактические платежи
        const [plannedResponse, actualResponse] = await Promise.all([
            fetchAuthenticated(`/api/planned-payments/?contract_id=${contractId}&all=true`),
            fetchAuthenticated(`/api/payment-facts?contract_id=${contractId}&all=true`)
        ]);

        const plannedPaymentsRaw = (plannedResponse && Array.isArray(plannedResponse.data)) ? plannedResponse.data : [];
        const actualPayments = (actualResponse && Array.isArray(actualResponse.data)) ? actualResponse.data : [];

        if (plannedPaymentsRaw.length === 0) {
            contentCell.innerHTML = '<p>План оплат для этого договора не найден.</p>';
            return;
        }
        
        // 2. Сортируем плановые платежи по дате, чтобы погашать их в правильном порядке
        plannedPaymentsRaw.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

        // 3. Считаем общую сумму всех фактических оплат
        let totalPaid = 0;
        if (actualPayments && actualPayments.length > 0) {
            totalPaid = actualPayments.reduce((sum, payment) => {
                const amount = parseFloat(payment.Amount);
                return sum + (isNaN(amount) ? 0 : amount);
            }, 0);
        }

        // 4. ЛОГИКА: Распределяем оплаченную сумму по траншам
        const detailedPayments = plannedPaymentsRaw.map(plan => {
            const plannedAmount = Number(plan.plannedAmount) || 0; 
            let paidForThisInstallment = 0;

            // Распределяем оплату, только если есть что распределять и есть что оплачивать
            if (totalPaid > 0 && plannedAmount > 0) {
                if (totalPaid >= plannedAmount) {
                    // Если остатка оплат хватает на весь транш
                    paidForThisInstallment = plannedAmount;
                } else {
                    // Если остатка оплат хватает только на часть транша
                    paidForThisInstallment = totalPaid;
                }
                // Уменьшаем общую сумму оплат на распределенную часть
                totalPaid -= paidForThisInstallment;
            }
            
            const remaining = plannedAmount - paidForThisInstallment;

            return {
                ...plan,
                plannedAmount: plannedAmount,
                paidAmount: paidForThisInstallment,
                remainingAmount: remaining,
                // Транш считается оплаченным, если была плановая сумма и она полностью погашена
                isPaid: plannedAmount > 0 && remaining <= 0.01, 
            };
        });
        
        // 5. Рендерим детализированную таблицу
        contentCell.innerHTML = `
            <h5>Детализация долга по траншам:</h5>
            <table class="nested-table">
                <thead>
                    <tr>
                        <th>Наименование</th>
                        <th>Плановая дата</th>
                        <th>План</th>
                        <th>Оплачено</th>
                        <th>Остаток</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedPayments.map(p => `
                        <tr class="${p.isPaid ? 'paid' : ''}">
                            <td>${p.paymentName}</td>
                            <td>${formatDate(p.paymentDate)}</td>
                            <td>${formatCurrency(p.plannedAmount)}</td>
                            <td>${formatCurrency(p.paidAmount)}</td>
                            <td class="${p.remainingAmount > 0 ? 'debt-amount' : ''}">${formatCurrency(p.remainingAmount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error("Ошибка при загрузке деталей долга:", error);
        contentCell.innerHTML = '<p class="text-danger">Не удалось загрузить детали. Проверьте консоль разработчика (F12).</p>';
    }
}
// --- КОНЕЦ ОБНОВЛЕННОГО БЛОКА ---


function openCommentModal(row) {
    const contractId = row.dataset.contractId;
    const currentComment = row.querySelector('.comment-cell').textContent;
    
    dom.commentContractId.value = contractId;
    dom.commentText.value = currentComment;
    dom.charCounter.textContent = `${currentComment.length}/100`;
    
    openModal(dom.commentModal);
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    const contractId = dom.commentContractId.value;
    const comment = dom.commentText.value;

    try {
        await fetchAuthenticated(`/api/contracts/${contractId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: comment })
        });
        
        showAlert('Комментарий успешно сохранен!', 'success');
        
        const row = dom.tableBody.querySelector(`tr[data-contract-id="${contractId}"]`);
        if (row) {
            row.querySelector('.comment-cell').textContent = comment;
        }
        
        closeModal(dom.commentModal);
    } catch (error) {
        showAlert(`Ошибка сохранения комментария: ${error.message}`, 'error');
    }
}