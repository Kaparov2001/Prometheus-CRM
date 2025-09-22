// prometheus-crm/static/js/students.js
import {
    fetchAuthenticated,
    openModal,
    closeModal,
    showAlert,
    showConfirm,
    populateDropdown,
    initializeActionDropdowns,
    setupPhotoPreview,
    initializeModalTabs,
    renderPagination,
    formatPhoneNumber,
    autoFillIINData
} from './utils.js';

// --- Глобальные переменные DOM и состояние ---
let studentsTableBody, paginationContainer;
let studentModal, studentForm, studentIdField, modalTitle, deleteStudentButton;
let studentPhotoInput, studentPhotoPreview;
let relativesContainer, addRelativeBtn, selectStudentModal, studentsForSelectionTableBody, studentSearchInput;

// Ключевая переменная состояния, хранящая ID ученика, который сейчас редактируется.
let currentEditingStudentId = null;

// Для окна выбора родственников
let currentStudentIdForRelatives = null; // Будет ссылаться на currentEditingStudentId

// Для валидации ИИН
let iinValidationTimeout;
let searchStudentsTimeout;
// --- ИСПРАВЛЕНИЕ: Флаги для надежной асинхронной валидации ---
let isIinValidating = false;
let isIinDuplicate = false;


/**
 * Главная функция инициализации страницы учеников.
 * Вызывается из dashboard.js.
 */
