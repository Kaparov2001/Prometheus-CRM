// ===================================================================
// Prometheus CRM/static/js/dashboard.js
// Description: Main script for the CRM dashboard, handling layout,
// navigation, dynamic content loading, and user profile management.
// Depends on: utils.js, chat.js, and other page-specific JS files.
// ===================================================================

import { fetchAuthenticated, showAlert, openModal, closeModal, setupPhotoPreview, showBrowserNotification } from './utils.js';
import { $user, setUserProfile } from './store.js';
import { initializeChat } from './chat.js';

// Global DOM elements
const pageTitle = document.getElementById("pageTitle");
const contentArea = document.getElementById("contentArea");
const logoutBtn = document.getElementById("logoutBtn");

// Profile modal elements
const profileLink = document.getElementById("userProfileLink");
const editProfileModal = document.getElementById('editProfileModal');
const editProfileForm = document.getElementById('editProfileForm');
const closeProfileBtn = document.getElementById('closeProfileModalBtn');
const cancelProfileBtn = document.getElementById('cancelProfileBtn');
const profilePhotoInput = document.getElementById('profilePhotoInput');
const profilePhotoPreview = document.getElementById('profilePhotoPreview');


/**
 * Запрашивает с сервера количество заявок для каждого раздела
 * и обновляет значки в боковом меню и показывает браузерные уведомления.
 */
async function updateNotifications() {
    try {
        const counts = await fetchAuthenticated('/api/invoices/counts');
        let totalNotifications = 0;

        // Внутренняя функция для обновления значка
        const updateBadge = (badgeId, count) => {
            const badge = document.getElementById(badgeId);
            if (badge) {
                const countNum = parseInt(count, 10) || 0;
                if (countNum > 0) {
                    badge.textContent = countNum;
                    badge.classList.add('visible');
                    totalNotifications += countNum;
                } else {
                    badge.classList.remove('visible');
                }
            }
        };

        updateBadge('myInvoicesBadge', counts.my_invoices);
        updateBadge('financeBadge', counts.finance_queue);
        updateBadge('accountingBadge', counts.accounting_queue);
        updateBadge('chatBadge', counts.unread_chats);

        // Показываем браузерное уведомление, если есть новые задачи
        if (totalNotifications > 0) {
            showBrowserNotification('Prometheus CRM: Новые задачи', `У вас есть ${totalNotifications} непросмотренных задач.`);
        }

    } catch (error) {
        console.error("Не удалось обновить уведомления:", error);
    }
}


