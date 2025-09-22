import { fetchAuthenticated, showAlert, populateDropdown } from './utils.js';
import { $user } from './store.js';

// --- Глобальные переменные ---
let activePostType = 'message';
const postsContainer = document.getElementById('newsfeed-posts');
const postTemplate = document.getElementById('news-post-template');
const currentUser = $user.get().profile;
let allUsers = []; // Кэш для списка пользователей

// --- Инициализация редактора и его функций ---
function initializeEditor(editorWrapper) {
    const contentArea = editorWrapper.querySelector('.editor-content');
    const toolbar = editorWrapper.querySelector('.editor-toolbar');

    if (toolbar) {
        toolbar.addEventListener('click', (e) => {
            const button = e.target.closest('.toolbar-btn');
            if (!button) return;
            const command = button.dataset.command;
            if (command) {
                e.preventDefault();
                document.execCommand(command, false, null);
                contentArea.focus();
            }
        });
    }
}

// --- Отображение постов ---
async function displayPosts() {
    try {
        const posts = await fetchAuthenticated('/api/newsfeed');
        postsContainer.innerHTML = '';
        if (!posts || posts.length === 0) {
            postsContainer.innerHTML = `<p class="text-color-secondary text-center">Новостей пока нет. Станьте первым!</p>`;
            return;
        }
        posts.forEach(renderPost);
    } catch (error) {
        showAlert('Не удалось загрузить новости: ' + error.message, 'error');
        postsContainer.innerHTML = `<p class="text-danger text-center">Ошибка загрузки новостей.</p>`;
    }
}

function renderPost(post) {
    const postElement = document.importNode(postTemplate.content, true);
    const postCard = postElement.querySelector('.news-post');
    postCard.dataset.postId = post.ID;

    // --- Заполнение данных автора ---
    postElement.querySelector('.post-author-name').textContent = post.author.fullName || 'Неизвестный автор';
    postElement.querySelector('.post-timestamp').textContent = new Date(post.CreatedAt).toLocaleString('ru-RU');
    postElement.querySelector('.post-author-photo').src = post.author.photoUrl || '/static/placeholder.png';

    // --- Отображение контента ---
    const contentDisplay = postElement.querySelector('.post-content-display');
    if (post.content) {
        contentDisplay.innerHTML = post.content;
    } else {
        contentDisplay.remove();
    }

    // --- Отображение вложений и опросов ---
    const attachmentContainer = postElement.querySelector('.post-attachment');
    if (post.type === 'poll') {
        renderPoll(attachmentContainer, post);
    } else if (post.files && post.files.length > 0) {
        renderFileAttachments(attachmentContainer, post.files);
    }

    // --- Логика прав доступа к действиям ---
    const canDelete = currentUser.id === post.author_id || $user.hasPermission('newsfeed_delete_any_post');
    const canEdit = currentUser.id === post.author_id && post.type === 'message';

    const actionsMenu = postElement.querySelector('.post-actions');
    const dropdown = postElement.querySelector('.action-dropdown-content');

    if (canEdit) {
        const editLink = document.createElement('a');
        editLink.href = '#';
        editLink.className = 'edit-post-btn';
        editLink.innerHTML = `<i class="bi bi-pencil"></i> Редактировать`;
        dropdown.appendChild(editLink);
    }
    if (canDelete) {
        const deleteLink = document.createElement('a');
        deleteLink.href = '#';
        deleteLink.className = 'delete-post-btn';
        deleteLink.innerHTML = `<i class="bi bi-trash"></i> Удалить`;
        dropdown.appendChild(deleteLink);
    }
    if (canEdit || canDelete) {
        actionsMenu.style.display = 'block';
    }

    postsContainer.appendChild(postElement);
}

// --- Функция для рендеринга коллажа ---
function renderFileAttachments(container, files) {
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'attachment-grid';
    grid.dataset.count = files.length > 5 ? '5' : files.length;

    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'attachment-item';

        if (file.file_type === 'image') {
            item.innerHTML = `<img src="${file.file_url}" alt="attachment" class="lightbox-trigger">`;
        } else if (file.file_type === 'video') {
            item.innerHTML = `<video controls src="${file.file_url}"></video>`;
        }
        grid.appendChild(item);
    });
    container.appendChild(grid);
}

