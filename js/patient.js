/* ============================================================
   patient.js - CORE of the patient dashboard (load this FIRST)
   - shared data + helpers (window.Patient) used by the other files
   - page navigation (showSection)
   - Overview page + Appointment Details pop-up

   Other files:  booking.js  |  appointments.js  |  profile.js
   Shared data:  clinic-store.js (must load BEFORE this file)
   ============================================================ */
(function () {

  const Store = window.ClinicStore;
  if (!Store) { alert('Missing file: js/clinic-store.js. Add it to your js folder and reload the page.'); return; }

  /* ---------- Settings & demo data ---------- */
  const DENTIST = 'Dr. Jenina R. Ambayec';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  /* ---------- Small helpers ---------- */
  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toKey(date) {                       // Date -> "2026-10-16"
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
  }

  function parseKey(key) {                     // "2026-10-16" -> Date
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(date) {                  // "October 16, 2026"
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function timeValue(t) {                      // "1:00 PM" -> minutes (for sorting)
    const m = /(\d+):(\d+)\s*(AM|PM)/i.exec(t || '');
    if (!m) return 0;
    let h = Number(m[1]) % 12;
    if (/pm/i.test(m[3])) h += 12;
    return h * 60 + Number(m[2]);
  }

  /* ---------- Appointment data ---------- */
  // The store holds EVERY patient's appointments. A patient only sees (and changes) their own.
  function myId() { return getProfile().patientId; }

  function getAppointments() {
    const id = myId();
    return Store.getAppointments().filter((a) => !a.patientId || a.patientId === id);
  }

  // returns true when the server accepted the change
  function saveAppointments(mine) {
    const id = myId();
    mine.forEach((a) => { if (!a.patientId) a.patientId = id; });
    return Store.saveAppointments(mine);
  }

  function apptDate(a) {
    let d = a.date ? parseKey(a.date) : new Date(a.dateText);   // dateText = older saved format
    if (isNaN(d)) d = new Date(0);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function compareAppts(a, b) {
    return (apptDate(a) - apptDate(b)) || (timeValue(a.time) - timeValue(b.time));
  }

  function isUpcoming(a) {
    return (a.status === 'Pending' || a.status === 'Confirmed') && apptDate(a) >= today;
  }

  function getNextAppointment() {
    return getAppointments().filter(isUpcoming).sort(compareAppts)[0] || null;
  }

  function getHistory() {                      // everything that is not upcoming, newest first
    return getAppointments().filter((a) => !isUpcoming(a)).sort((a, b) => compareAppts(b, a));
  }

  function nextAppointmentId() {                // reserved by the server, so two patients never share an ID
    return Store.nextAppointmentId();
  }

  function dateParts(a) {                      // pieces for the blue date block
    const d = apptDate(a);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: d.getDate(),
      year: d.getFullYear(),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' })
    };
  }

  function statusBadge(status, extraClass) {
    return `<span class="status-badge ${esc(String(status).toLowerCase())} ${extraClass || ''}">${esc(status)}</span>`;
  }

  /* ---------- Age helpers (self-contained, so the dashboard never depends on another file) ---------- */
  const MIN_ACCOUNT_AGE = 18;    // under 18 -> a parent/guardian must register

  function calculateAge(dob) {   // "1996-10-06" -> 30   (null if missing / invalid / in the future)
    if (!dob) return null;
    const [y, m, d] = String(dob).split('-').map(Number);
    if (!y || !m || !d) return null;
    const birth = new Date(y, m - 1, d);
    const now = new Date();
    if (isNaN(birth) || birth > now) return null;
    let age = now.getFullYear() - birth.getFullYear();
    const hadBirthday = now.getMonth() > birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    return hadBirthday ? age : age - 1;
  }

  function formatAge(age) {      // 30 -> "30 years old"
    return age === null ? '' : age + (age === 1 ? ' year old' : ' years old');
  }

  /* ---------- Profile data ---------- */
  function getProfile() {                       // the logged-in patient's record (from the database)
    return Store.getMe();
  }

  function saveProfile(profile) {               // returns true when saved
    return Store.upsertPatient(profile);
  }

  function fullName(p) {
    const middle = p.middleName ? p.middleName.trim().charAt(0).toUpperCase() + '.' : '';
    return [p.firstName, middle, p.lastName].filter(Boolean).join(' ');
  }

  function refreshWelcome() {
    const el = $('patientWelcomeName');
    if (el) el.textContent = getProfile().firstName;
  }

  /* ---------- Notify the dentist (shows on the dentist's bell) ---------- */
  function notifyDentist(type, title, message, apptId) {
    Store.addNotification({ to: 'dentist', type: type, title: title, message: message, apptId: apptId });
  }

  /* ---------- Navigation ---------- */
  const SECTION_NAV = {                        // which sidebar link lights up for each page
    dashOverview: 'navDashboard',
    bookStep1: 'navBook', bookStep2: 'navBook', bookStep3: 'navBook',
    myAppointment: 'navMyAppt',
    appointmentHistory: 'navHistory',
    profilePage: 'navProfile'
  };

  const onShow = {};                           // other files register "run this when page opens" here

  function showSection(sectionId) {
    document.querySelectorAll('.dash-view').forEach((v) => { v.style.display = 'none'; });
    const target = $(sectionId);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.sidebar-menu .nav-link').forEach((l) => l.classList.remove('active'));
    const nav = $(SECTION_NAV[sectionId]);
    if (nav) nav.classList.add('active');

    if (typeof onShow[sectionId] === 'function') onShow[sectionId]();
  }

  /* ---------- Overview page ---------- */
  function renderOverview() {
    const next = getNextAppointment();
    $('nextApptContent').style.display = next ? 'flex' : 'none';
    $('nextApptEmpty').style.display = next ? 'none' : 'block';

    if (next) {
      const d = apptDate(next);
      $('ovDate').textContent = formatDate(d);
      $('ovTime').textContent = next.time;
      $('ovDentist').textContent = next.dentist;
      $('ovService').textContent = next.service;

      // mini calendar: the week that contains the appointment
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay());
      let cells = '';
      for (let i = 0; i < 7; i++) {
        const c = new Date(start);
        c.setDate(start.getDate() + i);
        cells += `<td${toKey(c) === toKey(d) ? ' class="active-date"' : ''}>${c.getDate()}</td>`;
      }
      $('miniCalendarRow').innerHTML = cells;
    }

    const recent = getHistory().slice(0, 5);
    $('recentApptBody').innerHTML = recent.length
      ? recent.map((a) => `
          <tr>
            <td>${esc(formatDate(apptDate(a)))}</td>
            <td>${esc(a.service)}</td>
            <td>${esc(a.dentist)}</td>
            <td>${statusBadge(a.status)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4">No past appointments yet.</td></tr>';
  }

  /* ---------- Appointment Details pop-up ---------- */
  function openDetails(appt) {
    $('detailId').textContent = appt.id || '—';
    $('detailService').textContent = appt.service;
    $('detailDentist').textContent = appt.dentist;
    $('detailDateTime').textContent = `${formatDate(apptDate(appt))} at ${appt.time}`;
    const statusEl = $('detailStatus');
    statusEl.textContent = appt.status;
    statusEl.className = 'status-badge ' + String(appt.status).toLowerCase();
    $('appointmentModal').classList.add('active');
  }

  window.closeModal = function () { $('appointmentModal').classList.remove('active'); };

  window.viewNextDetails = function () {
    const next = getNextAppointment();
    if (next) openDetails(next);
  };

  $('appointmentModal').addEventListener('click', (e) => {
    if (e.target === $('appointmentModal')) window.closeModal();   // click the dark background
  });

  /* ---------- Share with the other files ---------- */
  window.showSection = showSection;
  window.Patient = {
    DENTIST, today, $, esc, toKey, parseKey, formatDate,
    getAppointments, saveAppointments, getNextAppointment, getHistory, nextAppointmentId,
    apptDate, dateParts, statusBadge,
    MIN_ACCOUNT_AGE, calculateAge, formatAge,
    isSlotFree: Store.isSlotFree,
    notifyDentist,
    getProfile, saveProfile, fullName, refreshWelcome,
    openDetails, showSection, onShow
  };

  onShow.dashOverview = function () { refreshWelcome(); renderOverview(); };

  /* ---------- Notification bell ---------- */
  if (window.Notifications && $('notifMount')) {
    window.Notifications.init({
      mount: $('notifMount'),
      recipient: () => getProfile().patientId,
      onSelect: function (n) {                 // open the page that matches the notification
        if (n.type === 'confirmed' || n.type === 'scheduled') showSection('myAppointment');
        else showSection('appointmentHistory');
      }
    });
  }

  /* ---------- Start ---------- */
  refreshWelcome();
  renderOverview();
})();
