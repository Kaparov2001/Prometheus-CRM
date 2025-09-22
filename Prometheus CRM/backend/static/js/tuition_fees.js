import { fetchAuthenticated, showAlert } from './utils.js';

window.initializeTuitionFeesPage = function() {
    const tableBody = document.getElementById('tuitionFeesTableBody');
    const saveBtn = document.getElementById('saveTuitionFeesBtn');

    let initialData = [];

    async function fetchAndRender() {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center">Загрузка...</td></tr>`;
        try {
            const fees = await fetchAuthenticated('/api/tuition-fees');
            initialData = fees; // Store the initial data
            renderTable(fees);
            saveBtn.disabled = true; // Disable save button initially
        } catch (error) {
            showAlert(`Ошибка загрузки данных: ${error.message}`, 'error');
            tableBody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Ошибка загрузки.</td></tr>`;
        }
    }

    function renderTable(fees) {
        tableBody.innerHTML = fees.map(fee => `
            <tr data-grade="${fee.grade}">
                <td>${fee.grade === 0 ? 'Подготовительный' : fee.grade}</td>
                <td><input type="number" class="form-control cost-2023" value="${fee.costFor2023 || ''}" placeholder="Введите стоимость"></td>
                <td><input type="number" class="form-control current-cost" value="${fee.currentCost || ''}" placeholder="Введите стоимость"></td>
            </tr>
        `).join('');
    }

    tableBody.addEventListener('input', () => {
        saveBtn.disabled = false; // Enable save button on any input change
    });

    saveBtn.addEventListener('click', async () => {
        const payload = [];
        tableBody.querySelectorAll('tr').forEach(row => {
            payload.push({
                grade: parseInt(row.dataset.grade),
                costFor2023: parseFloat(row.querySelector('.cost-2023').value) || 0,
                currentCost: parseFloat(row.querySelector('.current-cost').value) || 0,
            });
        });

        try {
            await fetchAuthenticated('/api/tuition-fees', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showAlert('Стоимость обучения успешно обновлена!', 'success');
            saveBtn.disabled = true; // Disable button after successful save
        } catch (error) {
            showAlert(`Ошибка сохранения: ${error.message}`, 'error');
        }
    });

    fetchAndRender();
};