function renderPoll(container, post) {
    const totalVotes = post.poll_options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
    const userVoted = post.poll_options.some(opt => opt.votes && opt.votes.some(vote => vote.user_id === currentUser.id));

    const optionsHtml = post.poll_options.map(option => {
        const voteCount = option.votes ? option.votes.length : 0;
        const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
        const isVotedByCurrentUser = option.votes && option.votes.some(vote => vote.user_id === currentUser.id);

        if (userVoted) {
            return `
                <div class="poll-result-item ${isVotedByCurrentUser ? 'voted-by-user' : ''}">
                    <div class="poll-result-text">
                        <span>${option.text}</span>
                        <span>${percentage.toFixed(1)}%</span>
                    </div>
                    <div class="poll-result-bar-wrapper">
                        <div class="poll-result-bar" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        } else {
            return `
                <button class="button-secondary poll-vote-btn" data-option-id="${option.ID}">
                    ${option.text}
                </button>
            `;
        }
    }).join('');

    container.innerHTML = `
        <div class="poll-container">
            <h4 class="poll-question">${post.poll_question}</h4>
            <div class="poll-options">${optionsHtml}</div>
            <div class="poll-footer">Всего голосов: ${totalVotes}</div>
        </div>
    `;
}

// --- Отправка данных ---
async function submitPost() {
    const submitBtn = document.getElementById('submitPostBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Публикация...';

    try {
        if (activePostType === 'event') {
            await submitEvent();
        } else if (activePostType === 'poll') {
            await submitNewsfeedPost();
        } else {
            await submitNewsfeedPost();
        }
    } catch (error) {
        showAlert('Ошибка публикации: ' + error.message, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Опубликовать';
    }
}

async function submitNewsfeedPost() {
    let formElement;
    if (activePostType === 'poll') {
        formElement = document.getElementById('newPollForm');
    } else {
        formElement = document.getElementById('newPostForm');
    }

    const formData = new FormData(formElement);
    formData.set('type', activePostType);

    if (activePostType === 'message') {
        const editor = document.querySelector('#composer-message .editor-content');
        formData.set('content', editor.innerHTML);
    } else if (activePostType === 'poll') {
        const pollEditor = document.querySelector('#composer-poll .editor-content');
        formData.set('content', pollEditor.innerHTML);
    }

    await fetchAuthenticated('/api/newsfeed', { method: 'POST', body: formData });
    showAlert('Пост опубликован!', 'success');
    resetForms();
    await displayPosts();
}

async function submitEvent() {
    const formElement = document.getElementById('newEventForm');
    const formData = new FormData(formElement);
    
    const eventData = {
        title: formData.get('title'),
        description: formData.get('description'),
        start_time: new Date(formData.get('start_time')).toISOString(),
        end_time: new Date(formData.get('end_time')).toISOString(),
        location: formData.get('location'),
        participant_ids: Array.from(document.getElementById('event_participants').selectedOptions).map(opt => Number(opt.value)),
    };

    await fetchAuthenticated('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData)
    });

    const newsContent = `
        <h4>Событие: ${eventData.title}</h4>
        <p>${eventData.description}</p>
        <p><strong>Начало:</strong> ${new Date(eventData.start_time).toLocaleString('ru-RU')}</p>
        <p><strong>Окончание:</strong> ${new Date(eventData.end_time).toLocaleString('ru-RU')}</p>
        ${eventData.location ? `<p><strong>Место:</strong> ${eventData.location}</p>` : ''}
    `;
    
    const newsFormData = new FormData();
    newsFormData.append('type', 'message');
    newsFormData.append('content', newsContent);

    await fetchAuthenticated('/api/newsfeed', {
        method: 'POST',
        body: newsFormData
    });

    showAlert('Событие создано и опубликовано в новостях!', 'success');
    resetForms();
    await displayPosts();
}

function resetForms() {
    document.getElementById('newPostForm')?.reset();
    document.getElementById('newPollForm')?.reset();
    document.getElementById('newEventForm')?.reset();
    
    document.querySelector('#composer-message .editor-content').innerHTML = '';
    document.querySelector('#composer-poll .editor-content').innerHTML = '';
    document.getElementById('image-preview-container').innerHTML = '';
    document.getElementById('file-name-display').textContent = '';
    document.getElementById('event_participants').innerHTML = '';
}

// --- Обработчики событий ---
function setupEventListeners() {
    document.getElementById('submitPostBtn').addEventListener('click', submitPost);

    document.querySelectorAll('.composer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.disabled) return;
            activePostType = tab.dataset.type;
            document.querySelectorAll('.composer-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.composer-content').forEach(c => c.style.display = 'none');
            tab.classList.add('active');
            document.getElementById(`composer-${activePostType}`).style.display = 'block';

            if (activePostType === 'event') {
                populateDropdown(document.getElementById('event_participants'), '/api/users?all=true', 'id', 'fullName', null, 'Выберите участников');
                const selectAllBtn = document.querySelector('#composer-event .select-all-btn');
                selectAllBtn.onclick = () => {
                    document.querySelectorAll('#event_participants option').forEach(o => o.selected = true);
                };
            }
        });
    });

    const fileInput = document.getElementById('post-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', () => {
            const fileNameDisplay = document.getElementById('file-name-display');
            const previewContainer = document.getElementById('image-preview-container');
            previewContainer.innerHTML = '';

            if (fileInput.files.length > 10) {
                showAlert('Можно выбрать не более 10 файлов.', 'warning');
                fileInput.value = '';
                return;
            }

            if (fileInput.files.length > 0) {
                fileNameDisplay.textContent = `${fileInput.files.length} файлов выбрано`;
                for (const file of fileInput.files) {
                    if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const img = document.createElement('img');
                            img.src = e.target.result;
                            img.alt = 'Предпросмотр';
                            previewContainer.appendChild(img);
                        };
                        reader.readAsDataURL(file);
                    }
                }
            } else {
                fileNameDisplay.textContent = '';
            }
        });
    }

    const pollContainer = document.getElementById('poll-options-container');
    document.getElementById('add-poll-option-btn').addEventListener('click', () => {
        const optionCount = pollContainer.children.length + 1;
        const newOption = document.createElement('div');
        newOption.className = 'form-group poll-option';
        newOption.innerHTML = `
            <input type="text" class="form-control" placeholder="Вариант ${optionCount}">
            <button type="button" class="remove-option-btn">&times;</button>
        `;
        pollContainer.appendChild(newOption);
    });
    pollContainer.addEventListener('click', e => {
        if (e.target.classList.contains('remove-option-btn')) {
            if (pollContainer.children.length > 2) e.target.parentElement.remove();
            else showAlert('Должно быть минимум два варианта ответа.', 'warning');
        }
    });

    postsContainer.addEventListener('click', async e => {
        const lightboxTrigger = e.target.closest('.lightbox-trigger');
        if (lightboxTrigger) {
            e.preventDefault();
            showLightbox(lightboxTrigger.src);
            return;
        }

        const postCard = e.target.closest('.news-post');
        if (!postCard) return;
        const postId = postCard.dataset.postId;

        if (e.target.closest('.action-menu-btn')) {
            e.target.closest('.post-actions').classList.toggle('open');
        } else if (!e.target.closest('.post-actions')) {
            document.querySelectorAll('.post-actions.open').forEach(menu => menu.classList.remove('open'));
        }

        if (e.target.closest('.delete-post-btn')) {
            e.preventDefault();
            if (confirm('Вы уверены, что хотите удалить этот пост?')) {
                try {
                    await fetchAuthenticated(`/api/newsfeed/${postId}`, { method: 'DELETE' });
                    showAlert('Пост удален.', 'success');
                    postCard.remove();
                } catch (error) { showAlert('Ошибка удаления: ' + error.message, 'error'); }
            }
        }

        if (e.target.closest('.edit-post-btn')) {
            e.preventDefault();
            const display = postCard.querySelector('.post-content-display');
            const edit = postCard.querySelector('.post-content-edit');
            const editor = edit.querySelector('.editor-content');
            display.style.display = 'none';
            edit.style.display = 'block';
            editor.innerHTML = display.innerHTML;
            initializeEditor(edit);
            editor.focus();
            postCard.querySelector('.post-actions').classList.remove('open');
        }

        if (e.target.closest('.cancel-edit-btn')) {
            postCard.querySelector('.post-content-display').style.display = 'block';
            postCard.querySelector('.post-content-edit').style.display = 'none';
        }

        if (e.target.closest('.save-edit-btn')) {
            const updatedContent = postCard.querySelector('.post-content-edit .editor-content').innerHTML;
            try {
                const updatedPost = await fetchAuthenticated(`/api/newsfeed/${postId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: updatedContent }),
                });
                postCard.querySelector('.post-content-display').innerHTML = updatedPost.content;
                postCard.querySelector('.post-content-display').style.display = 'block';
                postCard.querySelector('.post-content-edit').style.display = 'none';
                showAlert('Пост обновлен!', 'success');
            } catch (error) { showAlert('Не удалось сохранить: ' + error.message, 'error'); }
        }

        if (e.target.closest('.poll-vote-btn')) {
            const optionId = e.target.closest('.poll-vote-btn').dataset.optionId;
            try {
                const updatedPost = await fetchAuthenticated(`/api/newsfeed/${postId}/vote/${optionId}`, { method: 'POST' });
                const newPostElement = document.createElement('div');
                newPostElement.innerHTML = postTemplate.innerHTML;
                postsContainer.insertBefore(newPostElement.firstChild, postCard);
                renderPost(updatedPost);
                postCard.remove();
            } catch (error) {
                showAlert(error.message, 'error');
            }
        }
    });
}

// --- Lightbox ---
function showLightbox(src) {
    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `
        <div class="lightbox-content">
            <span class="lightbox-close">&times;</span>
            <img src="${src}" alt="Просмотр изображения">
        </div>
    `;
    document.body.appendChild(lightbox);

    const close = () => lightbox.remove();
    lightbox.querySelector('.lightbox-close').addEventListener('click', close);
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
            close();
        }
    });
}

// --- Основная функция инициализации ---
window.initializeNewsfeedPage = function() {
    initializeEditor(document.getElementById('post-editor-wrapper'));
    initializeEditor(document.getElementById('composer-poll'));
    setupEventListeners();
    displayPosts();
};