window.initializeStudentsPage = async function() {
    // --- Инициализация элементов DOM ---
    studentsTableBody = document.getElementById('studentsTableBody');
    paginationContainer = document.getElementById('paginationContainer');
    studentModal = document.getElementById('studentModal');
    studentForm = document.getElementById('studentForm');
    modalTitle = document.getElementById('studentModalTitle');

    // Проверяем наличие ключевых элементов до того, как начнем искать в них дочерние
    if (!studentForm || !studentModal) {
        console.error("Критическая ошибка: форма студента (#studentForm) или модальное окно (#studentModal) не найдены! Скрипт не может продолжить работу.");
        return;
    }

    studentIdField = studentForm.querySelector('#studentId');
    deleteStudentButton = studentModal.querySelector('#deleteStudentButton');
    studentPhotoInput = studentModal.querySelector('#student_photo');
    studentPhotoPreview = studentModal.querySelector('#student_photoPreview');
    relativesContainer = studentModal.querySelector('#relativesContainer');
    addRelativeBtn = studentModal.querySelector('#addRelativeBtn');

    // Элементы модалки выбора студента
    selectStudentModal = document.getElementById('selectStudentModal');
    studentsForSelectionTableBody = selectStudentModal ? selectStudentModal.querySelector('#studentsForSelectionTableBody') : null;
    studentSearchInput = selectStudentModal ? selectStudentModal.querySelector('#studentSearchInput') : null;

    const addStudentBtn = document.getElementById('addStudentBtn');
    const closeStudentModalBtn = studentModal.querySelector('#closeStudentModalBtn');
    const cancelStudentBtn = studentModal.querySelector('#cancelStudentBtn');
    const closeSelectStudentModalBtn = selectStudentModal ? selectStudentModal.querySelector('#closeSelectStudentModalBtn') : null;

    if (!studentsTableBody || !paginationContainer || !addStudentBtn) {
        console.error("Ключевые элементы страницы учеников не найдены. Инициализация прервана.");
        return;
    }

    if (!studentIdField) {
        console.error("Критическая ошибка: поле <input id='studentId'> не найдено внутри формы #studentForm. Функционал редактирования и создания будет нарушен.");
        showAlert("Ошибка конфигурации: отсутствует поле studentId в HTML-коде. Обратитесь к администратору.", "error");
    }

    // --- Привязка событий ---
    addStudentBtn.addEventListener('click', openStudentModalForCreate);
    if (closeStudentModalBtn) closeStudentModalBtn.addEventListener('click', () => closeModal(studentModal, resetStudentForm));
    if (cancelStudentBtn) cancelStudentBtn.addEventListener('click', () => closeModal(studentModal, resetStudentForm));
    studentForm.addEventListener('submit', handleStudentFormSubmit);
    studentsTableBody.addEventListener('click', handleTableActions);
    if (deleteStudentButton) {
        deleteStudentButton.addEventListener('click', () => handleDeleteStudent(currentEditingStudentId));
    }
    if (addRelativeBtn) addRelativeBtn.addEventListener('click', openSelectStudentModal);

    // События для модалки выбора студента
    if (closeSelectStudentModalBtn) closeSelectStudentModalBtn.addEventListener('click', () => closeModal(selectStudentModal));
    if (studentSearchInput) studentSearchInput.addEventListener('input', () => debounceSearchStudentsForSelection());
    if (studentsForSelectionTableBody) studentsForSelectionTableBody.addEventListener('click', handleStudentSelection);

    // Настройка превью фото
    if (studentPhotoInput && studentPhotoPreview) {
        setupPhotoPreview(studentPhotoInput, studentPhotoPreview);
    }

    // Настройка полей телефона и ИИН
    const studentPhoneField = studentForm.querySelector('#student_studentPhone');
    const mothersPhoneField = studentForm.querySelector('#student_mothersPhone');
    const fathersPhoneField = studentForm.querySelector('#student_fathersPhone');
    const contractParentPhoneField = studentForm.querySelector('#student_contractParentPhone');
    const studentIINField = studentForm.querySelector('#student_iin');
    const studentBirthDateField = studentForm.querySelector('#student_birthDate');
    const studentGenderField = studentForm.querySelector('#student_gender');
    const contractParentIINField = studentForm.querySelector('#student_contractParentIIN');
    const contractParentBirthDateField = studentForm.querySelector('#student_contractParentBirthDate');

    if (studentPhoneField) formatPhoneNumber(studentPhoneField);
    if (mothersPhoneField) formatPhoneNumber(mothersPhoneField);
    if (fathersPhoneField) formatPhoneNumber(fathersPhoneField);
    if (contractParentPhoneField) formatPhoneNumber(contractParentPhoneField);

    if (studentIINField && studentBirthDateField && studentGenderField) {
        autoFillIINData(studentIINField, studentBirthDateField, studentGenderField);
    }
    if (contractParentIINField && contractParentBirthDateField) {
        autoFillIINData(contractParentIINField, contractParentBirthDateField);
    }

    // Добавление валидации ИИН
    if (studentIINField) {
        studentIINField.addEventListener('input', () => {
            clearTimeout(iinValidationTimeout);
            const iin = studentIINField.value.trim();
            const existingErrorDiv = studentIINField.nextElementSibling;
            const submitBtn = studentForm.querySelector('button[type="submit"]');

            isIinDuplicate = false; // Сбрасываем флаг при каждом вводе
            if (existingErrorDiv && existingErrorDiv.classList.contains('error-message')) {
                existingErrorDiv.remove();
            }

            if (iin.length === 12) {
                isIinValidating = true; // Устанавливаем флаг, что проверка началась
                submitBtn.disabled = true;
                submitBtn.textContent = 'Проверка ИИН...';

                iinValidationTimeout = setTimeout(async () => {
                    try {
                        const response = await fetchAuthenticated(`/api/students?all=true`);
                        const students = Array.isArray(response.data) ? response.data : [];

                        const isDuplicateCheck = students.some(s =>
                            s.iin === iin && s.ID !== currentEditingStudentId
                        );

                        if (isDuplicateCheck) {
                            isIinDuplicate = true; // Устанавливаем флаг дубликата
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'error-message text-danger';
                            errorDiv.textContent = 'Ученик с таким ИИН уже существует.';
                            studentIINField.parentNode.insertBefore(errorDiv, studentIINField.nextSibling);
                        }
                    } catch (error) {
                        console.error('Ошибка при валидации ИИН:', error);
                    } finally {
                        isIinValidating = false; // Снимаем флаг проверки
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Сохранить';
                    }
                }, 500);
            }
        });
    }

    // Инициализация вкладок в модальном окне
    initializeModalTabs(studentModal);

    // Загрузка и отображение списка учеников
    fetchAndRenderStudents(1);

    // Настройка drag-and-drop для родственников
    if (relativesContainer) {
        setupRelativesDragAndDrop();
    }
};

/**
 * Сбрасывает форму студента и связанные элементы.
 */
