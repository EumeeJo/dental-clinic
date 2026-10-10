/* ============================================================
   appointments.js - My Appointment + Appointment History pages
   Needs patient.js loaded first.
   ============================================================ */
(function () {
  const P = window.Patient;
  const $ = P.$;

  /* ============ MY APPOINTMENT ============ */
  let current = null;   // the appointment shown on the page
  let pinned = null;    // keeps a just-cancelled appointment on screen until you leave the page

  function renderMyAppointment() {
    const appt = pinned || P.getNextAppointment();
    current = appt;

    $('apptCard').style.display = appt ? 'flex' : 'none';
    $('apptEmpty').style.display = appt ? 'none' : 'block';
    if (!appt) return;

    const parts = P.dateParts(appt);
    $('maMonth').textContent = parts.month;
    $('maDay').textContent = parts.day;
    $('maYear').textContent = parts.year;
    $('maWeekday').textContent = parts.weekday;

    $('maTime').textContent = appt.time;
    $('maService').textContent = appt.service;
    $('maDentist').textContent = appt.dentist;
    $('maId').textContent = appt.id || '—';

    const statusEl = $('maStatus');
    statusEl.textContent = appt.status;
    statusEl.className = 'status-badge lg ' + String(appt.status).toLowerCase();

    const cancelled = appt.status === 'Cancelled';
    $('maCancelBtn').style.display = cancelled ? 'none' : 'inline-block';
    $('maCancelNote').style.display = cancelled ? 'block' : 'none';
  }

  window.askCancelAppointment = function () {
    if (current) $('cancelModal').classList.add('active');
  };

  window.closeCancelModal = function () {
    $('cancelModal').classList.remove('active');
  };

  window.confirmCancelAppointment = function () {
    if (current) {
      const list = P.getAppointments();
      const match = list.find((a) => a.id === current.id);
      if (match) {
        match.status = 'Cancelled';
        if (!P.saveAppointments(list)) { window.closeCancelModal(); renderMyAppointment(); return; }
        pinned = match;

        P.notifyDentist('patient-cancelled', 'Appointment cancelled by patient',
          `${P.fullName(P.getProfile())} cancelled their ${match.service} on ${P.formatDate(P.apptDate(match))} at ${match.time}.`,
          match.id);
      }
    }
    window.closeCancelModal();
    renderMyAppointment();
  };

  P.onShow.myAppointment = function () {
    pinned = null;
    renderMyAppointment();
  };

  /* ============ APPOINTMENT HISTORY ============ */
  function setupHistoryFilters() {
    const history = P.getHistory();
    const serviceSel = $('historyService');
    const yearSel = $('historyYear');
    const prevService = serviceSel.value || 'all';
    const prevYear = yearSel.value;

    const services = [...new Set(history.map((a) => a.service))].sort();
    serviceSel.innerHTML = '<option value="all">all services</option>' +
      services.map((s) => `<option value="${P.esc(s)}">${P.esc(s)}</option>`).join('');
    serviceSel.value = services.includes(prevService) ? prevService : 'all';

    const years = new Set(history.map((a) => P.apptDate(a).getFullYear()));
    years.add(P.today.getFullYear());
    const sortedYears = [...years].sort((a, b) => b - a).map(String);
    yearSel.innerHTML = sortedYears.map((y) => `<option value="${y}">${y}</option>`).join('');
    yearSel.value = sortedYears.includes(prevYear) ? prevYear : String(P.today.getFullYear());
  }

  window.renderHistory = function () {
    const query = $('historySearch').value.trim().toLowerCase();
    const service = $('historyService').value;
    const year = $('historyYear').value;

    const rows = P.getHistory().filter((a) => {
      const d = P.apptDate(a);
      if (String(d.getFullYear()) !== year) return false;
      if (service !== 'all' && a.service !== service) return false;
      if (query) {
        const text = [a.service, a.dentist, a.status, P.formatDate(d), d.toLocaleDateString('en-US', { month: 'short' })]
          .join(' ').toLowerCase();
        if (!text.includes(query)) return false;
      }
      return true;
    });

    $('historyRows').innerHTML = rows.length
      ? rows.map((a) => {
          const p = P.dateParts(a);
          return `
            <div class="history-row">
              <div>
                <div class="date-block sm">
                  <span class="date-block-month">${p.month}</span>
                  <span class="date-block-day">${p.day}</span>
                  <span class="date-block-year">${p.year}</span>
                  <span class="date-block-weekday">${p.weekday}</span>
                  <span class="date-block-time">${P.esc(a.time)}</span>
                </div>
              </div>
              <div class="history-cell"><svg class="icon tooth-icon"><use href="#i-tooth"/></svg><span>${P.esc(a.service)}</span></div>
              <div class="history-cell"><svg class="icon"><use href="#i-doctor"/></svg><span>${P.esc(a.dentist)}</span></div>
              <div>${P.statusBadge(a.status)}</div>
            </div>`;
        }).join('')
      : '<div class="history-empty">No appointment records found.</div>';
  };

  P.onShow.appointmentHistory = function () {
    setupHistoryFilters();
    window.renderHistory();
  };
})();