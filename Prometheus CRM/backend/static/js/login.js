// ===================================================================
// Prometheus CRM/static/js/login.js
// Description: Handles user login functionality.
// Depends on: utils.js
// ===================================================================

import { fetchAuthenticated, showAlert } from './utils.js';

document.addEventListener('DOMContentLoaded', function() {
  // Find DOM elements
  const loginForm = document.getElementById('loginForm');
  const loginInput = document.getElementById('login');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('loginError');

  // Basic validation that critical elements exist
  if (!loginForm || !loginInput || !passwordInput || !errorDiv) {
    console.error('Critical DOM elements for login form not found. Aborting initialization.');
    return;
  }

  // --- Event Listeners ---
  loginForm.onsubmit = handleLoginSubmit;

  // Hide error message when user starts typing in either field
  loginInput.addEventListener('input', () => {
    if (errorDiv.style.display === 'block') {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }
  });
  passwordInput.addEventListener('input', () => {
    if (errorDiv.style.display === 'block') {
      errorDiv.style.display = 'none';
      errorDiv.textContent = '';
    }
  });
});

/**
 * Handles the login form submission.
 * @param {Event} e - The form submit event.
 */
async function handleLoginSubmit(e) {
  e.preventDefault();

  const loginInput = document.getElementById('login');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('loginError');

  // Clear previous error messages
  errorDiv.style.display = 'none';
  errorDiv.textContent = '';

  const login = loginInput.value.trim();
  const password = passwordInput.value;

  // Client-side validation for empty fields
  if (!login || !password) {
    errorDiv.textContent = 'Пожалуйста, заполните все поля.';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    // A more robust solution might involve a separate `fetchPublic` utility
    // or modifying `fetchAuthenticated` to accept an optional `requireAuth` flag.
    // For now, we'll use a direct fetch and handle the token manually.

    const res = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ login, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token); // Save the received token
      window.location.href = '/dashboard'; // Redirect to dashboard
    } else {
      // Display server-side error message
      errorDiv.textContent = data.error || 'Неверный логин или пароль.';
      errorDiv.style.display = 'block';
    }

  } catch (error) {
    console.error('Ошибка при отправке запроса:', error);
    errorDiv.textContent = 'Произошла ошибка сети. Попробуйте позже.';
    errorDiv.style.display = 'block';
  }
}