function resetStudentForm() {
    studentForm.reset();
    if (studentIdField) {
        studentIdField.value = '';
    }
    currentEditingStudentId = null;
    isIinDuplicate = false;
    isIinValidating = false;

    if (modalTitle) {
        modalTitle.textContent = 'Добавить ученика';
    }
    if (deleteStudentButton) {
        deleteStudentButton.style.display = 'none';
    }
    if (studentPhotoPreview) {
        studentPhotoPreview.src = '/static/placeholder.png';
    }
    if (relativesContainer) {
        relativesContainer.innerHTML = '<p class="text-color-secondary">Сначала сохраните ученика, чтобы добавить родственников.</p>';
    }

    const studentIINField = studentForm.querySelector('#student_iin');
    if (studentIINField) {
        const existingErrorDiv = studentIINField.nextElementSibling;
        if (existingErrorDiv && existingErrorDiv.classList.contains('error-message')) {
            existingErrorDiv.remove();
        }
    }

    const firstTab = studentModal.querySelector('.tab-link');
    if (firstTab) firstTab.click();
}

/**
 * Открывает модальное окно для создания нового ученика.
 */
function openStudentModalForCreate() {
    resetStudentForm();
    populateStudentDropdowns();
    openModal(studentModal);
}

/**
 * Открывает модальное окно для редактирования существующего ученика.
 * @param {number | string} id ID ученика.
 */
window.openStudentModalForEdit = async function(id) {
    currentEditingStudentId = parseInt(id, 10);
    resetStudentForm();
    currentEditingStudentId = parseInt(id, 10); // Восстанавливаем ID после сброса

    modalTitle.textContent = 'Карточка ученика';
    if (deleteStudentButton) deleteStudentButton.style.display = 'inline-block';

    try {
        const studentData = await fetchAuthenticated(`/api/students/${id}`);
        fillStudentForm(studentData);
        openModal(studentModal);
    } catch (error) {
        showAlert(`Ошибка загрузки данных ученика: ${error.message}`, 'error');
        console.error("Ошибка загрузки данных ученика:", error);
    }
}

/**
 * Заполняет форму ученика данными.
 * @param {object} studentData Объект с данными ученика.
 */
function fillStudentForm(studentData) {
    if (studentIdField) {
        studentIdField.value = studentData.ID;
    }

    const fields = [
        'lastName', 'firstName', 'middleName', 'iin', 'gender', 'birthDate', 'studentPhone', 'email', 'language',
        'startDate', 'endDate', 'mothersName', 'mothersPhone', 'fathersName', 'fathersPhone', 'comments',
        'contractParentName', 'contractParentIIN', 'contractParentBirthDate', 'contractParentEmail',
        'contractParentPhone', 'contractParentDocumentNumber', 'contractParentDocumentInfo',
        'birthCertificateNumber', 'birthCertificateIssueInfo', 'mothersWorkPlace', 'mothersJobTitle',
        'fathersWorkPlace', 'fathersJobTitle', 'homeAddress', 'medicalInfo', 'previousSchoolId',
        'isStudying', 'isResident'
    ];

    fields.forEach(field => {
        const element = document.getElementById(`student_${field}`);
        if (element) {
            // ИСПРАВЛЕНИЕ: Добавлен `startDate` в список обрабатываемых дат.
            if (['birthDate', 'contractParentBirthDate', 'endDate', 'startDate'].includes(field)) {
                element.value = studentData[field] ? new Date(studentData[field]).toISOString().split('T')[0] : '';
            } else if (['isStudying', 'isResident'].includes(field)) {
                element.checked = studentData[field] === true;
            } else {
                element.value = studentData[field] || '';
            }
        }
    });

    if (studentPhotoPreview) studentPhotoPreview.src = studentData.photoUrl || '/static/placeholder.png';

    populateStudentDropdowns(studentData.nationalityId, studentData.classId);
    renderFamilyMembers(studentData.familyMembers);
}


/**
 * Заполняет выпадающие списки (национальности, классы).
 * @param {number} [selectedNationalityId=null] Предвыбранная национальность.
 * @param {number} [selectedClassId=null] Предвыбранный класс.
 */
