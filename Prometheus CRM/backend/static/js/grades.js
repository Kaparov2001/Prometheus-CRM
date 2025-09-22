// static/js/grades.js
import {
    fetchAuthenticated,
    openModal,
    closeModal,
    showAlert,
    showConfirm,
    populateDropdown,
    initializeActionDropdowns
} from './utils.js';

// --- Глобальные переменные ---
let gradeModal, gradeForm, modalTitle, gradesTableBody, addAssignmentBtn, assignmentsTableBody;
let currentEditingId = null;
let allUsers = []; // Кэш для списка всех пользователей, чтобы не загружать каждый раз

/**
 * Главная функция инициализации страницы.
 */
window.initializeGradesPage = function() {
    // Получаем DOM элементы
    gradeModal = document.getElementById('gradeModal');
    gradeForm = document.getElementById('gradeForm');
    modalTitle = gradeModal ? gradeModal.querySelector('.modal-header h4') : null;
    gradesTableBody = document.getElementById("gradesTableBody");
    const addGradeBtn = document.getElementById('addGradeBtn');
    const closeGradeModalBtn = document.getElementById('closeGradeModalBtn');
    const cancelGradeBtn = document.getElementById('cancelGradeBtn');
    addAssignmentBtn = document.getElementById('addAssignmentBtn');
    assignmentsTableBody = document.getElementById('assignmentsTableBody');

    // Проверка наличия элементов
    if (!gradeModal || !gradeForm || !addGradeBtn || !gradesTableBody || !modalTitle || !addAssignmentBtn) {
        console.error("Ключевые элементы для страницы Классов не найдены. Инициализация прервана.");
        return;
    }

    // --- Навешиваем события ---
    addGradeBtn.addEventListener('click', openModalForCreate);
    closeGradeModalBtn.addEventListener('click', () => closeModal(gradeModal, () => gradeForm.reset()));
    cancelGradeBtn.addEventListener('click', () => closeModal(gradeModal, () => gradeForm.reset()));
    gradeForm.addEventListener('submit', handleFormSubmit);
    gradesTableBody.addEventListener('click', handleTableActions);
    addAssignmentBtn.addEventListener('click', () => addAssignmentRow());

    // Предзагружаем список пользователей для выпадающих списков
    preloadAllUsers();
    // Загружаем и отображаем классы
    fetchAndRenderGrades();
};

/**
 * Предзагружает и кэширует список всех пользователей.
 */
async function preloadAllUsers() {
    try {
        // ИЗМЕНЕНИЕ: Добавляем ?all=true к запросу
        const response = await fetchAuthenticated("/api/users?all=true");
        allUsers = response.data || [];
    } catch (error) {
        showAlert('Не удалось загрузить список сотрудников для назначения.', 'error');
    }
}

/**
 * Загружает и отображает список классов.
 */
async function fetchAndRenderGrades() {
    gradesTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Загрузка данных...</td></tr>`;
    try {
        const response = await fetchAuthenticated("/api/classes");
        const grades = response.data || [];

        if (grades.length > 0) {
            gradesTableBody.innerHTML = grades.map(g => {
                const teachers = Array.isArray(g.teachers) && g.teachers[0] !== 'Не назначен' 
                    ? g.teachers.join(', ') 
                    : 'Не назначен';

                return `
                <tr data-id="${g.id}">
                    <td data-label="Действия" class="text-center">
                        <div class="action-dropdown">
                            <button class="action-button">Действия <i class="bi bi-chevron-down"></i></button>
                            <div class="action-dropdown-content">
                                <a href="#" class="edit-grade-btn" data-id="${g.id}"><i class="bi bi-pencil"></i> Изменить</a>
                                <a href="#" class="delete-grade-btn" data-id="${g.id}"><i class="bi bi-trash"></i> Удалить</a>
                            </div>
                        </div>
                    </td>
                    <td data-label="Класс">${g.grade_number}</td>
                    <td data-label="Литер">${g.liter_char}</td>
                    <td data-label="Кол-во учеников">${g.student_count || 0}</td>
                    <td data-label="Сотрудники">${teachers}</td>
                    <td data-label="Тип обучения">${g.study_type || '—'}</td>
                    <td data-label="Язык обучения">${g.language || '—'}</td>
                </tr>`;
            }).join('');
        } else {
            gradesTableBody.innerHTML = `<tr><td colspan="7" class="text-center">Классы еще не созданы.</td></tr>`;
        }
        initializeActionDropdowns();
        window.updateTableActionsVisibility();
    } catch (error) {
        gradesTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Не удалось загрузить список классов: ${error.message}</td></tr>`;
    }
}

/**
 * Открывает модальное окно для создания нового класса.
 */
