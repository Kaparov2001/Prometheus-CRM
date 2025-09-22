// ===================================================================
// Prometheus CRM/static/js/chat.js
// Description: Manages the DRAGGABLE and RESIZABLE popup chat window
// with file and voice message functionality.
// ВЕРСИЯ С ИСПРАВЛЕНИЕМ РЕСАЙЗА И УЛУЧШЕННОЙ ОБРАБОТКОЙ ОШИБОК МИКРОФОНА
// ===================================================================

import { fetchAuthenticated, showAlert } from './utils.js';
import { $user } from './store.js';

let socket = null;
let currentChatId = null;
const dom = {};
let mediaRecorder;
let audioChunks = [];

/**
 * Main initialization function for the chat module.
 */
export function initializeChat() {
    Object.assign(dom, {
        chatSidebar: document.getElementById('chat-sidebar'),
        chatOverlay: document.getElementById('chat-overlay'),
        showChatBtn: document.getElementById('showChatBtn'),
        closeChatSidebarBtn: document.getElementById('closeChatSidebarBtn'),
        chatListContainer: document.getElementById('chat-list-container'),
        popupChatWindow: document.getElementById('popup-chat-window'),
        popupHeader: document.querySelector('.popup-chat-header'),
        popupMessageList: document.getElementById('popup-message-list'),
        popupMessageInput: document.getElementById('popup-message-input'),
        popupSendBtn: document.getElementById('popup-send-btn'),
        popupChatTitle: document.getElementById('popup-chat-title'),
        popupCloseBtn: document.getElementById('popup-close-btn'),
        resizeHandle: document.querySelector('.resize-handle'),
        attachFileBtn: null,
        recordVoiceBtn: null,
    });

    if (!dom.chatSidebar || !dom.popupChatWindow) return;

    createActionButtons();
    bindEventListeners();
}

/**
 * Dynamically creates and injects the action buttons into the input area.
 */
function createActionButtons() {
    const inputArea = document.querySelector('.popup-message-input-area');
    if (!inputArea) return;

    dom.attachFileBtn = document.createElement('button');
    dom.attachFileBtn.id = 'attach-file-btn';
    dom.attachFileBtn.className = 'button-icon';
    dom.attachFileBtn.title = 'Прикрепить файл';
    dom.attachFileBtn.innerHTML = '<i class="bi bi-paperclip"></i>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'chat-file-input';
    fileInput.style.display = 'none';

    dom.recordVoiceBtn = document.createElement('button');
    dom.recordVoiceBtn.id = 'record-voice-btn';
    dom.recordVoiceBtn.className = 'button-icon';
    dom.recordVoiceBtn.title = 'Записать голосовое сообщение';
    dom.recordVoiceBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';

    inputArea.prepend(dom.attachFileBtn, fileInput, dom.recordVoiceBtn);
}


/**
 * Binds all event listeners for the chat UI.
 */
function bindEventListeners() {
    dom.showChatBtn.addEventListener('click', openUserListSidebar);
    dom.closeChatSidebarBtn.addEventListener('click', closeUserListSidebar);
    dom.chatOverlay.addEventListener('click', closeUserListSidebar);
    dom.chatListContainer.addEventListener('click', handleUserSelection);
    dom.popupCloseBtn.addEventListener('click', closeChatWindow);
    dom.popupSendBtn.addEventListener('click', sendMessage);
    dom.popupMessageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    dom.attachFileBtn.addEventListener('click', () => document.getElementById('chat-file-input').click());
    document.getElementById('chat-file-input').addEventListener('change', handleFileUpload);
    dom.recordVoiceBtn.addEventListener('click', toggleVoiceRecording);


    makeDraggable(dom.popupChatWindow, dom.popupHeader);
    makeResizable(dom.popupChatWindow, dom.resizeHandle);
}

// --- Sidebar and Window Management ---

function openUserListSidebar(e) {
    e.preventDefault();
    dom.chatSidebar.classList.add('open');
    dom.chatOverlay.classList.add('active');
    if (!socket) connectWebSocket();
    loadAllUsersForChat();
}

function closeUserListSidebar() {
    dom.chatSidebar.classList.remove('open');
    dom.chatOverlay.classList.remove('active');
}


function openChatWindow() {
    dom.popupChatWindow.classList.add('open');
}

function closeChatWindow() {
    dom.popupChatWindow.classList.remove('open');
    currentChatId = null;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    }
}

