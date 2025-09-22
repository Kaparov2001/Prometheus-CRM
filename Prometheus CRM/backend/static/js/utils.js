// ===================================================================
// Prometheus CRM/static/js/utils.js
// Description: Centralized utility functions for Prometheus CRM.
// ===================================================================

/**
 * Retrieves the authentication token from localStorage.
 * @returns {string|null} The authentication token or null if not found.
 */
export function getToken() {
    return localStorage.getItem('token');
}

/**
 * Standardized fetch function that automatically includes the Authorization header.
 * Handles common HTTP errors and adds a cache-busting parameter to all GET requests.
 * @param {string} url - The URL to fetch.
 * @param {object} [options={}] - Fetch options (method, headers, body, etc.).
 * @returns {Promise<object>} A promise that resolves to the JSON response data.
 */
export async function fetchAuthenticated(url, options = {}) {
    const token = getToken();
    if (!token) {
        console.error("Authentication token not found. Redirecting to login.");
        window.location.href = '/';
        throw new Error("Unauthorized: No token found.");
    }

    const requestUrl = new URL(url, window.location.origin);
    if (!options.method || options.method.toUpperCase() === 'GET') {
         requestUrl.searchParams.append('_', new Date().getTime());
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
		
	// *** ИСПРАВЛЕНИЕ ДЛЯ FormData: Content-Type не указывается, браузер делает это сам. ***
    if (options.body instanceof FormData) {
        // Не устанавливаем Content-Type, чтобы браузер мог автоматически установить
        // правильный boundary для multipart/form-data.
    } else if (typeof options.body === 'object' && options.body !== null) {
        // Для обычных JSON-объектов оставляем заголовок
        options.headers['Content-Type'] = 'application/json';
    }


    try {
        const response = await fetch(requestUrl.toString(), options);

        if (!response.ok) {
            let errorData;
            try {
                // Если 404, тело может быть не JSON, а просто текст "Not Found"
                if (response.status === 404) {
                    errorData = { error: `Not Found: The requested URL ${requestUrl} was not found on the server.` };
                } else {
                    errorData = await response.json();
                }
            } catch (jsonError) {
                errorData = { error: response.statusText || `HTTP error! Status: ${response.status}` };
            }
            const errorMessage = errorData.error || `Server responded with status ${response.status}`;
            throw new Error(errorMessage);
        }
				
		// *** ИСПРАВЛЕНИЕ: Некоторые успешные ответы могут не иметь тела (например, DELETE) ***
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return await response.json();
        } else {
            return { success: true }; // Возвращаем стандартный успешный ответ
        }

    } catch (error) {
        console.error(`Fetch error for ${url}:`, error);
        throw error;
    }
}


/**
 * Displays a custom alert message.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - Type of alert: 'success', 'error', 'info', 'warning'.
 * @param {number} [duration=3000] - Duration in milliseconds.
 */
export function showAlert(message, type = 'info', duration = 3000) {
    let alertContainer = document.getElementById('app-alerts');
    if (!alertContainer) {
        alertContainer = document.createElement('div');
        alertContainer.id = 'app-alerts';
        Object.assign(alertContainer.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '10000',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: '350px',
        });
        document.body.appendChild(alertContainer);
    }

    const alertBox = document.createElement('div');
    alertBox.textContent = message;
    alertBox.style.padding = '12px 20px';
    alertBox.style.borderRadius = '8px';
    alertBox.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    alertBox.style.opacity = '0';
    alertBox.style.transition = 'opacity 0.3s ease-in-out, transform 0.3s ease-in-out';
    alertBox.style.transform = 'translateY(20px)';
    alertBox.style.cursor = 'pointer';

    switch (type) {
        case 'success':
            alertBox.style.backgroundColor = 'rgba(72, 187, 120, 0.9)';
            alertBox.style.color = 'white';
            break;
        case 'error':
            alertBox.style.backgroundColor = 'rgba(229, 62, 62, 0.9)';
            alertBox.style.color = 'white';
            break;
        case 'warning':
            alertBox.style.backgroundColor = 'rgba(236, 201, 75, 0.9)';
            alertBox.style.color = '#333';
            break;
        default:
            alertBox.style.backgroundColor = 'rgba(99, 179, 237, 0.9)';
            alertBox.style.color = 'white';
            break;
    }

    alertContainer.prepend(alertBox);

    setTimeout(() => {
        alertBox.style.opacity = '1';
        alertBox.style.transform = 'translateY(0)';
    }, 50);

    if (duration > 0) {
        setTimeout(() => {
            alertBox.style.opacity = '0';
            alertBox.style.transform = 'translateY(-20px)';
            alertBox.addEventListener('transitionend', () => alertBox.remove());
        }, duration);
    }

    alertBox.addEventListener('click', () => {
        alertBox.style.opacity = '0';
        alertBox.style.transform = 'translateY(-20px)';
        alertBox.addEventListener('transitionend', () => alertBox.remove());
    });
}

