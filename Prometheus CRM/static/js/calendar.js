// ===================================================================
// Prometheus CRM/static/js/calendar.js
// Description: Manages the Calendar page, event display, and modals.
// Depends on: utils.js, FullCalendar library
// ===================================================================

import { fetchAuthenticated, showAlert, openModal, closeModal, populateDropdown } from './utils.js';

/**
 * Вспомогательная функция для динамической загрузки внешних скриптов и стилей.
 * Это гарантирует, что библиотеки FullCalendar будут загружены до того, как мы попытаемся их использовать.
 * @param {string} tag - 'script' или 'link'
 * @param {string} url - URL ресурса
 * @param {string} id - Уникальный ID для элемента, чтобы избежать повторной загрузки
 * @returns {Promise<void>}
 */
function loadResource(tag, url, id) {
    return new Promise((resolve, reject) => {
        if (document.getElementById(id)) {
            return resolve();
        }
        const element = document.createElement(tag);
        element.id = id;

        if (tag === 'script') {
            element.src = url;
            element.async = false; // Гарантируем последовательную загрузку
            element.onload = () => resolve();
            element.onerror = () => reject(new Error(`Failed to load script: ${url}`));
            document.body.appendChild(element);
        } else if (tag === 'link') {
            element.rel = 'stylesheet';
            element.href = url;
            element.onload = () => resolve();
            element.onerror = () => reject(new Error(`Failed to load stylesheet: ${url}`));
            document.head.appendChild(element);
            // Для CSS resolve вызывается сразу, так как его загрузка не блокирует выполнение
            resolve();
        }
    });
}


// --- Глобальные переменные ---
let calendar;
let eventModal, eventForm, modalTitle, closeModalBtn, cancelBtn, deleteBtn;
let allUsers = []; // Кэш для списка пользователей
let currentEditingEvent = null; // Хранит данные редактируемого события

/**
 * Главная функция инициализации страницы календаря.
 * Вызывается из dashboard.js после загрузки calendar.html
 */
