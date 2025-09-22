// FILE: static/js/submit-invoice.js
import { fetchAuthenticated, showAlert, populateDropdown } from './utils.js';
import { $user } from './store.js';

window.initializeSubmitInvoicePage = function() {
    const form = document.getElementById('invoiceForm');
    if (!form) {
        console.error("Form with id 'invoiceForm' not found.");
        return; 
    }

    const applicantInput = document.getElementById('applicant');
    const departmentSelect = document.getElementById('department');
    const budgetItemInput = document.getElementById('budgetItem'); // Скрытое поле
    const registerItemSelect = document.getElementById('registerItem');
    const totalAmountInput = document.getElementById('totalAmount');
    const contractField = document.getElementById('contract-field');
    const memoField = document.getElementById('memo-field');
    const invoiceFileInput = document.getElementById('invoiceFile');
    const recognizeBtn = document.getElementById('recognizeBtn');
    const spinner = document.getElementById('spinner');

    const currentUser = $user.get().profile;
    if (currentUser && currentUser.fullName) {
        applicantInput.value = currentUser.fullName;
    }

    // --- НОВАЯ ФУНКЦИЯ ПРОВЕРКИ БЮДЖЕТА И ПОЛЕЙ ---
    const checkBudgetAndToggleFields = async () => {
        const amount = parseFloat(totalAmountInput.value) || 0;
        const contractFileInput = contractField.querySelector('input');
        const memoFileInput = memoField.querySelector('input');

        // 1. Логика для поля "Договор"
        if (amount > 393200) {
            contractField.style.display = 'block';
            contractFileInput.required = true;
        } else {
            contractField.style.display = 'none';
            contractFileInput.required = false;
        }
        
        // 2. Логика для поля "Служебная записка" на основе бюджета
        const selectedRegisterOption = registerItemSelect.options[registerItemSelect.selectedIndex];
        const registerItem = selectedRegisterOption.value;
        const budgetItem = selectedRegisterOption.dataset.budgetItem;
        const department = departmentSelect.options[departmentSelect.selectedIndex].text;

        // Если выбрана опция "Не входит в бюджет", всегда показываем служебку
        if (registerItem === 'Не входит в статью бюджетов') {
            memoField.style.display = 'block';
            memoFileInput.required = true;
            return; // Выходим, дальнейшая проверка не нужна
        }
        
        // Если все поля для проверки баланса выбраны и сумма введена
        if (department && registerItem && budgetItem && amount > 0) {
            try {
                const balanceData = await fetchAuthenticated(`/api/budget/balance?department=${department}&budgetItem=${budgetItem}&registerItem=${registerItem}`);
                const balance = balanceData.registerBalance;

                if (amount > balance) {
                    showAlert(`Сумма ${amount} превышает остаток по бюджету (${balance}). Требуется служебная записка.`, 'warning', 5000);
                    memoField.style.display = 'block';
                    memoFileInput.required = true;
                } else {
                    memoField.style.display = 'none';
                    memoFileInput.required = false;
                }
            } catch (error) {
                showAlert(`Не удалось проверить баланс бюджета: ${error.message}`, 'error');
                // В случае ошибки, на всякий случай, требуем служебку
                memoField.style.display = 'block';
                memoFileInput.required = true;
            }
        } else {
            // Если какие-то данные для проверки не выбраны, скрываем поле
             memoField.style.display = 'none';
             memoFileInput.required = false;
        }
    };


    // --- Логика для динамической загрузки списков ---
    populateDropdown(departmentSelect, '/api/budget/departments?all=true', 'id', 'name', null, '-- Выберите --');

    departmentSelect.addEventListener('change', async () => {
        const departmentId = departmentSelect.value;
        registerItemSelect.innerHTML = '<option value="">Загрузка...</option>';
        budgetItemInput.value = '';

        if (!departmentId) {
            registerItemSelect.innerHTML = '<option value="">-- Сначала выберите подразделение --</option>';
            return;
        }

        try {
            const items = await fetchAuthenticated(`/api/budget/registry-items-by-department?department_id=${departmentId}`);
            registerItemSelect.innerHTML = '<option value="">-- Выберите категорию бюджета --</option>';

            const groupedItems = items.reduce((acc, item) => {
                (acc[item.budgetItemName] = acc[item.budgetItemName] || []).push(item);
                return acc;
            }, {});

            for (const budgetItemName in groupedItems) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = budgetItemName;
                groupedItems[budgetItemName].forEach(registerItem => {
                    const option = document.createElement('option');
                    option.value = registerItem.name;
                    option.textContent = registerItem.name;
                    option.dataset.budgetItem = budgetItemName; 
                    optgroup.appendChild(option);
                });
                registerItemSelect.appendChild(optgroup);
            }

            registerItemSelect.innerHTML += '<option value="Не входит в статью бюджетов">Не входит в статью бюджетов</option>';
        } catch (error) {
            showAlert(`Ошибка загрузки категорий бюджета: ${error.message}`, 'error');
            registerItemSelect.innerHTML = '<option value="">Ошибка загрузки</option>';
        }
    });

    registerItemSelect.addEventListener('change', () => {
        const selectedOption = registerItemSelect.options[registerItemSelect.selectedIndex];
        budgetItemInput.value = selectedOption.dataset.budgetItem || (selectedOption.value === 'Не входит в статью бюджетов' ? 'Не входит в статью бюджетов' : '');
        checkBudgetAndToggleFields(); // Проверяем бюджет при смене категории
    });

    // --- Привязываем проверку к изменению суммы ---
    totalAmountInput.addEventListener('input', checkBudgetAndToggleFields);

    // --- Остальная логика ---
    recognizeBtn.addEventListener('click', async () => {
        if (invoiceFileInput.files.length === 0) {
            showAlert('Пожалуйста, выберите файл счета для распознавания.', 'warning');
            return;
        }
        spinner.style.display = 'block';
        recognizeBtn.disabled = true;

        const formData = new FormData();
        formData.append('invoiceFile', invoiceFileInput.files[0]);

        try {
            const data = await fetchAuthenticated('/api/invoices/recognize', {
                method: 'POST',
                body: formData
            });
            document.getElementById('kontragent').value = data.kontragent || '';
            document.getElementById('bin').value = data.bin || '';
            document.getElementById('invoiceNumber').value = data.invoiceNumber || '';
            document.getElementById('invoiceDate').value = data.invoiceDate || '';
            const cleanAmount = (data.totalAmount || "0").replace(/\s/g, '').replace(',', '.');
            totalAmountInput.value = (parseFloat(cleanAmount) || 0).toFixed(2);
            totalAmountInput.dispatchEvent(new Event('input')); // Триггерим событие для проверки бюджета
        } catch (error) {
            showAlert(`Ошибка распознавания: ${error.message}`, 'error');
        } finally {
            spinner.style.display = 'none';
            recognizeBtn.disabled = false;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка...';

        try {
            const formData = new FormData(form);
            formData.set('department', departmentSelect.options[departmentSelect.selectedIndex].text);
            
            await fetchAuthenticated('/api/invoices/submit', {
                method: 'POST',
                body: formData
            });
            showAlert('Счет успешно отправлен на согласование!', 'success');
            form.reset();
            departmentSelect.dispatchEvent(new Event('change'));
            if (currentUser && currentUser.fullName) {
                applicantInput.value = currentUser.fullName;
            }
        } catch (error) {
            showAlert(`Ошибка отправки: ${error.message}`, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Отправить на согласование';
        }
    });
};