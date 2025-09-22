// ===================================================================
// Prometheus CRM/static/js/register.js
// Description: Handles user registration functionality.
// Depends on: utils.js
// ===================================================================

import { showAlert } from './utils.js'; // Only showAlert is needed here

document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');
    const errorDiv = document.getElementById('registerError');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (!registerForm || !errorDiv || !passwordInput || !confirmPasswordInput) {
        console.error('Critical DOM elements for registration form not found. Aborting initialization.');
        return;
    }

    // --- Event Listeners ---
    registerForm.onsubmit = handleRegisterSubmit;

    // Hide error message when user starts typing in password fields
    passwordInput.addEventListener('input', () => {
        if (errorDiv.style.display === 'block') {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
    });
    confirmPasswordInput.addEventListener('input', () => {
        if (errorDiv.style.display === 'block') {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }
    });
});

/**
 * Handles the registration form submission.
 * @param {Event} e - The form submit event.
 */
async function handleRegisterSubmit(e) {
    e.preventDefault();

    const registerForm = document.getElementById('registerForm');
    const errorDiv = document.getElementById('registerError');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Clear previous error messages
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Client-side password matching validation
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Пароли не совпадают.';
        errorDiv.style.display = 'block';
        return;
    }

    const formData = new FormData(registerForm);
    const data = Object.fromEntries(formData.entries());
    delete data.confirmPassword; // Remove confirm password before sending

    try {
        // For registration, we don't have a token yet, so use direct fetch
        const res = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const responseData = await res.json();

        if (res.ok) {
            showAlert('Регистрация прошла успешно! Теперь вы можете войти.', 'success');
            window.location.href = '/'; // Redirect to login page
        } else {
            // Display server-side error message
            let errorMessage = 'Произошла ошибка при регистрации.';
            if (responseData && responseData.error) {
                if (responseData.error.includes("Login or Email already in use")) {
                    errorMessage = "Пользователь с таким логином или email уже существует.";
                } else {
                    errorMessage = responseData.error;
                }
            }
            errorDiv.textContent = errorMessage;
            errorDiv.style.display = 'block';
            showAlert(errorMessage, 'error'); // Also show a utility alert
        }

    } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        const networkErrorMessage = 'Произошла ошибка сети. Попробуйте позже.';
        errorDiv.textContent = networkErrorMessage;
        errorDiv.style.display = 'block';
        showAlert(networkErrorMessage, 'error'); // Also show a utility alert
    }
}
