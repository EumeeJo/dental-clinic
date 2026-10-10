/* ============================================================
   dentist-appointments.js - Appointment Requests page
   Tabs: Pending / Confirmed / Cancelled, search by patient name,
   Accept / Reject (pending) and Complete / Cancel (confirmed).
   Needs dentist.js loaded first.
   ============================================================ */
(function () {
  const D = window.Dentist;
  if (!D) return;                       // dentist.js stopped (missing clinic-store.js)
  const Store = D.Store;
  const $ = D.$;

  let tab = 'Pending';

  function listFor(status) {
    const list = Store.getAppointments().filter((a) => a.status === status);
    list.sort(status === 'Cancelled' ? (a, b) => Store.compareAppts(b, a) : Store.compareAppts);
    return list;
  }

  function updateCounts() {
    $('cntPending').textContent = listFor('Pending').length;
    $('cntConfirmed').textContent = listFor('Confirmed').length;
    $('cntCancelled').textContent = listFor('Cancelled').length;
  }

  window.setRequestTab = function (name) {
    tab = name;
    ['Pending', 'Confirmed', 'Cancelled'].forEach((t) => $('tab' + t).classList.toggle('active', t === name));
    window.renderRequests();
  };

  function actionsFor(a) {
    const id = D.esc(a.id);
    if (a.status === 'Pending') {
      return `<button class="btn-mini" onclick="acceptRequest('${id}')">Accept</button>
              <button class="btn-mini red" onclick="rejectRequest('${id}')">Reject</button>`;
    }
    if (a.status === 'Confirmed') {
      return `<button class="btn-mini" onclick="completeAppointment('${id}')">Complete</button>
              <button class="btn-mini red" onclick="cancelConfirmed('${id}')">Cancel</button>`;
    }
    return '<span>—</span>';
  }

  window.renderRequests = function () {
    updateCounts();
    const query = $('reqSearch').value.trim().toLowerCase();

    const rows = listFor(tab).filter((a) => !query || Store.patientName(a).toLowerCase().includes(query));

    $('reqRows').innerHTML = rows.length
      ? rows.map((a) => {
          const p = Store.dateParts(a);
          return `
            <div class="req-row">
              <div>
                <div class="date-block sm">
                  <span class="date-block-month">${p.month}</span>
                  <span class="date-block-day">${p.day}</span>
                  <span class="date-block-year">${p.year}</span>
                  <span class="date-block-weekday">${p.weekday}</span>
                  <span class="date-block-time">${D.esc(a.time)}</span>
                </div>
              </div>
              <div class="req-patient"><strong>${D.esc(Store.patientName(a))}</strong><span>${D.esc(Store.patientContact(a))}</span></div>
              <div>${D.esc(a.service)}</div>
              <div>${D.statusBadge(a.status)}</div>
              <div class="req-actions">${actionsFor(a)}</div>
            </div>`;
        }).join('')
      : `<div class="empty-note">${query ? 'No patients match your search.' : 'No ' + tab.toLowerCase() + ' appointments.'}</div>`;
  };

  /* ---------- change a status and save ---------- */
  function setStatus(id, status) {
    const list = Store.getAppointments();
    const a = list.find((x) => x.id === id);
    if (!a) return null;
    a.status = status;
    if (!Store.saveAppointments(list)) { window.renderRequests(); D.refreshBadges(); return null; }   // server said no (message already shown)
    window.renderRequests();
    D.refreshBadges();
    return a;
  }

  /* ---------- tell the patient (shows on the patient's bell) ---------- */
  function describe(a) { return `${a.service} on ${D.formatDate(Store.apptDate(a))} at ${a.time}`; }

  function notifyPatient(a, type, title, message) {
    if (!a || !a.patientId) return;
    Store.addNotification({ to: a.patientId, type: type, title: title, message: message, apptId: a.id });
  }

  window.acceptRequest = function (id) {
    const a = Store.getAppointments().find((x) => x.id === id);
    if (!a) return;
    const clash = Store.getAppointments().some((x) =>
      x.id !== id && x.status === 'Confirmed' && x.date === a.date && x.time === a.time);
    if (clash) {
      D.toast('Another appointment is already confirmed at that time.', 'error');
      return;
    }
    const done = setStatus(id, 'Confirmed');
    if (!done) return;
    notifyPatient(done, 'confirmed', 'Appointment confirmed',
      `${Store.DENTIST_NAME} accepted your request for ${describe(done)}.`);
    D.toast('Appointment accepted. The patient was notified.');
  };

  window.rejectRequest = function (id) {
    D.askConfirm({
      title: 'Reject this request?',
      text: 'The patient will see this appointment as Cancelled.',
      yes: 'Yes, Reject',
      onYes: function () {
        const done = setStatus(id, 'Cancelled');
        if (!done) return;
        notifyPatient(done, 'declined', 'Appointment declined',
          `${Store.DENTIST_NAME} declined your request for ${describe(done)}. Please book another time.`);
        D.toast('Request rejected. The patient was notified.');
      }
    });
  };

  window.completeAppointment = function (id) {
    const done = setStatus(id, 'Completed');
    if (!done) return;
    notifyPatient(done, 'completed', 'Appointment completed',
      `Your ${describe(done)} was marked as completed. Thank you for visiting Ambayec Dental Care Clinic!`);
    D.toast('Marked as completed. The patient was notified.');
  };

  window.cancelConfirmed = function (id) {
    D.askConfirm({
      title: 'Cancel this appointment?',
      text: 'The patient will see this appointment as Cancelled.',
      yes: 'Yes, Cancel',
      onYes: function () {
        const done = setStatus(id, 'Cancelled');
        if (!done) return;
        notifyPatient(done, 'cancelled', 'Appointment cancelled by the clinic',
          `${Store.DENTIST_NAME} cancelled your ${describe(done)}. Please book another time.`);
        D.toast('Appointment cancelled. The patient was notified.');
      }
    });
  };

  D.onShow.appointmentsPage = function () { window.renderRequests(); };
})();
