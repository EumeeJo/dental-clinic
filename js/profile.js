/* ============================================================
   profile.js - My Profile page (view, edit, save)
   Needs patient.js loaded first. Age helpers come from patient.js
   (window.Patient), so this page does not depend on any other file.
   ============================================================ */
(function () {
  const P = window.Patient;
  const $ = P.$;

  const FIELDS = ['firstName', 'lastName', 'middleName', 'dob', 'contact', 'gender', 'email', 'address'];
  const MAX_AGE = 120;
  let editing = false;

  const fieldEl = (name) => document.querySelector(`[data-field="${name}"]`);

  // Every element is looked up safely: if one is missing the rest of the page still fills in.
  function setText(id, text) { const el = $(id); if (el) el.textContent = text; }
  function setValue(el, value) { if (el) el.value = value; }

  // Age is never typed in: it is worked out from the date of birth every time
  function updateAge() {
    const dobEl = fieldEl('dob');
    const age = P.calculateAge(dobEl ? dobEl.value : '');
    setValue($('pfAge'), (age === null || age > MAX_AGE) ? '' : P.formatAge(age));
  }

  function fillForm(profile) {
    // 1) the header first, so the name always shows
    setText('profileName', P.fullName(profile) || 'Patient');
    setText('profilePatientId', profile.patientId || '—');

    // 2) then the fields, then the age
    FIELDS.forEach((f) => setValue(fieldEl(f), profile[f] || ''));
    updateAge();
  }

  function setMessage(text, type) {
    const el = $('profileMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'profile-message' + (type ? ' ' + type : '');
  }

  function setEditing(on) {
    editing = on;
    const form = $('profileForm');
    if (form) form.classList.toggle('editing', on);

    FIELDS.forEach((f) => {
      const el = fieldEl(f);
      if (!el) return;
      if (el.tagName === 'SELECT') el.disabled = !on;
      else el.readOnly = !on;
    });

    $('profileEditBtn').textContent = on ? 'Save Changes' : 'Edit Profile';
    $('profileCancelBtn').style.display = on ? 'inline-block' : 'none';
  }

  function saveChanges() {
    const values = {};
    FIELDS.forEach((f) => { values[f] = fieldEl(f) ? fieldEl(f).value.trim() : ''; });

    if (!values.firstName || !values.lastName) {
      setMessage('First name and last name are required.', 'error');
      return;
    }

    const age = P.calculateAge(values.dob);
    if (age === null || age > MAX_AGE) {
      setMessage('Please enter a valid date of birth.', 'error');
      return;
    }
    if (age < P.MIN_ACCOUNT_AGE) {
      setMessage('Account holders must be 18 or older. A parent or guardian must manage the account for patients under 18.', 'error');
      return;
    }

    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setMessage('Please enter a valid email address.', 'error');
      return;
    }

    const updated = Object.assign({}, P.getProfile(), values);
    if (!P.saveProfile(updated)) return;          // the server refused (message already shown)
    fillForm(P.getProfile());
    P.refreshWelcome();
    setEditing(false);
    setMessage('Profile updated.', 'success');
  }

  window.handleProfileButton = function () {
    if (!editing) { setMessage(''); setEditing(true); }
    else saveChanges();
  };

  window.cancelProfileEdit = function () {
    fillForm(P.getProfile());   // throw away unsaved changes
    setEditing(false);
    setMessage('');
  };

  // while editing, the Age box follows the date of birth
  const dobEl = fieldEl('dob');
  if (dobEl) {
    dobEl.addEventListener('input', updateAge);
    dobEl.addEventListener('change', updateAge);
  }

  P.onShow.profilePage = function () {
    setEditing(false);
    setMessage('');
    fillForm(P.getProfile());
  };
})();