async function handleUserSelection(e) {
    const userItem = e.target.closest('.chat-list-item');
    if (!userItem) return;

    const userId = parseInt(userItem.dataset.userId, 10);
    const userName = userItem.dataset.userName;

    closeUserListSidebar();

    if (dom.popupChatWindow.classList.contains('open') && dom.popupChatTitle.textContent.includes(userName)) {
        return;
    }

    try {
        dom.popupMessageList.innerHTML = '<div class="loading-spinner"></div>';
        dom.popupChatTitle.textContent = `Чат с ${userName}`;
        openChatWindow();

        const result = await fetchAuthenticated('/api/chat/rooms', {
            method: 'POST',
            body: JSON.stringify({ type: 'personal', participantIds: [userId] })
        });

        currentChatId = result.chat.ID;

        const messages = await fetchAuthenticated(`/api/chat/rooms/${currentChatId}/messages`);
        renderMessages(messages.reverse() || []);
    } catch (error) {
        showAlert(`Не удалось начать чат: ${error.message}`, 'error');
        closeChatWindow();
    }
}

// --- DRAG & DROP LOGIC ---

function makeDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        if (e.target.closest('.close-button')) {
            return;
        }
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        handle.style.cursor = 'grabbing';
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;

        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        handle.style.cursor = 'grab';
    }
}


// --- RESIZE LOGIC (ИСПРАВЛЕНО) ---

function makeResizable(element, handle) {
    let startX, startY, startWidth, startHeight;

    handle.onmousedown = initResize;

    function initResize(e) {
        e.preventDefault();
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        document.onmousemove = doResize;
        document.onmouseup = stopResize;
    }

    function doResize(e) {
        // Рассчитываем новую ширину и высоту от начальных точек
        const newWidth = startWidth + (e.clientX - startX);
        const newHeight = startHeight + (e.clientY - startY); // <-- ИСПРАВЛЕНО

        // Применяем новые размеры, если они больше минимальных
        if (newWidth > 300) {
            element.style.width = newWidth + 'px';
        }
        if (newHeight > 250) {
            element.style.height = newHeight + 'px';
        }
        // Строка, которая изменяла 'top', удалена, чтобы окно не "уезжало"
    }

    function stopResize() {
        document.onmousemove = null;
        document.onmouseup = null;
    }
}


// --- Файлы и голосовые сообщения (УЛУЧШЕННАЯ ОБРАБОТКА ОШИБОК) ---

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showAlert('Файл слишком большой. Максимальный размер - 10 МБ.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetchAuthenticated('/api/chat/upload', {
            method: 'POST',
            body: formData,
        });

        const message = {
            type: 'newMessage',
            payload: {
                chatId: currentChatId,
                type: 'file',
                content: `Файл: ${response.name}`,
                fileUrl: response.url,
                fileName: response.name,
                fileSize: response.size,
            }
        };
        socket.send(JSON.stringify(message));

    } catch (error) {
        showAlert(`Ошибка загрузки файла: ${error.message}`, 'error');
    } finally {
        event.target.value = '';
    }
}

async function toggleVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        dom.recordVoiceBtn.classList.remove('recording');
        dom.recordVoiceBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
    } else {
        try {
            // Запрашиваем доступ к микрофону
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();
            audioChunks = [];

            dom.recordVoiceBtn.classList.add('recording');
            dom.recordVoiceBtn.innerHTML = '<i class="bi bi-stop-circle-fill"></i>';

            mediaRecorder.addEventListener("dataavailable", event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener("stop", async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();
                const fileName = `voice-message-${new Date().toISOString()}.webm`;
                formData.append('file', audioBlob, fileName);

                try {
                     const response = await fetchAuthenticated('/api/chat/upload', {
                        method: 'POST',
                        body: formData,
                    });

                    const message = {
                        type: 'newMessage',
                        payload: {
                            chatId: currentChatId,
                            type: 'voice',
                            content: `Голосовое сообщение`,
                            fileUrl: response.url,
                            fileName: response.name,
                            fileSize: response.size,
                        }
                    };
                    socket.send(JSON.stringify(message));
                } catch (error) {
                    showAlert(`Ошибка отправки голосового сообщения: ${error.message}`, 'error');
                } finally {
                    // Останавливаем все дорожки, чтобы индикатор записи в браузере погас
                    stream.getTracks().forEach(track => track.stop());
                }
            });
        } catch (err) {
            // ИСПРАВЛЕНО: Более детальная диагностика
            showAlert('Не удалось получить доступ к микрофону. Проверьте разрешения для сайта в настройках браузера.', 'error');
            console.error("Ошибка доступа к микрофону:", err.name, err.message);
        }
    }
}


// --- WebSocket, Data Handling, and Rendering ---

