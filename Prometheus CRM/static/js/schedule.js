// crm/static/js/schedule.js

window.initializeSchedulePage = function() {
    // Элементы управления
    const classSelect = document.getElementById('class-select');
    const yearSelect = document.getElementById('year-select');
    const quarterSelect = document.getElementById('quarter-select');
    const loadBtn = document.getElementById('load-schedule-btn');
    const createBtn = document.getElementById('create-schedule-btn');
    const aiGenerateBtn = document.getElementById('ai-generate-btn');

    // Элементы отображения
    const scheduleTitle = document.getElementById('schedule-title');
    const scheduleView = document.getElementById('schedule-view');

    // Элементы редактора
    const editorContainer = document.getElementById('schedule-editor-container');
    const editorClassName = document.getElementById('editor-class-name');
    const editorYear = document.getElementById('editor-year');
    const editorQuarter = document.getElementById('editor-quarter');
    const scheduleTableEditor = document.getElementById('schedule-table-editor');
    const saveBtn = document.getElementById('save-schedule-btn');
    const closeEditorBtn = document.getElementById('close-editor-btn');

    // Хранение текущего состояния
    let currentScheduleData = {};
    let subjects = []; // Будет заполнено при инициализации

    // --- 1. Асинхронная инициализация данных ---
    async function initializeData() {
        try {
            // Параллельно загружаем предметы и классы и ждем завершения обоих запросов
            const [subjectsData, classesResponse] = await Promise.all([
                fetch('/api/subjects').then(res => {
                    if (!res.ok) throw new Error(`Ошибка загрузки предметов: ${res.statusText}`);
                    return res.json();
                }),
                fetch('/api/classes?all=true').then(res => {
                    if (!res.ok) throw new Error(`Ошибка загрузки классов: ${res.statusText}`);
                    return res.json();
                })
            ]);

            subjects = subjectsData || [];

            const classes = Array.isArray(classesResponse.data) ? classesResponse.data : (Array.isArray(classesResponse) ? classesResponse : []);
            if (classes.length > 0) {
                classes.forEach(cls => {
                    const option = document.createElement('option');
                    option.value = cls.id;
                    option.textContent = `${cls.grade_number} ${cls.liter_char}`;
                    classSelect.appendChild(option);
                });
            }
            
            // Только после успешной загрузки данных, активируем фильтры
            [classSelect, yearSelect, quarterSelect].forEach(el => el.addEventListener('change', checkFilters));
            checkFilters(); // Первоначальная проверка для активации кнопок

        } catch (error) {
            console.error("Критическая ошибка при загрузке начальных данных:", error);
            scheduleView.innerHTML = `<p class="text-danger text-center">Не удалось загрузить данные для страницы расписания. ${error.message}</p>`;
        }
    }

    // --- 2. Функции и обработчики ---

    function checkFilters() {
        const allSelected = classSelect.value && yearSelect.value && quarterSelect.value;
        loadBtn.disabled = !allSelected;
        createBtn.disabled = !allSelected;
        aiGenerateBtn.disabled = !allSelected;
        if (!allSelected) {
            scheduleView.innerHTML = '<p>Выберите класс, год и четверть, чтобы загрузить расписание.</p>';
            scheduleTitle.textContent = '';
        }
    }

    function renderTable(container, data, isEditable) {
        container.innerHTML = '';
        const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
        const maxLessons = 8;

        const table = document.createElement('table');
        table.className = 'data-table schedule-view-table';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const headers = ['Урок', ...days];
        headers.forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            headerRow.appendChild(th);
        });

        const tbody = table.createTBody();
        for (let i = 1; i <= maxLessons; i++) {
            const row = tbody.insertRow();
            const lessonNumberCell = row.insertCell();
            lessonNumberCell.textContent = i;

            days.forEach(day => {
                const cell = row.insertCell();
                const lesson = data[day] ? data[day].find(l => l.lesson_number === i) : null;
                
                if (isEditable) {
                    const select = document.createElement('select');
                    select.className = 'form-control subject-select';
                    select.dataset.day = day;
                    select.dataset.lesson = i;

                    let optionsHtml = '<option value="">---</option>';
                    subjects.forEach(subject => {
                        const isSelected = lesson && lesson.subject_id === subject.ID ? 'selected' : '';
                        optionsHtml += `<option value="${subject.ID}" ${isSelected}>${subject.name}</option>`;
                    });
                    select.innerHTML = optionsHtml;
                    cell.appendChild(select);
                } else {
                    cell.textContent = lesson ? lesson.subject_name : '---';
                }
            });
        }
        container.appendChild(table);
    }
    
    loadBtn.addEventListener('click', () => {
        const classId = classSelect.value;
        const year = yearSelect.value;
        const quarter = quarterSelect.value;
        
        scheduleTitle.textContent = `Загрузка...`;
        scheduleView.innerHTML = '<div class="loader"></div>';

        fetch(`/api/schedule?class_id=${classId}&academic_year=${year}&quarter=${quarter}`)
            .then(response => response.json())
            .then(data => {
                const selectedClassText = classSelect.options[classSelect.selectedIndex].text;
                scheduleTitle.textContent = `Расписание для ${selectedClassText} класса, ${quarter} четверть`;
                if (data && data.schedule_data && Object.keys(data.schedule_data).length > 0) {
                    // Пытаемся распарсить, если это строка
                    try {
                        currentScheduleData = typeof data.schedule_data === 'string' ? JSON.parse(data.schedule_data) : data.schedule_data;
                    } catch(e) {
                        console.error("Ошибка парсинга schedule_data:", e);
                        currentScheduleData = {};
                    }
                    renderTable(scheduleView, currentScheduleData, false);
                } else {
                    scheduleView.innerHTML = '<p class="text-center">Расписание еще не создано. Нажмите «Создать/Изменить», чтобы добавить его.</p>';
                    currentScheduleData = {}; 
                }
            })
            .catch(err => {
                scheduleTitle.textContent = 'Ошибка загрузки';
                scheduleView.innerHTML = `<p class="text-danger text-center">Не удалось загрузить расписание. ${err}</p>`;
            });
    });
    
    function openEditor(dataForEdit) {
        if (!dataForEdit || Object.keys(dataForEdit).length === 0) {
            alert('ИИ не вернул данных для расписания. Попробуйте еще раз.');
            return;
        }
        editorClassName.textContent = classSelect.options[classSelect.selectedIndex].text;
        editorYear.textContent = yearSelect.value;
        editorQuarter.textContent = quarterSelect.options[quarterSelect.selectedIndex].text;
        renderTable(scheduleTableEditor, dataForEdit, true);
        editorContainer.style.display = 'block';
        editorContainer.scrollIntoView({ behavior: 'smooth' });
    }

    createBtn.addEventListener('click', () => {
        openEditor(currentScheduleData || {});
    });

    aiGenerateBtn.addEventListener('click', () => {
        aiGenerateBtn.disabled = true;
        aiGenerateBtn.innerHTML = 'Генерация...';
        
        fetch(`/api/schedule/generate-ai?class_id=${classSelect.value}`)
            .then(response => {
                if (!response.ok) throw new Error('Ошибка сети или сервера при генерации');
                return response.json();
            })
            .then(data => {
                openEditor(data);
            })
            .catch(err => {
                alert(`Не удалось сгенерировать расписание: ${err.message}`);
            })
            .finally(() => {
                aiGenerateBtn.disabled = false;
                aiGenerateBtn.innerHTML = '<i class="bi bi-magic"></i> Создать с помощью ИИ';
            });
    });

    saveBtn.addEventListener('click', () => {
        const selects = scheduleTableEditor.querySelectorAll('select.subject-select');
        const dataToSave = {};
        const days = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница"];
        days.forEach(day => { dataToSave[day] = []; });

        selects.forEach(select => {
            const subjectId = select.value;
            if (subjectId) {
                const day = select.dataset.day;
                const lessonNumber = parseInt(select.dataset.lesson);
                const subjectName = subjects.find(s => s.ID == subjectId)?.name || '';
                dataToSave[day].push({
                    lesson_number: lessonNumber,
                    subject_id: parseInt(subjectId),
                    subject_name: subjectName
                });
            }
        });

        // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ ЗДЕСЬ ---
        const payload = {
            class_id: parseInt(classSelect.value, 10),
            academic_year: yearSelect.value,
            quarter: parseInt(quarterSelect.value, 10),
            // Преобразуем объект с расписанием в JSON-строку
            schedule_data: JSON.stringify(dataToSave) 
        };
        
        fetch('/api/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response.ok) return response.json().then(err => { throw new Error(err.error || 'Ошибка сохранения') });
            return response.json();
        })
        .then(() => {
            alert('Расписание успешно сохранено!');
            editorContainer.style.display = 'none';
            loadBtn.click(); 
        })
        .catch(err => alert(`Не удалось сохранить: ${err.message}`));
    });

    closeEditorBtn.addEventListener('click', () => {
        editorContainer.style.display = 'none';
    });
    
    // --- 3. Запускаем инициализацию ---
    initializeData();
};
