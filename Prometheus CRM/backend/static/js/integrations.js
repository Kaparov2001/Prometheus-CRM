// crm/static/js/integrations.js
import { fetchAuthenticated, showAlert, populateDropdown } from './utils.js';

window.initializeIntegrationsPage = function() {
    const form = document.getElementById('trustmeSettingsForm');
    
    // Загрузка начальных данных
    loadTrustMeSettings();
    loadContractsForSigning();
    loadSentDocuments();

    // Обработчик сохранения формы
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const settings = {
            url: form.elements.url.value,
            orgName: form.elements.orgName.value,
            token: form.elements.token.value,
            webhookUrl: form.elements.webhookUrl.value,
            signerNumber: form.elements.signerNumber.value
        };
        const payload = {
            isEnabled: form.elements.isEnabled.checked,
            settings: settings
        };

        try {
            await fetchAuthenticated('/api/integrations/trustme/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            showAlert('Настройки TrustMe сохранены!', 'success');
        } catch (error) {
            showAlert(`Ошибка сохранения: ${error.message}`, 'error');
        }
    });

    // Обработчик для кнопки "Отправить"
    document.getElementById('sendToTrustMeBtn').addEventListener('click', async () => {
         showAlert('Функционал отправки находится в разработке.', 'info');
         // Здесь будет логика отправки
    });
};

// Загрузка и отображение настроек
async function loadTrustMeSettings() {
    try {
        const data = await fetchAuthenticated('/api/integrations/trustme/settings');
        if (data && data.settings) {
            const form = document.getElementById('trustmeSettingsForm');
            form.elements.isEnabled.checked = data.isEnabled || false;
            form.elements.url.value = data.settings.url || '';
            form.elements.orgName.value = data.settings.orgName || '';
            form.elements.token.value = data.settings.token || '';
            form.elements.webhookUrl.value = data.settings.webhookUrl || '';
            form.elements.signerNumber.value = data.settings.signerNumber || '';
        }
    } catch (error) {
        showAlert('Не удалось загрузить настройки TrustMe.', 'error');
    }
}

// Загрузка договоров для отправки
async function loadContractsForSigning() {
    const select = document.getElementById('trustme_contract_select');
    await populateDropdown(
        select,
        '/api/integrations/trustme/contracts-to-sign',
        'ID', // значение option
        (item) => `${item.contractNumber} - ${item.student.lastName} ${item.student.firstName}`, // текст option
        null,
        'Выберите договор'
    );
}

// Загрузка уже отправленных документов
async function loadSentDocuments() {
    const tableBody = document.getElementById('trustmeDocumentsTable');
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Загрузка...</td></tr>`;
    try {
        const documents = await fetchAuthenticated('/api/integrations/trustme/documents');
        if (documents.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" class="text-center">Отправленные документы не найдены.</td></tr>`;
            return;
        }

        tableBody.innerHTML = documents.map(doc => `
            <tr>
                <td>${doc.contract.contractNumber}</td>
                <td><span class="status-badge active">${doc.status}</span></td>
                <td>${doc.externalDocumentId}</td>
                <td>${new Date(doc.CreatedAt).toLocaleDateString()}</td>
                <td class="text-center">
                    <button class="button-secondary btn-sm">Статус</button>
                    <button class="button-secondary btn-sm">Скачать</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">Ошибка загрузки.</td></tr>`;
    }
}