function populateStudentDropdowns(selectedNationalityId = null, selectedClassId = null) {
    const nationalityDropdown = document.getElementById('student_nationalityId');
    const classDropdown = document.getElementById('student_classId');

    if (nationalityDropdown) {
        populateDropdown(
            nationalityDropdown,
            '/api/nationalities?all=true',
            'id',
            'name',
            selectedNationalityId,
            "Выберите национальность"
        );
    }

    if (classDropdown) {
        populateDropdown(
            classDropdown,
            '/api/classes?all=true',
            'id',
            (item) => `${item.grade_number} ${item.liter_char}`,
            selectedClassId,
            "Выберите класс"
        );
    }
}

/**
 * Обрабатывает отправку формы ученика.
 * @param {Event} e Событие отправки формы.
 */
async function handleStudentFormSubmit(e) {
    e.preventDefault();

    // --- ИСПРАВЛЕНИЕ: Проверяем флаги валидации перед отправкой ---
    if (isIinValidating) {
        showAlert('Подождите, идет проверка ИИН...', 'info');
        return;
    }
    if (isIinDuplicate) {
        showAlert('Этот ИИН уже используется. Пожалуйста, исправьте.', 'error');
        return;
    }
    if (!studentForm.checkValidity()) {
        showAlert('Пожалуйста, заполните все обязательные поля.', 'warning');
        return;
    }


    const submitBtn = studentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение...';

    const formData = new FormData(studentForm);

    const url = currentEditingStudentId ? `/api/students/${currentEditingStudentId}` : '/api/students';
    const method = currentEditingStudentId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            body: formData,
        });
        showAlert(`Ученик успешно ${currentEditingStudentId ? 'обновлен' : 'создан'}!`, 'success');
        closeModal(studentModal, resetStudentForm);
        fetchAndRenderStudents(1);
    } catch (error) {
        showAlert(`Ошибка сохранения ученика: ${error.message}`, 'error');
        console.error("Ошибка сохранения ученика:", error);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Сохранить';
    }
}


/**
 * Удаляет ученика.
 * @param {number | string} id ID ученика для удаления.
 */
async function handleDeleteStudent(id) {
    if (!id) return;

    const confirmed = await showConfirm('Вы уверены, что хотите удалить этого ученика? Это действие нельзя отменить.');
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/students/${id}`, {
            method: 'DELETE'
        });
        showAlert('Ученик успешно удален.', 'success');
        closeModal(studentModal, resetStudentForm);
        fetchAndRenderStudents(1);
    } catch (error) {
        showAlert(`Ошибка удаления ученика: ${error.message}`, 'error');
        console.error("Ошибка удаления ученика:", error);
    }
}


/**
 * Загружает и отображает список учеников в таблице.
 * @param {number} page Номер страницы.
 */
async function fetchAndRenderStudents(page = 1) {
    studentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const response = await fetchAuthenticated(`/api/students?page=${page}`);
        const students = Array.isArray(response.data) ? response.data : [];
        const currentPage = response.currentPage;
        const pageSize = response.pageSize;

        if (students.length > 0) {
            studentsTableBody.innerHTML = students.map((student, index) => {
                const rowNumber = (currentPage - 1) * pageSize + index + 1;
                return `
                    <tr data-id="${student.ID}">
                        <td data-label="№">${rowNumber}</td>
                        <td data-label="Фото" class="text-center">
                            <img src="${student.photoUrl || '/static/placeholder.png'}" alt="Фото" class="user-photo-sm">
                        </td>
                        <td data-label="ФИО ученика">
                            ${student.lastName || ''} ${student.firstName || ''}
                        </td>
                        <td data-label="Класс">${student.grade || '—'}</td>
                        <td data-label="Литер">${student.liter || '—'}</td>
                        <td data-label="Статус">
                            <span class="status-badge ${student.isStudying ? 'active' : 'inactive'}">
                                ${student.isStudying ? 'Учится' : 'Не учится'}
                            </span>
                        </td>
                        <td data-label="Действия" class="text-center">
                             <div class="action-dropdown">
                                <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                                <div class="action-dropdown-content">
                                    <a href="#" class="edit-student-btn" data-id="${student.ID}"><i class="bi bi-pencil"></i> Изменить</a>
                                    <a href="#" class="delete-student-btn" data-id="${student.ID}"><i class="bi bi-trash"></i> Удалить</a>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            studentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Ученики не найдены.</td></tr>`;
        }

        renderPagination(paginationContainer, response.currentPage, response.totalPages, fetchAndRenderStudents);
        
        initializeActionDropdowns();

        if (typeof window.updateTableActionsVisibility === 'function') {
            window.updateTableActionsVisibility();
        }
    } catch (error) {
        studentsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Не удалось загрузить список учеников: ${error.message}</td></tr>`;
        console.error("Ошибка загрузки списка учеников:", error);
    }
}