document.addEventListener('DOMContentLoaded', async function() {
    console.log("DOM fully loaded. Initializing dashboard.");
    await loadInitialProfileData();

    // --- 1. Authentication Check ---
    // The `fetchAuthenticated` utility will handle redirects if no token is found.
    // We rely on it for all API calls.

    // --- 2. Sidebar Logic ---
    const sidebar = document.querySelector('.sidebar');
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');

    if (sidebar && sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (sidebar.classList.contains('collapsed')) {
                document.querySelectorAll('.nav-group.open').forEach(group => {
                    group.classList.remove('open');
                    const links = group.querySelector('.nav-group-links');
                    if (links) links.style.maxHeight = null;
                });
            }
        });
    }

    const navGroups = document.querySelectorAll('.nav-group-toggle');
    navGroups.forEach(function(toggle) {
        toggle.addEventListener('click', function() {
            if (sidebar && sidebar.classList.contains('collapsed')) {
                // В свернутом режиме не открываем подменю, кроме чата
                if (toggle.id === 'showChatBtn') {
                    // Логика открытия чата может быть здесь или в его собственном модуле
                    return;
                }
                return;
            }
            // Закрываем все другие группы
            navGroups.forEach(function(otherToggle) {
                if (otherToggle !== toggle) {
                    otherToggle.parentElement.classList.remove('open');
                    const otherLinks = otherToggle.nextElementSibling;
                    if (otherLinks) {
                        otherLinks.style.maxHeight = null;
                    }
                }
            });
            // Открываем/закрываем текущую группу
            const group = this.parentElement;
            const links = this.nextElementSibling;

            if (links && links.classList.contains('nav-group-links')) {
                group.classList.toggle('open');
                if (group.classList.contains('open')) {
                    links.style.maxHeight = links.scrollHeight + "px";
                } else {
                    links.style.maxHeight = null;
                }
            }
        });
    });

    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            navLinks.forEach(l => l.classList.remove('active'));
            e.currentTarget.classList.add('active');
        });
    });

    // --- 3. Dynamic Content Loading ---

    /**
     * Updates the visibility of navigation links based on user permissions.
     */
    function updateNavigationVisibility() {
        console.log('%c--- ЗАПУСК ПРОВЕРКИ ВИДИМОСТИ МЕНЮ ---', 'color: blue; font-weight: bold;');
        
        const navLinkPermissionsMap = {
            '#showSubmitInvoicePage': 'invoices_submit',
            '#showMyInvoicesPage': 'invoices_view_own',
            '#showFinanceInvoicesPage': 'invoices_view_finance',
            '#showAccountingInvoicesPage': 'invoices_view_accounting',
            '#showAllInvoicesPage': 'invoices_view_all',
            '#showStudents': 'students_view',
            '#showGrades': 'classes_view',
            '#showContracts': 'contracts_view',
            '#showNationalities': 'nationalities_view',
            '#showPermissions': 'roles_view',
            '#showPaymentForms': 'payment_forms_view',
            '#showContractTemplates': 'contract_templates_view',
            '#showBudget': 'view_budget',
            '#showSchedule': 'schedules_view',
            '#showRoles': 'roles_view',
            '#showUsers': 'users_view',
            '#showIntegrations': 'integrations_view',
            '#showPlannedPayments': 'planned_payments_view',
            '#showActualPayments': 'actual_payments_view',
            // --- ДОБАВЛЕНА НОВАЯ СТРОКА ---
            '#showPaymentReconciliation': 'payment_reconciliation_view',
            // --- ДОБАВЛЕНА СТРАНИЦА СТОИМОСТИ ОБУЧЕНИЯ ---
            '#showTuitionFees': 'tuition_fees_view'
        };
    
        console.log('%c--- Шаг 1: Проверка отдельных ссылок... ---', 'color: green;');
        for (const selector in navLinkPermissionsMap) {
            const element = document.querySelector(selector);
            const requiredPermission = navLinkPermissionsMap[selector];
            
            // --- ИСПРАВЛЕНИЕ: Проверяем, существует ли элемент, перед тем как что-то с ним делать ---
            if (element) {
                const hasAccess = $user.hasPermission(requiredPermission);
                console.log(`Ссылка ${selector}: требует право '${requiredPermission}'. Доступ есть? -> ${hasAccess}`);
                element.style.display = hasAccess ? 'flex' : 'none';
            }
            // Если элемент не найден (например, на другой странице), мы просто игнорируем его, 
            // не вызывая ошибку или предупреждение.
        }
    
        console.log('%c--- Шаг 2: Проверка групп меню... ---', 'color: orange;');
        document.querySelectorAll('.nav-group').forEach(group => {
            const visibleLinks = group.querySelectorAll('.nav-link[style*="display: flex"]');
            
            console.log(`Группа #${group.id || '(без id)'}: Найдено видимых ссылок: ${visibleLinks.length}`);
            
            if (visibleLinks.length > 0) {
                group.style.display = 'block';
            } else {
                // Не скрываем группы, в которых есть всегда видимые элементы (Новости, Чат, Календарь)
                if (!group.querySelector('#showNewsfeed, #showChatBtn, #showCalendar')) {
                    group.style.display = 'none';
                }
            }
        });
    
        console.log('%c--- ПРОВЕРКА ВИДИМОСТИ МЕНЮ ЗАВЕРШЕНА ---', 'color: blue; font-weight: bold;');
    }
    
    /**
     * Updates visibility of action buttons (like 'Add Student') based on permissions.
     */
    window.updateButtonVisibility = function() {
        const buttonPermissionsMap = {
            '#addStudentBtn': ['students_create'],
            '#addGradeBtn': ['classes_create'],
            '#addUserBtn': ['users_create'],
            '#addContractBtn': ['contracts_create'],
            '#addRoleBtn': ['roles_create'],
            '#addPermissionBtn': ['roles_create'],
            '#addNationalityBtn': ['nationalities_create'],
            '#addPaymentFormBtn': ['payment_forms_create'],
            '#addTemplateBtn': ['contract_templates_create'],
            // Add other buttons here
        };

        for (const selector in buttonPermissionsMap) {
            const element = document.querySelector(selector);
            if (element) {
                const required = buttonPermissionsMap[selector];
                const hasAccess = required.some(p => $user.hasPermission(p));
                element.style.display = hasAccess ? 'inline-flex' : 'none';
            }
        }
    }

    /**
     * Updates visibility of actions within data tables (edit/delete buttons).
     */
    window.updateTableActionsVisibility = function() {
        const actionPermissionsMap = {
            '.edit-student-btn': 'students_edit',
            '.delete-student-btn': 'students_delete',
            '.edit-grade-btn': 'classes_edit',
            '.delete-grade-btn': 'classes_delete',
            '.edit-user-btn': 'users_edit',
            '.delete-user-btn': 'users_delete',
            '.edit-role-btn': 'roles_edit',
            '.delete-role-btn': 'roles_delete',
            '.edit-permission-btn': 'roles_edit',
            '.delete-permission-btn': 'roles_delete',
            '.edit-nationality-btn': 'nationalities_edit',
            '.delete-nationality-btn': 'nationalities_delete',
            '.edit-contract-btn': 'contracts_edit',
            '.delete-contract-btn': 'contracts_delete',
            '.edit-payment-form-btn': 'payment_forms_edit',
            '.delete-payment-form-btn': 'payment_forms_delete',
            '.edit-contract-template-btn': 'contract_templates_edit',
            '.delete-contract-template-btn': 'contract_templates_delete',
        };

        for (const selector in actionPermissionsMap) {
            document.querySelectorAll(selector).forEach(button => {
                if (!$user.hasPermission(actionPermissionsMap[selector])) {
                    button.remove();
                }
            });
        }

        // Clean up empty dropdowns
        document.querySelectorAll('.action-dropdown-content').forEach(content => {
            if (content.children.length === 0) {
                const dropdown = content.closest('.action-dropdown');
                if (dropdown) {
                    dropdown.innerHTML = 'Нет доступа';
                }
            }
        });
    };

    /**
     * Loads HTML, JS, and CSS for a specific page into the content area.
     * @param {string} htmlUrl - The path to the HTML template file.
     * @param {string|null} jsUrl - The path to the page-specific JavaScript module.
     * @param {string|null} cssUrl - The path to the page-specific CSS file.
     * @param {string|null} callbackName - The name of the initialization function to call after the script loads.
     */
    async function loadContent(htmlUrl, jsUrl = null, cssUrl = null, callbackName = null) {
        try {
            const response = await fetch(htmlUrl);
            if (!response.ok) {
                throw new Error(`Failed to load HTML from ${htmlUrl}: ${response.statusText}`);
            }
            contentArea.innerHTML = await response.text();
            window.updateButtonVisibility(); // Update buttons as soon as new content is in DOM

            // Remove old dynamic CSS
            const oldDynamicCss = document.getElementById('dynamic-page-css');
            if (oldDynamicCss) oldDynamicCss.remove();

            // Add new dynamic CSS if provided
            if (cssUrl) {
                const link = document.createElement('link');
                link.id = 'dynamic-page-css';
                link.rel = 'stylesheet';
                link.href = cssUrl;
                document.head.appendChild(link);
            }

            // Remove old dynamic JS module
            const oldDynamicJs = document.getElementById('dynamic-page-js');
            if (oldDynamicJs) oldDynamicJs.remove();

            // Load new JS module if provided
            if (jsUrl) {
                const script = document.createElement('script');
                script.id = 'dynamic-page-js';
                script.type = 'module';
                script.src = jsUrl;
                script.onload = () => {
                    if (callbackName && typeof window[callbackName] === 'function') {
                        window[callbackName]();
                    }
                };
                script.onerror = (e) => {
                    console.error(`Error loading dynamic script ${jsUrl}:`, e);
                    showAlert(`Ошибка загрузки скрипта для страницы: ${jsUrl}`, 'error');
                };
                document.body.appendChild(script);
            } else if (callbackName && typeof window[callbackName] === 'function') {
                // If no JS file, but a callback exists (e.g., for simple pages)
                window[callbackName]();
            }
        } catch (error) {
            console.error("Ошибка загрузки контента:", error);
            contentArea.innerHTML = `<div class="card"><div class="card-body text-center text-danger">Не удалось загрузить страницу: ${error.message}</div></div>`;
            showAlert(`Не удалось загрузить страницу: ${error.message}`, 'error');
        }
    }

    // --- 4. Page Load Functions ---

    window.loadNewsfeedPage = () => {
        pageTitle.innerText = "Новости";
        loadContent('/static/html/newsfeed.html', '/static/js/newsfeed.js', '/static/css/newsfeed.css', 'initializeNewsfeedPage');
    };
    window.loadSubmitInvoicePage = () => {
        pageTitle.innerText = "Счета на оплату";
        loadContent('/static/html/submit-invoice.html', '/static/js/submit-invoice.js', null, 'initializeSubmitInvoicePage');
    };
    window.loadMyInvoicesPage = () => {
        pageTitle.innerText = "Мои заявления";
        loadContent('/static/html/my-invoices.html', '/static/js/my-invoices.js', null, 'initializeMyInvoicesPage');
    };
    window.loadFinanceInvoicesPage = () => {
        pageTitle.innerText = "Поручения: Фин. отдел";
        loadContent('/static/html/finance-invoices.html', '/static/js/finance-invoices.js', null, 'initializeFinanceInvoicesPage');
    };
    window.loadAccountingInvoicesPage = () => {
        pageTitle.innerText = "Поручения: Бухгалтерия";
        loadContent('/static/html/accounting-invoices.html', '/static/js/accounting-invoices.js', null, 'initializeAccountingInvoicesPage');
    };
    window.loadAllInvoicesPage = () => {
        pageTitle.innerText = "Все поданные заявления";
        loadContent('/static/html/all-invoices.html', '/static/js/all-invoices.js', null, 'initializeAllInvoicesPage');
    };
    window.loadStudentsPage = () => {
        pageTitle.innerText = "Ученики";
        loadContent('/static/html/students.html', '/static/js/students.js', '/static/css/students.css', 'initializeStudentsPage');
    };
    window.loadGradesPage = () => {
        pageTitle.innerText = "Классы";
        loadContent('/static/html/grades.html', '/static/js/grades.js', '/static/css/grades.css', 'initializeGradesPage');
    };
    window.showUsers = () => {
        pageTitle.innerText = "Пользователи";
        loadContent('/static/html/users.html', '/static/js/users.js', null, 'initializeUsersPage');
    };
    window.loadContractsPage = () => {
        pageTitle.innerText = "Договоры";
        loadContent('/static/html/contracts.html', '/static/js/contracts.js', '/static/css/contracts.css', 'initializeContractsPage');
    };
    
    window.loadPlannedPaymentsPage = () => {
        pageTitle.innerText = "План платежей";
        loadContent('/static/html/planned_payments.html', '/static/js/planned_payments.js', null, 'initializePlannedPaymentsPage');
    };
    
    window.loadActualPaymentsPage = () => {
        pageTitle.innerText = "Оплаты факт";
        loadContent('/static/html/payment_fact.html', '/static/js/payment_fact.js', '/static/css/payment_fact.css', 'initializePaymentFactPage');
    };

    // === ИЗМЕНЕННАЯ ФУНКЦИЯ ===
    window.loadPaymentReconciliationPage = () => {
        pageTitle.innerText = "Сверка платежей";
        loadContent('/static/html/payment_reconciliation.html', '/static/js/payment_reconciliation.js', '/static/css/payment_reconciliation.css', 'initializePaymentReconciliationPage');
    };

    window.loadPaymentReportPage = () => {
        pageTitle.innerText = "Отчет по оплатам";
        contentArea.innerHTML = `<div class="card"><div class="card-body text-center"><h2>Страница в разработке</h2><p>Этот раздел скоро появится.</p></div></div>`;
    };
    window.showRoles = () => {
        pageTitle.innerText = "Роли";
        loadContent('/static/html/roles.html', '/static/js/roles.js', null, 'initializeRolesPage');
    };
    window.loadNationalitiesPage = () => {
        pageTitle.innerText = "Национальности";
        loadContent('/static/html/nationalities.html', '/static/js/nationalities.js', null, 'initializeNationalitiesPage');
    };
    window.showPermissions = () => {
        pageTitle.innerText = "Права доступа";
        loadContent('/static/html/permissions.html', '/static/js/permissions.js', null, 'initializePermissionsPage');
    };
    window.loadPaymentFormsPage = () => {
        pageTitle.innerText = "Формы оплаты";
        loadContent('/static/html/payment_forms.html', '/static/js/payment_forms.js', null, 'initializePaymentFormsPage');
    };
    window.loadContractTemplatesPage = () => {
        pageTitle.innerText = "Шаблоны договоров";
        loadContent('/static/html/contract_templates.html', '/static/js/contract_templates.js', '/static/css/contract_templates.css', 'initializeContractTemplatesPage');
    };
    window.loadBudgetPage = () => {
        pageTitle.innerText = "Управление бюджетом";
        loadContent('/static/html/budget.html', '/static/js/budget.js', null, 'initializeBudgetPage');
    };
    window.loadSchedulePage = () => {
        pageTitle.innerText = "Расписание";
        loadContent('/static/html/schedule.html', '/static/js/schedule.js', null, 'initializeSchedulePage');
    };
    
    window.loadCalendarPage = () => {
        pageTitle.innerText = "Календарь";
        loadContent('/static/html/calendar.html', '/static/js/calendar.js', '/static/css/calendars.css', 'initializeCalendarPage');
    };

    window.loadIntegrationsPage = () => {
        pageTitle.innerText = "Интеграции";
        loadContent('/static/html/integrations.html', '/static/js/integrations.js', null, 'initializeIntegrationsPage');
    };

    // --- НОВОЕ: СТРАНИЦА "СТОИМОСТЬ ОБУЧЕНИЯ" ---
    window.loadTuitionFeesPage = () => {
        pageTitle.innerText = "Стоимость обучения";
        loadContent('/static/html/tuition_fees.html', '/static/js/tuition_fees.js', '/static/css/tuition_fees.css', 'initializeTuitionFeesPage');
    };
    

    // --- 5. User Profile & Logout Logic ---
    function logout() {
        localStorage.removeItem('token');
        document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC";
        window.location.href = '/';
    }

    profileLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const user = await fetchAuthenticated('/api/profile');
            document.getElementById('profile_fullName').value = user.fullName || '';
            document.getElementById('profile_iin').value = user.iin || '';
            document.getElementById('profile_email').value = user.email || '';
            document.getElementById('profile_phone').value = user.phone || '';

            setupPhotoPreview(profilePhotoInput, profilePhotoPreview, user.photoUrl || '/static/placeholder.png');
            openModal(editProfileModal);
        } catch (error) {
            showAlert('Ошибка загрузки профиля: ' + error.message, 'error');
        }
    });

    closeProfileBtn?.addEventListener('click', () => closeModal(editProfileModal));
    cancelProfileBtn?.addEventListener('click', () => closeModal(editProfileModal));

    editProfileForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(editProfileForm);
        try {
            const result = await fetchAuthenticated('/api/profile', {
                method: 'PUT',
                body: formData,
            });
            showAlert('Профиль успешно обновлен!', 'success');
            closeModal(editProfileModal);
            if (result.user && result.user.photoUrl) {
                const cacheBustedUrl = `${result.user.photoUrl}?t=${new Date().getTime()}`;
                document.getElementById('userProfilePhoto').src = cacheBustedUrl;
            }
            if (result.user && result.user.login) {
                document.getElementById('userEmail').innerText = result.user.login;
            }
        } catch (error) {
            showAlert('Ошибка сохранения профиля: ' + error.message, 'error');
        }
    });

    /**
     * Loads the initial user profile data when the dashboard loads.
     * This is crucial for setting up the UI and permissions.
     */
    async function loadInitialProfileData() {
        try {
            const profileData = await fetchAuthenticated('/api/profile');
            setUserProfile(profileData);
            document.getElementById('userProfilePhoto').src = $user.get().profile.photoUrl || '/static/placeholder.png';
            document.getElementById('userEmail').innerText = $user.get().profile.login || 'Пользователь';
            
            updateNavigationVisibility();
    
            // Request notification permission if not already granted or denied
            if (Notification.permission === 'default') {
                setTimeout(() => Notification.requestPermission(), 2000);
            }
            // Fetch initial notifications and set up polling
            updateNotifications();
            setInterval(updateNotifications, 120000); // Poll every 2 minutes
    
        } catch (e) {
            // This is a critical error, likely means the token is invalid or server is down.
            // fetchAuthenticated should handle the redirect, but we log it just in case.
            console.error("Ошибка при загрузке начальных данных профиля:", e);
        }
    }

    // --- 6. Initial Setup and Event Listeners ---

    initializeChat();

    // Attach event listeners to navigation links
    document.getElementById("showNewsfeed")?.addEventListener('click', (e) => { e.preventDefault(); window.loadNewsfeedPage(); });
    document.getElementById("showSubmitInvoicePage")?.addEventListener('click', (e) => { e.preventDefault(); window.loadSubmitInvoicePage(); });
    document.getElementById("showMyInvoicesPage")?.addEventListener('click', (e) => { e.preventDefault(); window.loadMyInvoicesPage(); });
    document.getElementById("showFinanceInvoicesPage")?.addEventListener('click', (e) => { e.preventDefault(); window.loadFinanceInvoicesPage(); });
    document.getElementById("showAccountingInvoicesPage")?.addEventListener('click', (e) => { e.preventDefault(); window.loadAccountingInvoicesPage(); });
    // This listener is for the button INSIDE the content area on the finance/accounting pages
    document.getElementById('contentArea').addEventListener('click', (e) => {
        if (e.target && e.target.id === 'showAllInvoicesBtn') {
            e.preventDefault();
            window.loadAllInvoicesPage();
        }
    });
    document.getElementById("showStudents")?.addEventListener('click', (e) => { e.preventDefault(); window.loadStudentsPage(); });
    document.getElementById("showGrades")?.addEventListener('click', (e) => { e.preventDefault(); window.loadGradesPage(); });
    document.getElementById("showUsers")?.addEventListener('click', (e) => { e.preventDefault(); window.showUsers(); });
    document.getElementById("showContracts")?.addEventListener('click', (e) => { e.preventDefault(); window.loadContractsPage(); });
    document.getElementById("showRoles")?.addEventListener('click', (e) => { e.preventDefault(); window.showRoles(); });
    document.getElementById("showNationalities")?.addEventListener('click', (e) => { e.preventDefault(); window.loadNationalitiesPage(); });
    document.getElementById("showPaymentForms")?.addEventListener('click', (e) => { e.preventDefault(); window.loadPaymentFormsPage(); });
    document.getElementById("showPermissions")?.addEventListener('click', (e) => { e.preventDefault(); window.showPermissions(); });
    document.getElementById("showContractTemplates")?.addEventListener('click', (e) => { e.preventDefault(); window.loadContractTemplatesPage(); });
    logoutBtn?.addEventListener('click', logout);
    document.getElementById("showBudget")?.addEventListener('click', (e) => { e.preventDefault(); window.loadBudgetPage(); });
    document.getElementById("showSchedule")?.addEventListener('click', (e) => { e.preventDefault(); window.loadSchedulePage(); });
    document.getElementById("showCalendar")?.addEventListener('click', (e) => { e.preventDefault(); window.loadCalendarPage(); });
    
    document.getElementById("showIntegrations")?.addEventListener('click', (e) => { e.preventDefault(); window.loadIntegrationsPage(); });
    document.getElementById("showPlannedPayments")?.addEventListener('click', (e) => { e.preventDefault(); window.loadPlannedPaymentsPage(); });
    document.getElementById("showActualPayments")?.addEventListener('click', (e) => { e.preventDefault(); window.loadActualPaymentsPage(); });
    document.getElementById("showPaymentReconciliation")?.addEventListener('click', (e) => { e.preventDefault(); window.loadPaymentReconciliationPage(); });
    document.getElementById("showPaymentReport")?.addEventListener('click', (e) => { e.preventDefault(); window.loadPaymentReportPage(); });
    // --- НОВОЕ: обработчик для "Стоимость обучения"
    document.getElementById("showTuitionFees")?.addEventListener('click', (e) => { e.preventDefault(); window.loadTuitionFeesPage(); });

    // Загрузка страницы по умолчанию
    window.loadNewsfeedPage();
});