/**
 * Displays a confirmation dialog.
 * @param {string} message - The confirmation message.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
 */
export function showConfirm(message) {
    return new Promise((resolve) => {
        const confirmModal = document.createElement('div');
        confirmModal.className = 'modal-overlay';
        confirmModal.style.display = 'flex';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.maxWidth = '450px';

        modalContent.innerHTML = `
            <div class="modal-header">
                <h4>Подтверждение</h4>
                <button class="close-button confirm-close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <p>${message}</p>
            </div>
            <div class="modal-footer">
                <button class="button-secondary confirm-cancel-btn">Нет</button>
                <button class="button-primary confirm-ok-btn">Да</button>
            </div>
        `;

        confirmModal.appendChild(modalContent);
        document.body.appendChild(confirmModal);

        const close = () => {
            confirmModal.remove();
            document.body.style.overflow = '';
        };

        modalContent.querySelector('.confirm-ok-btn').addEventListener('click', () => { resolve(true); close(); });
        modalContent.querySelector('.confirm-cancel-btn').addEventListener('click', () => { resolve(false); close(); });
        modalContent.querySelector('.confirm-close-btn').addEventListener('click', () => { resolve(false); close(); });
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal) {
                resolve(false);
                close();
            }
        });

        document.body.style.overflow = 'hidden';
    });
}


/**
 * Показывает простое окно для ввода причины, которое всегда будет наверху.
 * @param {string} title - Заголовок окна.
 * @param {string} placeholder - Текст-подсказка для поля ввода.
 * @param {string} buttonText - Текст на кнопке подтверждения.
 * @returns {Promise<string|null>} Promise, который разрешается с введенным текстом или null, если нажата отмена.
 */
