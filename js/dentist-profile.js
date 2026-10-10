/* ============================================================
   dentist-profile.js - Dentist "My Profile" page
   Edit Profile / Save Changes, and the Update Password pop-up.
   Needs dentist.js loaded first.
   ============================================================ */
(function () {
  const D = window.Dentist;
  if (!D) return;
  const Store = D.Store;
  const $ = D.$;

  const FIELDS = ['fullName', 'email', 'contact'];
  let editing = false;

  const fieldEl = (name) => document.querySelector(`[data-field="${name}"]`);

  function fillForm(profile) {
    $('dpHeaderName').textContent = profile.fullName || 'Dentist';
    FIELDS.forEach((f) => { fieldEl(f).value = profile[f] || ''; });
  }

  function setMessage(text, type) {
    const el = $('dpMessage');
    el.textContent = text || '';
    el.className = 'profile-message' + (type ? ' ' + type : '');
  }

  function setEditing(on) {
    editing = on;
    $('dpForm').classList.toggle('editing', on);
    FIELDS.forEach((f) => { fieldEl(f).readOnly = !on; });

    $('dpEditBtn').textContent = on ? 'Save Changes' : 'Edit Profile';
    $('dpPasswordBtn').style.display = on ? 'none' : 'block';
    $('dpCancelBtn').style.display = on ? 'block' : 'none';
  }

  function saveChanges() {
    const values = {};
    FIELDS.forEach((f) => { values[f] = fieldEl(f).value.trim(); });

    if (!values.fullName) { setMessage('Full name is required.', 'error'); return; }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      setMessage('Please enter a valid email address.', 'error');
      return;
    }

    if (!Store.saveDentistProfile(values)) return;   // the server refused (message already shown)
    fillForm(Store.getDentistProfile());
    D.refreshName();                    // the greeting on the Dashboard uses this name
    setEditing(false);
    setMessage('Profile updated.', 'success');
  }

  window.handleDentistProfileButton = function () {
    if (!editing) { setMessage(''); setEditing(true); }
    else saveChanges();
  };

  window.cancelDentistProfileEdit = function () {
    fillForm(Store.getDentistProfile());   // throw away unsaved changes
    setEditing(false);
    setMessage('');
  };

  /* ---------- Update Password ---------- */
  window.openPasswordModal = function () {
    if ($('pwCurrent')) $('pwCurrent').value = '';
    $('pwNew').value = '';
    $('pwConfirm').value = '';
    $('pwError').textContent = '';
    D.openModal('passwordModal');
  };

  window.savePassword = function () {
    const current = $('pwCurrent') ? $('pwCurrent').value : '';
    const next = $('pwNew').value;
    const confirm = $('pwConfirm').value;
    const error = (msg) => { $('pwError').textContent = msg; };

    if (!current) return error('Please enter your current password.');
    if (next.length < 8) return error('Use at least 8 characters.');
    if (next !== confirm) return error('The two passwords do not match.');

    // send it to the server (it checks the current password and stores the new one hashed)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api/auth.php?action=change_password', false);
    xhr.setRequestHeader('X-Requested-With', 'ambayec');
    xhr.setRequestHeader('Content-Type', 'application/json');
    let res;
    try { xhr.send(JSON.stringify({ current: current, next: next })); res = JSON.parse(xhr.responseText); }
    catch (e) { res = { ok: false, error: 'Cannot reach the clinic server.' }; }
    if (!res.ok) return error(res.error || 'Could not update the password.');

    window.closeModal('passwordModal');
    D.toast('Password updated.');
  };

  D.onShow.profilePage = function () {
    setEditing(false);
    setMessage('');
    fillForm(Store.getDentistProfile());
  };
})();