function sendMessage() {
    const content = dom.popupMessageInput.value.trim();
    if (!content || !socket || !currentChatId) return;
    const message = {
        type: 'newMessage',
        payload: {
            chatId: currentChatId,
            content: content,
            type: 'text'
        }
    };
    socket.send(JSON.stringify(message));
    dom.popupMessageInput.value = '';
    dom.popupMessageInput.focus();
}

function connectWebSocket() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/api/chat/ws?token=${token}`);
    socket.onopen = () => console.log('WebSocket established.');
    socket.onmessage = handleIncomingMessage;
    socket.onclose = () => { socket = null; setTimeout(connectWebSocket, 5000); };
    socket.onerror = (error) => console.error('WebSocket error:', error);
}

async function loadAllUsersForChat() {
    try {
        const users = await fetchAuthenticated('/api/chat/users');
        renderUserList(users || []);
    } catch (error) { console.error('Failed to load users:', error); }
}

function handleIncomingMessage(event) {
    const messageData = JSON.parse(event.data);
    if (messageData.type === 'newMessage' && messageData.payload.chatId === currentChatId) {
        const messageEl = createMessageElement(messageData.payload, $user.get().profile.id);
        dom.popupMessageList.appendChild(messageEl);
        dom.popupMessageList.scrollTop = dom.popupMessageList.scrollHeight;
    } else if (messageData.type === 'newMessage') {
        showAlert(`Новое сообщение от ${messageData.payload.user?.fullName || '...'}`, 'info');
    }
}

function renderUserList(users) {
    if (!users) {
        users = [];
    }
    
    // Создаем статичный HTML-блок для ИИ-Ассистента
    const aiAssistantHtml = `
        <div class="chat-list-item" data-user-id="99999" data-user-name="ИИ-Ассистент">
            <div class="chat-avatar">
                <img src="/static/images/ai_avatar.png" alt="ИИ-Ассистент">
            </div>
            <div class="chat-info">
                <div class="chat-info-top">
                    <span class="chat-name">ИИ-Ассистент</span>
                </div>
                <div class="chat-last-message">Ваш помощник по учебе</div>
            </div>
        </div>
    `;

    // Генерируем HTML для остальных пользователей
    const usersHtml = users.map(user => `
        <div class="chat-list-item" data-user-id="${user.ID}" data-user-name="${user.fullName}">
            <div class="chat-avatar"><img src="${user.photoUrl || '/static/placeholder.png'}" alt="${user.fullName}"></div>
            <div class="chat-info">
                 <span class="chat-name">${user.fullName}</span>
            </div>
        </div>
    `).join('');

    // Соединяем ассистента и остальных пользователей
    dom.chatListContainer.innerHTML = aiAssistantHtml + usersHtml;
}

function renderMessages(messages) {
    dom.popupMessageList.innerHTML = '';
    const currentUserID = $user.get().profile.id;
    messages.forEach(msg => {
        const messageEl = createMessageElement(msg, currentUserID);
        dom.popupMessageList.appendChild(messageEl);
    });
    dom.popupMessageList.scrollTop = dom.popupMessageList.scrollHeight;
}

function createMessageElement(msg, currentUserID) {
    const isSent = msg.userId === currentUserID;
    const div = document.createElement('div');
    div.className = `message-group ${isSent ? 'sent' : 'received'}`;

    let contentHtml = '';
    switch (msg.type) {
        case 'file':
            contentHtml = `
                <div class="message-file-attachment">
                    <i class="bi bi-file-earmark-arrow-down"></i>
                    <div>
                        <a href="${msg.fileUrl}" target="_blank" download>${escapeHTML(msg.fileName)}</a>
                        <div style="font-size: 11px; color: var(--text-color-light);">${(msg.fileSize / 1024).toFixed(1)} KB</div>
                    </div>
                </div>`;
            break;
        case 'voice':
            contentHtml = `
                <div class="message-voice-attachment">
                    <audio controls src="${msg.fileUrl}"></audio>
                </div>`;
            break;
        default:
            contentHtml = `<div class="message-content">${escapeHTML(msg.content)}</div>`;
    }

    div.innerHTML = `
        ${!isSent ? `<div class="message-author">${msg.user?.fullName || '...'}</div>` : ''}
        <div class="message-bubble">
            ${contentHtml}
            <div class="message-timestamp">${formatTimestamp(msg.CreatedAt)}</div>
        </div>
    `;
    return div;
}

// --- Helpers ---

function formatTimestamp(isoString) { return isoString ? new Date(isoString).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''; }
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}