export function showReasonPrompt(title, placeholder = 'Укажите причину...', buttonText = 'Отправить') {
    return new Promise((resolve) => {
        // --- Создание оверлея (фона) ---
        const overlay = document.createElement('div');
        overlay.id = 'custom-prompt-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '9998', // Очень высокий z-index
            opacity: '0',
            transition: 'opacity 0.2s ease'
        });

        // --- Создание модального окна ---
        const modal = document.createElement('div');
        modal.id = 'custom-prompt-modal';
        Object.assign(modal.style, {
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
            width: '90%',
            maxWidth: '450px',
            zIndex: '9999', // Выше, чем у фона
            fontFamily: 'Inter, sans-serif',
            transform: 'scale(0.9)',
            transition: 'transform 0.2s ease'
        });
        
        // --- Содержимое модального окна ---
        modal.innerHTML = `
            <h4 style="margin-top:0; margin-bottom:15px; font-weight: 600; font-size: 18px;">${title}</h4>
            <textarea id="custom-prompt-textarea" style="width: 100%; min-height: 80px; padding: 10px; border-radius: 4px; border: 1px solid #ccc; font-size: 16px; margin-bottom: 15px; box-sizing: border-box;" placeholder="${placeholder}"></textarea>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button id="custom-prompt-cancel" style="padding: 10px 20px; border-radius: 5px; border: 1px solid #ccc; background: #f0f0f0; cursor: pointer;">Отменить</button>
                <button id="custom-prompt-ok" style="padding: 10px 20px; border-radius: 5px; border: none; background: #4A90E2; color: white; cursor: pointer;">${buttonText}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        // Плавное появление
        setTimeout(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'scale(1)';
        }, 10);

        const textarea = document.getElementById('custom-prompt-textarea');
        textarea.focus();

        const close = (value) => {
            modal.style.transform = 'scale(0.9)';
            overlay.style.opacity = '0';
            overlay.addEventListener('transitionend', () => {
                overlay.remove();
                document.body.style.overflow = '';
            });
            resolve(value);
        };

        document.getElementById('custom-prompt-ok').onclick = () => {
            const value = textarea.value.trim();
            if (value) {
                close(value);
            } else {
                textarea.style.border = '1px solid red';
                setTimeout(() => { textarea.style.border = '1px solid #ccc'; }, 1500);
            }
        };

        document.getElementById('custom-prompt-cancel').onclick = () => close(null);
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                close(null);
            }
        };
    });
}


/**
 * Generic function to open any modal.
 * @param {HTMLElement} modalElement - The modal DOM element to open.
 */
export function openModal(modalElement) {
    if (modalElement) {
        modalElement.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

/**
 * Generic function to close any modal.
 * @param {HTMLElement} modalElement - The modal DOM element to close.
 * @param {Function} [resetFormCallback=null] - Optional callback to reset form.
 */
export function closeModal(modalElement, resetFormCallback = null) {
    if (modalElement) {
        modalElement.style.display = 'none';
        if (resetFormCallback && typeof resetFormCallback === 'function') {
            resetFormCallback();
        }
        document.body.style.overflow = '';
    }
}

/**
 * Populates a <select> element with options fetched from an API.
 */
export async function populateDropdown(
    selectElement,
    apiUrl,
    valueKey,
    textKey,
    selectedValue = null,
    defaultOptionText = 'Не выбрано',
    includeDefaultOption = true
) {
    if (!selectElement) {
        console.error('Dropdown select element not found.');
        return;
    }
    
    // --- ИЗМЕНЕНИЕ: Убрано автоматическое добавление ?all=true ---
    const fullApiUrl = apiUrl;

    try {
        const data = await fetchAuthenticated(fullApiUrl);

        selectElement.innerHTML = '';

        if (includeDefaultOption) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = defaultOptionText;
            selectElement.appendChild(defaultOption);
        }
        
        // Данные могут приходить как простой массив или как объект пагинации
        const items = (data && Array.isArray(data.data)) ? data.data : (Array.isArray(data) ? data : []);

        if (Array.isArray(items)) {
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item[valueKey];
                
                if (typeof textKey === 'function') {
                    option.textContent = textKey(item);
                } else {
                    option.textContent = item[textKey];
                }

                if (selectedValue) {
                    if (Array.isArray(selectedValue)) {
                        if (selectedValue.includes(item[valueKey])) {
                            option.selected = true;
                        }
                    } else if (item[valueKey] == selectedValue) {
                        option.selected = true;
                    }
                }
                selectElement.appendChild(option);
            });
        }
    } catch (error) {
        console.error(`Error populating dropdown from ${fullApiUrl}:`, error);
        showAlert(`Не удалось загрузить данные для списка: ${error.message}`, 'error');
        selectElement.innerHTML = `<option value="">Ошибка загрузки</option>`;
    }
}


/**
 * Initializes action dropdowns in tables.
 */
export function initializeActionDropdowns() {
    document.removeEventListener('click', handleGlobalDropdownClose);
    document.addEventListener('click', handleGlobalDropdownClose);

    document.querySelectorAll('.action-button').forEach(button => {
        button.removeEventListener('click', handleActionButtonClick);
        button.addEventListener('click', handleActionButtonClick);
    });
}

function handleActionButtonClick(event) {
    event.stopPropagation();
    const dropdown = this.closest('.action-dropdown');
    document.querySelectorAll('.action-dropdown.show').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('show');
        }
    });
    dropdown.classList.toggle('show');
}

function handleGlobalDropdownClose(event) {
    document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

/**
 * Formats a phone number to a consistent +7 XXX XXX-XX-XX format.
 */
export function formatPhoneNumber(inputElement) {
    let value = inputElement.value.replace(/\D/g, '');
    if (value.startsWith('7') || value.startsWith('8')) {
        value = value.substring(1);
    }
    let formattedValue = '+7 ';
    if (value.length > 0) formattedValue += value.substring(0, 3);
    if (value.length >= 4) formattedValue += ' ' + value.substring(3, 6);
    if (value.length >= 7) formattedValue += '-' + value.substring(6, 8);
    if (value.length >= 9) formattedValue += '-' + value.substring(8, 10);
    inputElement.value = formattedValue;
}

/**
 * Extracts birth date and gender from an IIN.
 */
export function autoFillIINData(iinInput, birthDateInput, genderSelect) {
    iinInput.setAttribute('maxlength', '12');
    iinInput.addEventListener('keydown', (event) => {
        if (event.key.length === 1 && isNaN(event.key) && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
        }
    });

    iinInput.addEventListener('input', () => {
        const iin = iinInput.value;
        if (iin.length === 12) {
            let year = parseInt(iin.substring(0, 2), 10);
            const month = parseInt(iin.substring(2, 4), 10);
            const day = parseInt(iin.substring(4, 6), 10);
            const centuryDigit = parseInt(iin.charAt(6), 10);

            let centuryPrefix = '';
            let genderValue = '';

            if (centuryDigit >= 1 && centuryDigit <= 6) {
                centuryPrefix = (centuryDigit <= 2) ? '18' : (centuryDigit <= 4) ? '19' : '20';
                genderValue = (centuryDigit % 2 !== 0) ? 'Мужской' : 'Женский';
            }

            if (centuryPrefix && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const fullYear = centuryPrefix + String(year).padStart(2, '0');
                birthDateInput.value = `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                if (genderSelect) genderSelect.value = genderValue;
            } else {
                birthDateInput.value = '';
                if (genderSelect) genderSelect.value = '';
            }
        } else {
            birthDateInput.value = '';
            if (genderSelect) genderSelect.value = '';
        }
    });
}


