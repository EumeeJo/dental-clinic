document.addEventListener('DOMContentLoaded', () => {
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordInput = document.getElementById('password');
  const loginForm = document.getElementById('loginForm');

  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = passwordInput.value;
      const button = loginForm.querySelector('.btn-login');

      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'Signing in...';

      // The server checks the account and decides where to send you (patient or dentist)
      fetch('api/auth.php?action=login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ambayec' },
        body: JSON.stringify({ username: username, password: password })
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.ok) {
            window.location.href = res.redirect;
            return;
          }
          SystemPopup.show({ type: 'error', title: 'Login failed', message: res.error || 'Please try again.' });
        })
        .catch(() => {
          SystemPopup.show({
            type: 'error',
            title: 'Cannot reach the server',
            message: 'Make sure Apache and MySQL are running and that you opened the site through http://localhost/ (not by double-clicking the file).'
          });
        })
        .finally(() => {
          button.disabled = false;
          button.textContent = original;
        });
    });
  }
});