window.initializeCalendarPage = async function() {
    try {
        // --- 1. Загружаем зависимости FullCalendar ---
        await loadResource('link', 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css', 'fullcalendar-css');
        await loadResource('script', 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js', 'fullcalendar-js');
        await loadResource('script', 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/locales/ru.js', 'fullcalendar-locale-js');

        // --- 2. Теперь, когда все загружено, инициализируем страницу ---
        const calendarEl = document.getElementById('calendar');
        eventModal = document.getElementById('eventModal'); 
        eventForm = document.getElementById('eventForm');
        modalTitle = document.getElementById('eventModalTitle');
        closeModalBtn = document.getElementById('closeEventModalBtn');
        cancelBtn = document.getElementById('cancelEventBtn');
        deleteBtn = document.getElementById('deleteEventBtn');
        
        if (!calendarEl || !eventModal) {
            console.error("Ключевые элементы для страницы календаря не найдены.");
            return;
        }

        const usersResponse = await fetchAuthenticated('/api/users?all=true');
        allUsers = usersResponse.data || [];

        calendar = new FullCalendar.Calendar(calendarEl, {
            locale: 'ru',
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'
            },
            height: 'auto',
            navLinks: true,
            selectable: true,
            editable: true,
            events: '/api/calendar/events',
            eventClick: (info) => {
                if (info.event.extendedProps.editable === false) {
                    showAlert(`Событие "${info.event.title}" не может быть изменено.`, 'info');
                    return;
                }
                openModalForEdit(info.event);
            },
            select: (selectionInfo) => {
                openModalForCreate(selectionInfo);
            },
            eventDrop: (info) => updateEventTime(info.event, info.revert),
            eventResize: (info) => updateEventTime(info.event, info.revert)
        });

        calendar.render();

        closeModalBtn.addEventListener('click', () => closeModal(eventModal));
        cancelBtn.addEventListener('click', () => closeModal(eventModal));
        deleteBtn.addEventListener('click', handleDeleteEvent);
        eventForm.addEventListener('submit', handleFormSubmit);

    } catch (error) {
        console.error("Failed to load calendar resources:", error);
        showAlert("Не удалось загрузить необходимые для календаря библиотеки.", "error");
        const calendarEl = document.getElementById('calendar');
        if(calendarEl) calendarEl.innerHTML = `<p class="text-danger text-center">Ошибка загрузки календаря.</p>`;
    }
};

function openModalForCreate(selectionInfo) {
    currentEditingEvent = null;
    eventForm.reset();
    modalTitle.textContent = 'Создать событие';
    deleteBtn.style.display = 'none';

    document.getElementById('event_start_time').value = formatDateTimeForInput(selectionInfo.start);
    document.getElementById('event_end_time').value = formatDateTimeForInput(selectionInfo.end);

    populateParticipantsDropdown();
    openModal(eventModal);
}

function openModalForEdit(event) {
    currentEditingEvent = event;
    eventForm.reset();
    modalTitle.textContent = 'Редактировать событие';
    deleteBtn.style.display = 'inline-block';

    document.getElementById('event_title').value = event.title;
    document.getElementById('event_description').value = event.extendedProps.description || '';
    document.getElementById('event_start_time').value = formatDateTimeForInput(event.start);
    document.getElementById('event_end_time').value = formatDateTimeForInput(event.end || event.start);
    document.getElementById('event_location').value = event.extendedProps.location || '';
    
    populateParticipantsDropdown([]); // TODO: Заменить на реальные данные участников
    
    openModal(eventModal);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(eventForm);
    const participantIDs = Array.from(document.getElementById('event_participants').selectedOptions).map(opt => opt.value);

    const data = {
        title: formData.get('title'),
        description: formData.get('description'),
        start_time: new Date(formData.get('start_time')).toISOString(),
        end_time: new Date(formData.get('end_time')).toISOString(),
        location: formData.get('location'),
        participant_ids: participantIDs.map(Number),
    };

    const eventId = currentEditingEvent ? currentEditingEvent.id.replace('event_', '') : null;
    const url = currentEditingEvent ? `/api/calendar/events/${eventId}` : '/api/calendar/events';
    const method = currentEditingEvent ? 'PUT' : 'POST';

    try {
        await fetchAuthenticated(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert(`Событие успешно ${currentEditingEvent ? 'обновлено' : 'создано'}!`, 'success');
        closeModal(eventModal);
        calendar.refetchEvents();
    } catch (error) {
        showAlert(`Ошибка: ${error.message}`, 'error');
    }
}

async function handleDeleteEvent() {
    if (!currentEditingEvent) return;
    const eventId = currentEditingEvent.id.replace('event_', '');
    const confirmed = confirm('Вы уверены, что хотите удалить это событие?');
    if (confirmed) {
        try {
            await fetchAuthenticated(`/api/calendar/events/${eventId}`, { method: 'DELETE' });
            showAlert('Событие удалено.', 'success');
            closeModal(eventModal);
            calendar.refetchEvents();
        } catch (error) {
            showAlert(`Ошибка удаления: ${error.message}`, 'error');
        }
    }
}

async function updateEventTime(event, revertFunc) {
    const data = {
        title: event.title,
        description: event.extendedProps.description || '',
        start_time: event.start.toISOString(),
        end_time: event.end ? event.end.toISOString() : event.start.toISOString(),
        location: event.extendedProps.location || '',
        participant_ids: [] // TODO: Отправлять реальных участников
    };

    try {
        await fetchAuthenticated(`/api/calendar/events/${event.id.replace('event_', '')}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        showAlert('Время события обновлено.', 'success');
    } catch (error) {
        showAlert(`Ошибка обновления времени: ${error.message}`, 'error');
        revertFunc();
    }
}

function populateParticipantsDropdown(selectedIDs = []) {
    const select = document.getElementById('event_participants');
    select.innerHTML = '';
    
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.fullName;
        if (selectedIDs.includes(user.id)) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function formatDateTimeForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}