function openModalForCreate() {
    currentEditingId = null;
    modalTitle.innerText = "Создать класс";
    gradeForm.reset();
    assignmentsTableBody.innerHTML = ''; // Очищаем таблицу с назначениями
    addAssignmentRow(); // Добавляем одну пустую строку для удобства
    openModal(gradeModal);
}

/**
 * Открывает модальное окно для редактирования существующего класса.
 */
async function openModalForEdit(id) {
    currentEditingId = id;
    modalTitle.innerText = "Изменить класс";
    gradeForm.reset();
    assignmentsTableBody.innerHTML = ''; // Очищаем старые данные

    try {
        const classData = await fetchAuthenticated(`/api/classes/${id}`);
        // Заполняем основные поля формы
        gradeForm.elements.gradeNumber.value = classData.grade_number;
        gradeForm.elements.gradeLiter.value = classData.liter_char;
        gradeForm.elements.studyType.value = classData.study_type;
        gradeForm.elements.language.value = classData.language;

        // Динамически создаем строки для каждого назначения
        if (classData.assignments && classData.assignments.length > 0) {
            classData.assignments.forEach(assignment => {
                addAssignmentRow(assignment);
            });
        }

        openModal(gradeModal);
    } catch (error) {
        showAlert(`Ошибка при загрузке данных класса: ${error.message}`, 'error');
    }
}

/**
 * Добавляет новую строку для назначения сотрудника в модальном окне.
 */
function addAssignmentRow(assignment = {}) {
    const row = document.createElement('tr');
    
    // Создаем выпадающий список пользователей
    const userSelect = document.createElement('select');
    userSelect.className = 'user-select form-control'; // Добавлен класс для стилизации
    userSelect.innerHTML = '<option value="">Выберите сотрудника</option>';
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.fullName;
        if (assignment.userId === user.id) {
            option.selected = true;
        }
        userSelect.appendChild(option);
    });

    // Создаем поле для роли
    const roleInput = document.createElement('input');
    roleInput.type = 'text';
    roleInput.className = 'role-in-class-input form-control'; // Добавлен класс для стилизации
    roleInput.placeholder = 'Например, Ассистент';
    roleInput.value = assignment.roleInClass || '';

    row.innerHTML = `
        <td><div class="form-group"></div></td>
        <td><div class="form-group"></div></td>
        <td class="text-center">
            <button type="button" class="remove-assignment-btn" title="Удалить"><i class="bi bi-trash"></i></button>
        </td>
    `;

    row.querySelector('td:nth-child(1) .form-group').appendChild(userSelect);
    row.querySelector('td:nth-child(2) .form-group').appendChild(roleInput);

    // Добавляем обработчик для кнопки удаления
    row.querySelector('.remove-assignment-btn').addEventListener('click', () => {
        row.remove();
    });

    assignmentsTableBody.appendChild(row);
}

/**
 * Обрабатывает отправку формы (создание/обновление).
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const assignments = [];
    const assignmentRows = assignmentsTableBody.querySelectorAll('tr');
    for (const row of assignmentRows) {
        const userId = row.querySelector('.user-select').value;
        const roleInClass = row.querySelector('.role-in-class-input').value.trim();
        
        if (userId && roleInClass) {
            assignments.push({
                userId: parseInt(userId, 10),
                roleInClass: roleInClass
            });
        }
    }

    const data = {
        grade_number: parseInt(gradeForm.elements.gradeNumber.value, 10),
        liter_char: gradeForm.elements.gradeLiter.value,
        study_type: gradeForm.elements.studyType.value,
        language: gradeForm.elements.language.value,
        assignments: assignments
    };

    const url = currentEditingId ? `/api/classes/${currentEditingId}` : '/api/classes';
    const method = currentEditingId ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        showAlert(`Класс успешно ${currentEditingId ? 'обновлен' : 'создан'}!`, 'success');
        closeModal(gradeModal, () => gradeForm.reset());
        fetchAndRenderGrades();
    } catch (error) {
        showAlert(`Ошибка при сохранении класса: ${error.message}`, 'error');
    }
}

/**
 * Обрабатывает удаление класса.
 */
async function handleDelete(id) {
    const confirmed = await showConfirm(`Вы уверены, что хотите удалить класс ID ${id}? Это действие нельзя отменить.`);
    if (!confirmed) return;

    try {
        await fetchAuthenticated(`/api/classes/${id}`, { method: 'DELETE' });
        showAlert('Класс успешно удален.', 'success');
        fetchAndRenderGrades();
    } catch (error) {
        showAlert(`Ошибка при удалении класса: ${error.message}`, 'error');
    }
}

/**
 * Обрабатывает клики на кнопках в таблице (делегирование событий).
 */
function handleTableActions(e) {
    const editBtn = e.target.closest('.edit-grade-btn');
    const deleteBtn = e.target.closest('.delete-grade-btn');

    if (editBtn) {
        e.preventDefault();
        openModalForEdit(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        handleDelete(deleteBtn.dataset.id);
    }
}