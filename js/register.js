document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const authCheckbox = document.getElementById('authCheckbox');
  const dobInput = document.getElementById('dob');
  const dobHint = document.getElementById('dobHint');

  const DEFAULT_HINT = dobHint ? dobHint.textContent : '';
  const MAX_AGE = 120;

  /* ---------- Date of birth: live age check ----------
     Returns true only when the date is valid AND the person is 18 or older. */
  function checkDob() {
    const age = calculateAge(dobInput.value);

    dobInput.classList.remove('invalid');
    dobHint.className = 'field-hint';

    if (!dobInput.value) {                       // nothing typed yet
      dobHint.textContent = DEFAULT_HINT;
      return false;
    }
    if (age === null || age > MAX_AGE) {
      dobHint.textContent = 'Please enter a valid date of birth.';
      dobHint.classList.add('error');
      dobInput.classList.add('invalid');
      return false;
    }
    if (age < MINIMUM_ACCOUNT_AGE) {
      dobHint.textContent = 'You are ' + formatAge(age) + '. Patients under 18 cannot create an account.';
      dobHint.classList.add('error');
      dobInput.classList.add('invalid');
      return false;
    }
    dobHint.textContent = 'Age: ' + formatAge(age);
    dobHint.classList.add('ok');
    return true;
  }

  if (dobInput && dobHint) {
    const today = new Date();
    dobInput.max = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');           // no future dates
    dobInput.addEventListener('input', checkDob);
    dobInput.addEventListener('change', checkDob);
  }

  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Age rule: must be 18+ (a guardian registers for younger patients)
      if (!checkDob()) {
        dobInput.focus();
        return;
      }

      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;

      if (password.length < 8) {
        SystemPopup.show({ type: 'warning', title: 'Password too short', message: 'Your password must be at least 8 characters.' });
        return;
      }

      if (password !== confirmPassword) {
        SystemPopup.show({ type: 'warning', title: 'Passwords do not match', message: 'Please check both password boxes and try again.' });
        return;
      }

      // Authorization Checkbox Box Verification
      if (!authCheckbox || !authCheckbox.checked) {
        SystemPopup.show({ type: 'warning', title: 'Authorization needed', message: 'Please check the authorization box to grant credential access before continuing.' });
        return;
      }

      // Send the new patient to the server (it saves the profile and the login, with the password stored hashed)
      const val = (id) => document.getElementById(id).value.trim();
      const button = registerForm.querySelector('button[type="submit"]');
      const original = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Creating account...'; }

      fetch('api/auth.php?action=register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ambayec' },
        body: JSON.stringify({
          firstName: val('firstName'),
          middleName: val('middleName'),
          lastName: val('lastName'),
          dob: val('dob'),
          gender: document.getElementById('gender').value,
          contact: val('contact'),
          email: val('email'),
          address: val('address'),
          password: password
        })
      })
        .then((r) => r.json())
        .then((res) => {
          if (!res.ok) {
            SystemPopup.show({ type: 'error', title: 'Registration failed', message: res.error || 'Please try again.' });
            return;
          }
          SystemPopup.show({
            type: 'success',
            title: 'Account Registered!',
            message: 'Your patient ID is ' + res.patientId + '.\nYou can now log in with your email and password.',
            button: 'Go to Login',
            onClose: () => { window.location.href = 'login.html'; }
          });
        })
        .catch(() => {
          SystemPopup.show({
            type: 'error',
            title: 'Cannot reach the server',
            message: 'Make sure Apache and MySQL are running and that you opened the site through http://localhost/.'
          });
        })
        .finally(() => {
          if (button) { button.disabled = false; button.textContent = original; }
        });
    });
  }
});