/**
 * Initializes tab switching logic for modals.
 */
export function initializeModalTabs(modalElement) {
    if (!modalElement) return;

    const tabLinks = modalElement.querySelectorAll('.tab-link');
    const tabPanes = modalElement.querySelectorAll('.tab-pane');

    tabLinks.forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const targetTabId = link.getAttribute('data-tab');

            tabLinks.forEach(l => l.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            link.classList.add('active');
            modalElement.querySelector(`#${targetTabId}`)?.classList.add('active');
        });
    });
}

/**
 * Sets up photo preview functionality.
 */
export function setupPhotoPreview(fileInput, previewImg, defaultSrc = '/static/placeholder.png') {
    if (!fileInput || !previewImg) return;
    if (!previewImg.src || previewImg.src.includes('about:blank')) {
        previewImg.src = defaultSrc;
    }
    previewImg.style.display = 'block';
    previewImg.style.cursor = 'pointer';
    previewImg.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) {
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImg.src = e.target.result;
            }
            reader.readAsDataURL(this.files[0]);
        } else {
            previewImg.src = defaultSrc;
        }
    });
}

/**
 * Проверяет, есть ли у пользователя определенное право доступа.
 * @param {string} permission - Название права для проверки.
 * @returns {boolean} - True, если право есть, иначе false.
 */
export function hasPermission(permission) {
    if (!window.userPermissions) {
        console.warn("Список прав пользователя (userPermissions) еще не загружен.");
        return false;
    }
    return window.userPermissions.includes('admin') || window.userPermissions.includes(permission);
}


/**
 * Renders pagination controls.
 */
export function renderPagination(container, currentPage, totalPages, onPageClick) {
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const nav = document.createElement('nav');
    const ul = document.createElement('ul');
    ul.className = 'pagination';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage === 1 ? 'disabled' : ''}`;
    prevLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage - 1}">Назад</a>`;
    ul.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
        ul.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage === totalPages ? 'disabled' : ''}`;
    nextLi.innerHTML = `<a class="page-link" href="#" data-page="${currentPage + 1}">Вперед</a>`;
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    container.appendChild(nav);

    container.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.target.tagName === 'A' && !e.target.parentElement.classList.contains('disabled') && !e.target.parentElement.classList.contains('active')) {
            const page = parseInt(e.target.dataset.page, 10);
            onPageClick(page);
        }
    });
}
// Добавить в конец файла static/js/utils.js

/**
 * Запрашивает разрешение на показ уведомлений и отображает их, если есть разрешение.
 * @param {string} title - Заголовок уведомления.
 * @param {string} body - Текст уведомления.
 * @param {string} [icon='/static/logo.png'] - Путь к иконке.
 */
export function showBrowserNotification(title, body, icon = '/static/logo.png') {
    // Проверяем, поддерживает ли браузер уведомления
    if (!("Notification" in window)) {
        console.log("Этот браузер не поддерживает уведомления.");
        return;
    }

    // Проверяем, есть ли уже разрешение
    if (Notification.permission === "granted") {
        new Notification(title, { body, icon });
    } 
    // Если разрешение еще не запрошено, запрашиваем его
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(title, { body, icon });
            }
        });
    }
    // Если пользователь отказал, ничего не делаем
}
/**
 * Formats a number as a currency string for KZT.
 * @param {number} amount - The amount to format.
 * @returns {string} - The formatted currency string (e.g., "150 000,00 KZT").
 */
export function formatCurrency(amount) {
    if (typeof amount !== 'number') {
        return '0,00 KZT';
    }
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'KZT',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount).replace('₸', 'KZT');
}

/**
 * Formats a date string into DD.MM.YYYY format.
 * @param {string} dateString - The date string to format (e.g., from an API).
 * @returns {string} - The formatted date string or an empty string if input is invalid.
 */
export function formatDate(dateString) {
    if (!dateString) {
        return '';
    }
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (error) {
        console.error('Invalid date format:', dateString);
        return '';
    }
}