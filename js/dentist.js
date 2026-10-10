/* ============================================================
   dentist.js - CORE of the dentist dashboard (load this FIRST)
   - shared helpers (window.Dentist) used by the other dentist files
   - page navigation (showSection)
   - Dashboard page (stat cards, today's appointments, quick actions, bell)
   - small pop-ups: appointment details, "are you sure?", reports, toast

   Other files:  dentist-appointments.js | dentist-schedule.js
                 dentist-patients.js     | dentist-profile.js
   Shared data:  clinic-store.js (must load BEFORE this file)
   ============================================================ */
(function () {

  const Store = window.ClinicStore;
  if (!Store) { alert('Missing file: js/clinic-store.js. It must be in the same js folder as dentist.js.'); return; }

  const $ = (id) => document.getElementById(id);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { esc, toKey, formatDate, apptDate, compareAppts } = Store;

  /* ---------- Helpers ---------- */
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

  function weekStart(date) {                       // the Monday of that week
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function statusBadge(status) {
    return `<span class="status-badge ${esc(String(status).toLowerCase())}">${esc(status)}</span>`;
  }

  /* ---------- Toast + pop-ups ---------- */
  function toast(message, type) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function openModal(id) { $(id).classList.add('active'); }
  window.closeModal = function (id) { $(id).classList.remove('active'); };

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });   // click the dark background
  });

  // "Are you sure?" pop-up
  function askConfirm(opts) {
    $('confirmTitle').textContent = opts.title;
    $('confirmText').textContent = opts.text || '';
    $('confirmYes').textContent = opts.yes || 'Yes';
    $('confirmYes').onclick = function () { window.closeModal('confirmModal'); opts.onYes(); };
    openModal('confirmModal');
  }

  // appointment details pop-up
  function openApptDetails(a) {
    $('adId').textContent = a.id || '—';
    $('adPatient').textContent = Store.patientName(a);
    $('adContact').textContent = Store.patientContact(a) || '—';
    $('adService').textContent = a.service;
    $('adDateTime').textContent = `${formatDate(apptDate(a))} at ${a.time}`;
    const st = $('adStatus');
    st.textContent = a.status;
    st.className = 'status-badge ' + String(a.status).toLowerCase();
    openModal('apptModal');
  }

  /* ---------- Navigation ---------- */
  const SECTION_NAV = {
    dashOverview: 'navDashboard',
    appointmentsPage: 'navAppts',
    schedulePage: 'navSchedule',
    patientsPage: 'navPatients',
    profilePage: 'navProfile'
  };
  const onShow = {};                               // the other files register "run this when the page opens" here

  function showSection(sectionId) {
    document.querySelectorAll('.dash-view').forEach((v) => { v.style.display = 'none'; });
    const target = $(sectionId);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.sidebar-menu .nav-link').forEach((l) => l.classList.remove('active'));
    const nav = $(SECTION_NAV[sectionId]);
    if (nav) nav.classList.add('active');

    if (typeof onShow[sectionId] === 'function') onShow[sectionId]();
  }
  window.showSection = showSection;

  window.openRequests = function () {              // bell + "View Appointment Requests"
    showSection('appointmentsPage');
    if (typeof window.setRequestTab === 'function') window.setRequestTab('Pending');
  };

  /* ---------- Dentist name in the greeting ---------- */
  function refreshName() {
    const first = Store.getDentistProfile().fullName.trim().split(/\s+/)[0] || 'Doctor';
    const el = $('dentistWelcomeName');
    if (el) el.textContent = 'Dr. ' + first;
  }

  // keep the notification bell (red dot) up to date after any change
  function refreshBadges() {
    if (window.Notifications) window.Notifications.refresh();
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    const all = Store.getAppointments();
    const todayKey = toKey(today);
    const todays = all.filter((a) => toKey(apptDate(a)) === todayKey).sort(compareAppts);

    const start = weekStart(today);
    const end = addDays(start, 6);
    const week = all.filter((a) => { const d = apptDate(a); return d >= start && d <= end; });
    const count = (status) => week.filter((a) => a.status === status).length;

    $('statTotal').textContent = todays.length;
    $('statCompleted').textContent = count('Completed');
    $('statPending').textContent = count('Pending');
    $('statCancelled').textContent = count('Cancelled');

    $('todayList').innerHTML = todays.length
      ? todays.map((a) => `
          <div class="today-row">
            <span class="today-time">${esc(a.time)}</span>
            <div class="today-who"><strong>${esc(Store.patientName(a))}</strong><span>${esc(a.service)}</span></div>
            ${statusBadge(a.status)}
          </div>`).join('')
      : '<div class="empty-note">No appointments today.</div>';

    refreshName();
    refreshBadges();
  }

  /* ---------- Quick actions ---------- */
  window.openServicesInfo = function () {
    toast('Editing dental services is coming soon.');
  };

  window.openReports = function () {
    const year = today.getFullYear();
    const month = today.getMonth();
    const list = Store.getAppointments().filter((a) => {
      const d = apptDate(a);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    const count = (s) => list.filter((a) => a.status === s).length;

    const byService = {};
    list.forEach((a) => { byService[a.service] = (byService[a.service] || 0) + 1; });
    const rows = Object.keys(byService).sort((a, b) => byService[b] - byService[a])
      .map((s) => `<tr><td>${esc(s)}</td><td>${byService[s]}</td></tr>`).join('');

    $('reportTitle').textContent = 'Report - ' + today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('reportBody').innerHTML = `
      <div class="report-cards">
        <div class="report-card"><strong>${list.length}</strong>Total</div>
        <div class="report-card"><strong>${count('Completed')}</strong>Completed</div>
        <div class="report-card"><strong>${count('Confirmed')}</strong>Confirmed</div>
        <div class="report-card"><strong>${count('Pending')}</strong>Pending</div>
        <div class="report-card"><strong>${count('Cancelled')}</strong>Cancelled</div>
      </div>
      <table class="report-table">
        <thead><tr><th>Service</th><th>Appointments</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="2">No appointments this month.</td></tr>'}</tbody>
      </table>`;
    openModal('reportsModal');
  };

  /* ---------- Share with the other files ---------- */
  window.Dentist = {
    Store, $, today, esc, toKey, formatDate, apptDate, compareAppts,
    addDays, weekStart, statusBadge, toast, openModal, askConfirm, openApptDetails,
    showSection, onShow, refreshBadges, refreshName, renderDashboard
  };

  /* ---------- Notification bell ---------- */
  if (window.Notifications && $('notifMount')) {
    window.Notifications.init({
      mount: $('notifMount'),
      recipient: () => 'dentist',
      onSelect: function (n) {                 // open the page that matches the notification
        if (n.type === 'patient-cancelled') {
          showSection('appointmentsPage');
          if (typeof window.setRequestTab === 'function') window.setRequestTab('Cancelled');
        } else {
          window.openRequests();
        }
      }
    });
  }

  onShow.dashOverview = renderDashboard;

  /* ---------- Start ---------- */
  renderDashboard();
})();
