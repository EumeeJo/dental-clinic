/* ============================================================
   clinic-store.js - SHARED DATA for the whole system
   Used by the patient dashboard AND the dentist dashboard.
   Load it BEFORE patient.js / dentist.js.

   The data now lives in MySQL (through the PHP files in /api).
   This file keeps the SAME functions the other scripts already use
   (getAppointments, saveAppointments, addNotification ...), so they
   did not need to change:

     - on page load it fetches everything the logged-in person may see
     - reads come from that copy (fast, no waiting)
     - every save is sent to the server first; the screen only updates
       with what the server accepted
     - every few seconds it quietly checks for news (new requests,
       new notifications) and rings the bell

   An appointment looks like:
     { id, patientId, patientName, patientContact, service, dentist,
       date: 'YYYY-MM-DD', time: '10:00 AM', status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' }
   ============================================================ */
(function () {

  const API = 'api/data.php';
  const LOGIN_PAGE = 'login.html';
  const DENTIST_NAME = 'Dr. Jenina R. Ambayec';
  const SERVICES = ['Dental Cleaning', 'Consultation', 'Tooth Extraction', 'Dental Filling', 'Teeth Whitening', 'Root Canal', 'Oral Prophylaxis', 'Restorative Treatment', 'Prosthodontic Treatment', 'Practicing Orthodontics'];
  const POLL_MS = 5000;

  /* ---------- Time slots: 8:00 AM - 5:30 PM, every 30 minutes ---------- */
  const SLOTS = (function () {
    const out = [];
    for (let m = 8 * 60; m < 18 * 60; m += 30) {
      const h = Math.floor(m / 60);
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push(`${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`);
    }
    return out;
  })();

  /* ---------- Helpers ---------- */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toKey(date) {                          // Date -> "2026-10-16"
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function parseKey(key) {                        // "2026-10-16" -> Date
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(date) {                     // "October 16, 2026"
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function timeValue(t) {                         // "1:00 PM" -> minutes (for sorting)
    const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t || '');
    if (!m) return 0;
    let h = Number(m[1]) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + Number(m[2]);
  }

  function apptDate(a) {
    let d = a.date ? parseKey(a.date) : new Date(a.dateText);     // dateText = very old saved format
    if (isNaN(d)) d = new Date(0);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function compareAppts(a, b) {
    return (apptDate(a) - apptDate(b)) || (timeValue(a.time) - timeValue(b.time));
  }

  function dateParts(a) {                         // pieces for the blue date block
    const d = apptDate(a);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.getDate(),
      year: d.getFullYear(),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' })
    };
  }

  function calculateAge(dob) {                    // "1996-10-06" -> 30 (null if missing / invalid / future)
    if (!dob) return null;
    const [y, m, d] = String(dob).split('-').map(Number);
    if (!y || !m || !d) return null;
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    if (isNaN(birth) || birth > now) return null;
    const age = now.getFullYear() - birth.getFullYear();
    const had = now.getMonth() > birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    return had ? age : age - 1;
  }

  function personName(p) {                        // "Ana R. Reyes"
    if (!p) return '';
    const middle = p.middleName ? p.middleName.trim().charAt(0).toUpperCase() + '.' : '';
    return [p.firstName, middle, p.lastName].filter(Boolean).join(' ');
  }

  /* ---------- Talking to the server ---------- */
  const state = { role: null, me: null, appointments: [], patients: [], blocked: [], taken: [], notifications: [], dentist: null };
  let writeSeq = 0;                                   // counts saves, so a slow background check can never overwrite a newer save

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const onDashboard = /(patient|dentist)-dashboard/.test(location.pathname);

  function showError(message) {
    if (window.SystemPopup) window.SystemPopup.show({ type: 'error', message: message });
    else console.error(message);
  }

  // one request, answered before the next line runs (keeps all the old code simple)
  function call(action, payload) {
    const post = payload !== undefined;
    const xhr = new XMLHttpRequest();
    xhr.open(post ? 'POST' : 'GET', API + '?action=' + encodeURIComponent(action), false);
    xhr.setRequestHeader('X-Requested-With', 'ambayec');
    if (post) xhr.setRequestHeader('Content-Type', 'application/json');
    let data;
    try {
      xhr.send(post ? JSON.stringify(payload) : null);
      data = JSON.parse(xhr.responseText);
    } catch (e) {
      data = { ok: false, error: 'Cannot reach the clinic server. Make sure Apache and MySQL are running, then reload the page.' };
    }
    data.status = xhr.status;
    return data;
  }

  function apply(snap) {
    Object.keys(state).forEach((k) => { if (snap[k] !== undefined) state[k] = snap[k]; });
  }

  function toLogin() { location.replace(LOGIN_PAGE); }

  // save something; on failure tell the person why and show what the server really has
  function write(action, payload) {
    writeSeq++;
    const res = call(action, payload || {});
    if (res.ok) { apply(res); return res; }
    if (res.status === 401) { toLogin(); return res; }
    showError(res.error || 'Something went wrong. Please try again.');
    const fresh = call('load');
    if (fresh.ok) apply(fresh);
    return res;
  }

  /* ---------- First load ---------- */
  (function start() {
    const res = call('load');
    if (res.ok) {
      apply(res);
      const page = location.pathname;
      if (/dentist-dashboard/.test(page) && state.role !== 'dentist') location.replace('patient-dashboard.html');
      else if (/patient-dashboard/.test(page) && state.role !== 'patient') location.replace('dentist-dashboard.html');
    } else if (res.status === 401) {
      if (onDashboard) toLogin();
    } else if (onDashboard) {
      showError(res.error);
    }
  })();

  /* ---------- Quietly check for news (new requests, notifications) ---------- */
  function poll() {
    if (!state.role || document.hidden) return;
    const seq = writeSeq;
    fetch(API + '?action=load', { credentials: 'same-origin', headers: { 'X-Requested-With': 'ambayec' } })
      .then((r) => { if (r.status === 401) { toLogin(); return null; } return r.json(); })
      .then((res) => {
        if (!res || !res.ok || seq !== writeSeq) return;
        const mark = () => JSON.stringify([state.appointments, state.notifications, state.blocked, state.taken]);
        const before = mark();
        apply(res);
        if (mark() !== before) window.dispatchEvent(new CustomEvent('clinicstore:updated'));
      })
      .catch(() => { /* server asleep for a moment: try again next time */ });
  }
  if (state.role) {
    setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
  }

  /* ---------- Me (the logged-in patient) ---------- */
  function getMe() { return state.me ? clone(state.me) : {}; }
  function getRole() { return state.role; }

  /* ---------- Appointments ---------- */
  // copies, so the code can edit them freely and call saveAppointments(list) when done
  function getAppointments() { return clone(state.appointments); }

  const sig = (a) => [a.id, a.patientId, a.patientName, a.patientContact, a.service, a.dentist, a.date, a.time, a.status].join('|');

  // saves only what changed. Returns true when the server accepted everything.
  function saveAppointments(list) {
    const known = {};
    state.appointments.forEach((a) => { known[a.id] = a; });
    const changed = list.filter((a) => !known[a.id] || sig(a) !== sig(known[a.id]));
    if (!changed.length) return true;
    return write('save_appointments', { appointments: changed }).ok === true;
  }

  function nextAppointmentId() {
    const res = call('next_id', { kind: 'appt' });
    if (res.ok) return res.id;
    if (res.status === 401) toLogin(); else showError(res.error);
    return '';
  }

  /* ---------- Patients ---------- */
  function pickPatient(p) {
    return {
      patientId: p.patientId, firstName: p.firstName || '', middleName: p.middleName || '', lastName: p.lastName || '',
      dob: p.dob || '', gender: p.gender || '', contact: p.contact || '', email: p.email || '', address: p.address || ''
    };
  }

  function getPatients() { return clone(state.patients); }
  function getPatient(id) { const p = state.patients.find((x) => x.patientId === id); return p ? clone(p) : null; }

  function nextPatientId() {
    const res = call('next_id', { kind: 'patient' });
    if (res.ok) return res.id;
    if (res.status === 401) toLogin(); else showError(res.error);
    return '';
  }

  // add or update a patient (the server also updates the patient's own profile). Returns true when saved.
  function upsertPatient(p) {
    if (!p || !p.patientId) return false;
    return write('upsert_patient', { patient: pickPatient(p) }).ok === true;
  }

  function patientName(a) {
    return a.patientName || personName(getPatient(a.patientId)) || 'Patient';
  }
  function patientContact(a) {
    if (a.patientContact) return a.patientContact;
    const p = getPatient(a.patientId);
    return p ? p.contact : '';
  }

  /* ---------- Dentist availability ---------- */
  function getBlocked() { return clone(state.blocked); }
  function isBlocked(dateKey, time) { return state.blocked.some((b) => b.date === dateKey && b.time === time); }

  // block (on = true) or unblock (on = false) a list of { date, time } slots
  function setBlocked(items, on) {
    return write('set_blocked', { items: items.map((i) => ({ date: i.date, time: i.time })), on: !!on }).ok === true;
  }

  // slots that currently hold an appointment: { "2026-10-06|9:00 AM": appointment }
  function bookedMap(statuses) {
    const map = {};
    state.appointments.forEach((a) => {
      if (statuses.includes(a.status)) {
        const key = a.date + '|' + a.time;
        if (!map[key]) map[key] = clone(a);
      }
    });
    return map;
  }

  // can a PATIENT book this slot? (not blocked by the dentist, not already taken by anyone)
  function isSlotFree(dateKey, time) {
    if (isBlocked(dateKey, time)) return false;
    if (state.taken.some((t) => t.date === dateKey && t.time === time)) return false;
    return !state.appointments.some((a) => a.date === dateKey && a.time === time && (a.status === 'Pending' || a.status === 'Confirmed'));
  }

  /* ---------- Notifications ----------
     `to` is 'dentist' for the dentist, or a patientId for a patient.
     The server only sends you YOUR notifications.
     type: request | patient-cancelled | confirmed | declined | completed | cancelled | scheduled */
  function addNotification(n) {
    return write('add_notification', { to: n.to, type: n.type, title: n.title, message: n.message, apptId: n.apptId || '' }).ok === true;
  }

  function getNotifications(to) {                      // newest first
    return clone(state.notifications.filter((n) => n.to === to)).sort((a, b) => (a.time < b.time ? 1 : -1));
  }
  function unreadCount(to) { return state.notifications.filter((n) => n.to === to && !n.read).length; }

  function markNotificationRead(id) {
    const n = state.notifications.find((x) => x.id === id);
    if (n && !n.read) write('mark_read', { id: id });
  }
  function markAllNotificationsRead(to) {
    if (state.notifications.some((n) => n.to === to && !n.read)) write('mark_all_read', {});
  }

  /* ---------- Dentist profile ---------- */
  function getDentistProfile() {
    return Object.assign(
      { fullName: 'Jenina R. Ambayec', email: '', contact: '' },
      state.dentist || {}
    );
  }
  function saveDentistProfile(p) {
    return write('save_dentist_profile', { profile: { fullName: p.fullName, email: p.email, contact: p.contact } }).ok === true;
  }

  /* ---------- Share ---------- */
  window.ClinicStore = {
    KEYS: {}, DENTIST_NAME, SLOTS, SERVICES,
    esc, toKey, formatDate, parseKey, timeValue, apptDate, compareAppts, dateParts, calculateAge, personName,
    getMe, getRole,
    getAppointments, saveAppointments, nextAppointmentId,
    getPatients, getPatient, nextPatientId, upsertPatient, patientName, patientContact,
    getBlocked, isBlocked, setBlocked, bookedMap, isSlotFree,
    getDentistProfile, saveDentistProfile,
    addNotification, getNotifications, unreadCount, markNotificationRead, markAllNotificationsRead,
    refresh: poll
  };
})();