/**
 * Обработка действий в таблице (редактирование).
 * @param {Event} e Событие клика.
 */
function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-student-btn');
    const deleteBtn = e.target.closest('.delete-student-btn');

    if (editBtn) {
        e.preventDefault();
        openStudentModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDeleteStudent(deleteBtn.dataset.id);
    }
}

// --- Функции управления родственниками ---

/**
 * Открывает модальное окно для выбора родственника.
 */
async function openSelectStudentModal() {
    currentStudentIdForRelatives = currentEditingStudentId;
    if (!currentStudentIdForRelatives) {
        showAlert('Сначала сохраните текущего ученика, чтобы добавить ему родственников.', 'warning');
        return;
    }

    if (selectStudentModal) {
        openModal(selectStudentModal);
        await searchStudentsForSelection();
    } else {
        showAlert('Модальное окно выбора студента не найдено.', 'error');
    }
}


function debounceSearchStudentsForSelection() {
    clearTimeout(searchStudentsTimeout);
    searchStudentsTimeout = setTimeout(() => {
        searchStudentsForSelection();
    }, 300);
}

/**
 * Ищет студентов для выбора в качестве родственников и отображает их.
 */
async function searchStudentsForSelection() {
    const query = studentSearchInput ? studentSearchInput.value.trim() : '';
    studentsForSelectionTableBody.innerHTML = `<tr><td colspan="3" class="text-center">Загрузка...</td></tr>`;

    try {
        const response = await fetchAuthenticated(`/api/students?all=true&search=${query}`);
        const students = Array.isArray(response.data) ? response.data : [];
        const existingRelativeIds = Array.from(relativesContainer.querySelectorAll('.relative-block'))
            .map(el => parseInt(el.dataset.studentId, 10));

        const filteredStudents = students.filter(s =>
            s.ID !== currentStudentIdForRelatives && !existingRelativeIds.includes(s.ID)
        );

        if (filteredStudents.length > 0) {
            studentsForSelectionTableBody.innerHTML = filteredStudents.map(s => `
                <tr data-student-id="${s.ID}">
                    <td data-label="ФИО">${s.lastName} ${s.firstName}</td>
                    <td data-label="Класс">${s.grade || '—'} ${s.liter || '—'}</td>
                    <td data-label="Выбрать" class="text-center">
                        <button type="button" class="button-primary btn-sm select-relative-btn" data-id="${s.ID}">Выбрать</button>
                    </td>
                </tr>
            `).join('');
        } else {
            studentsForSelectionTableBody.innerHTML = `<tr><td colspan="3" class="text-center">Подходящие ученики не найдены.</td></tr>`;
        }
    } catch (error) {
        showAlert(`Ошибка поиска учеников: ${error.message}`, 'error');
        console.error("Ошибка поиска учеников:", error);
        studentsForSelectionTableBody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Ошибка загрузки.</td></tr>`;
    }
}

/**
 * Обрабатывает выбор студента из списка поиска.
 */
async function handleStudentSelection(e) {
    const selectBtn = e.target.closest('.select-relative-btn');
    if (!selectBtn) return;

    const selectedRelativeId = parseInt(selectBtn.dataset.id, 10);
    const mainStudentId = currentStudentIdForRelatives;

    if (!mainStudentId || isNaN(selectedRelativeId)) {
        showAlert('Ошибка: Неверный ID студента или родственника.', 'error');
        return;
    }

    try {
        await fetchAuthenticated(`/api/students/${mainStudentId}/relatives`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                relativeId: selectedRelativeId
            })
        });
        showAlert('Родственная связь успешно добавлена!', 'success');
        closeModal(selectStudentModal);
        openStudentModalForEdit(mainStudentId);
    } catch (error) {
        showAlert(`Ошибка добавления родственника: ${error.message}`, 'error');
        console.error("Ошибка добавления родственника:", error);
    }
}


/**
 * Отрисовывает блоки членов семьи в модальном окне.
 */
function renderFamilyMembers(familyMembers) {
    if (!relativesContainer) return;
    relativesContainer.innerHTML = '';

    if (!familyMembers || familyMembers.length === 0) {
        relativesContainer.innerHTML = '<p class="text-color-secondary">Нет зарегистрированных родственников.</p>';
        return;
    }

    familyMembers.forEach(member => {
        const div = document.createElement('div');
        div.className = 'relative-block';
        div.dataset.studentId = member.ID;
        div.dataset.linkId = member.linkId;
        div.setAttribute('draggable', true);

        div.innerHTML = `
            <span class="drag-handle" title="Перетащить для изменения порядка">&#9776;</span>
            <span class="relative-name">${member.lastName} ${member.firstName} ${member.isSelf ? '<span class="self-tag">(этот ученик)</span>' : ''}</span>
            <span class="discount-display">Скидка: <b>${member.discount || 0}%</b></span>
            ${!member.isSelf ? `<button type="button" class="remove-relative-btn" title="Удалить связь">&times;</button>` : ''}
        `;

        if (!member.isSelf) {
            const removeBtn = div.querySelector('.remove-relative-btn');
            removeBtn.addEventListener('click', async () => {
                const confirmed = await showConfirm(`Вы уверены, что хотите разорвать родственную связь с ${member.lastName} ${member.firstName}?`);
                if (!confirmed) return;

                try {
                    if (!currentEditingStudentId) throw new Error('ID текущего студента не определен.');
                    await fetchAuthenticated(`/api/students/${currentEditingStudentId}/relatives/${member.linkId}`, {
                        method: 'DELETE'
                    });
                    showAlert('Родственная связь удалена. Скидки будут пересчитаны.', 'success');
                    openStudentModalForEdit(currentEditingStudentId);
                } catch (error) {
                    showAlert(`Ошибка удаления родственника: ${error.message}`, 'error');
                }
            });
        }
        relativesContainer.appendChild(div);
    });
}


/**
 * Настраивает логику Drag & Drop для списка родственников.
 */
function setupRelativesDragAndDrop() {
    let draggedItem = null;

    relativesContainer.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('relative-block')) {
            draggedItem = e.target;
            setTimeout(() => {
                e.target.classList.add('dragging');
            }, 0);
        }
    });

    relativesContainer.addEventListener('dragend', (e) => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            draggedItem = null;
            updateFamilyOrderOnBackend();
        }
    });

    relativesContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(relativesContainer, e.clientY);
        const draggingElement = document.querySelector('.dragging');
        if (draggingElement) {
            if (afterElement == null) {
                relativesContainer.appendChild(draggingElement);
            } else {
                relativesContainer.insertBefore(draggingElement, afterElement);
            }
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.relative-block:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return {
                    offset: offset,
                    element: child
                };
            } else {
                return closest;
            }
        }, {
            offset: Number.NEGATIVE_INFINITY
        }).element;
    }

    /**
     * Отправляет новый порядок членов семьи на сервер.
     */
    async function updateFamilyOrderOnBackend() {
        if (!currentEditingStudentId) {
            showAlert('Ошибка: ID текущего ученика не определен.', 'error');
            return;
        }

        const orderedFamily = Array.from(relativesContainer.querySelectorAll('.relative-block'))
            .map((el, index) => ({
                student_id: parseInt(el.dataset.studentId, 10),
                family_order: index
            }));

        try {
            await fetchAuthenticated(`/api/students/family-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(orderedFamily)
            });
            showAlert('Порядок родственников сохранен, скидки обновлены!', 'success');
            openStudentModalForEdit(currentEditingStudentId);
        } catch (error) {
            showAlert(`Ошибка обновления порядка: ${error.message}`, 'error');
            console.error("Ошибка обновления порядка семьи:", error);
            openStudentModalForEdit(currentEditingStudentId);
        }
    }
}