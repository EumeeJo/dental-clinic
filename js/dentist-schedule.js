/* ============================================================
   dentist-schedule.js - Manage Schedule page (weekly grid)
   - green  = Available   (click to mark Unavailable)
   - red    = Unavailable (click to make it Available again)
   - purple = Booked by a patient (click for details)
   Patients can only book times that are green. Needs dentist.js first.
   ============================================================ */
(function () {
  const D = window.Dentist;
  if (!D) return;
  const Store = D.Store;
  const $ = D.$;

  const SLOTS = Store.SLOTS;
  const CLOSING_TIME = '6:00 PM';                 // the end of the last slot
  let weekStartDate = D.weekStart(D.today);

  /* ---------- label like "October 5 - 11, 2026" ---------- */
  function weekLabel(start) {
    const end = D.addDays(start, 6);
    const month = (d) => d.toLocaleDateString('en-US', { month: 'long' });
    if (start.getFullYear() !== end.getFullYear()) {
      return `${month(start)} ${start.getDate()}, ${start.getFullYear()} - ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (start.getMonth() !== end.getMonth()) {
      return `${month(start)} ${start.getDate()} - ${month(end)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${month(start)} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
  }

  /* ---------- draw the grid ---------- */
  function renderSchedule() {
    $('schedWeekLabel').textContent = weekLabel(weekStartDate);

    const days = [];
    for (let i = 0; i < 7; i++) days.push(D.addDays(weekStartDate, i));

    const booked = Store.bookedMap(['Pending', 'Confirmed', 'Completed']);
    const blocked = new Set(Store.getBlocked().map((b) => b.date + '|' + b.time));
    const todayKey = D.toKey(D.today);

    let html = '<div class="sched-corner">Time</div>';
    days.forEach((d) => {
      const isToday = D.toKey(d) === todayKey;
      html += `<div class="sched-day${isToday ? ' today' : ''}">
                 <strong>${d.toLocaleDateString('en-US', { weekday: 'short' })}</strong>
                 <span>${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getDate()}</span>
               </div>`;
    });

    SLOTS.forEach((slot) => {
      html += `<div class="sched-time">${slot.replace(' ', '')}</div>`;

      days.forEach((d) => {
        const key = D.toKey(d);
        const cellKey = key + '|' + slot;
        const past = d < D.today;
        const appt = booked[cellKey];

        if (appt) {
          html += `<button class="sch-cell booked${appt.status === 'Pending' ? ' pending' : ''}${past ? ' past' : ''}"
                           title="${D.esc(appt.service)} - ${D.esc(appt.status)}"
                           onclick="viewScheduleAppt('${D.esc(appt.id)}')">
                     <b>${D.esc(Store.patientName(appt))}</b>${D.esc(appt.service)}
                   </button>`;
        } else if (blocked.has(cellKey)) {
          html += `<button class="sch-cell unavailable${past ? ' past' : ''}" ${past ? 'disabled' : ''}
                           onclick="toggleSlot('${key}', '${slot}')">Unavailable</button>`;
        } else {
          html += `<button class="sch-cell available${past ? ' past' : ''}" ${past ? 'disabled' : ''}
                           onclick="toggleSlot('${key}', '${slot}')">Available</button>`;
        }
      });
    });

    $('schedGrid').innerHTML = html;
  }

  /* ---------- clicks ---------- */
  window.changeWeek = function (step) {
    weekStartDate = D.addDays(weekStartDate, step * 7);
    renderSchedule();
  };

  window.toggleSlot = function (dateKey, time) {
    const item = { date: dateKey, time: time };
    Store.setBlocked([item], !Store.isBlocked(dateKey, time));     // blocked -> open, open -> blocked
    renderSchedule();
  };

  window.viewScheduleAppt = function (id) {
    const a = Store.getAppointments().find((x) => x.id === id);
    if (a) D.openApptDetails(a);
  };

  /* ---------- + Add Schedule pop-up ---------- */
  function fillTimeSelects() {
    $('schStart').innerHTML = SLOTS.map((t) => `<option value="${t}">${t}</option>`).join('');
    const ends = SLOTS.slice(1).concat(CLOSING_TIME);
    $('schEnd').innerHTML = ends.map((t) => `<option value="${t}">${t}</option>`).join('');
    $('schEnd').value = CLOSING_TIME;
  }

  window.openAddSchedule = function () {
    const todayKey = D.toKey(D.today);
    $('schFrom').min = todayKey;
    $('schTo').min = todayKey;
    $('schFrom').value = todayKey;
    $('schTo').value = todayKey;
    $('schStart').value = SLOTS[0];
    $('schEnd').value = CLOSING_TIME;
    document.querySelector('input[name="schMode"][value="block"]').checked = true;
    $('schError').textContent = '';
    D.openModal('scheduleModal');
  };

  window.applySchedule = function () {
    const fromKey = $('schFrom').value;
    const toKeyValue = $('schTo').value || fromKey;
    const mode = document.querySelector('input[name="schMode"]:checked').value;
    const error = (msg) => { $('schError').textContent = msg; };

    if (!fromKey) return error('Please choose a date.');
    const from = Store.parseKey(fromKey);
    const to = Store.parseKey(toKeyValue);
    if (from < D.today) return error('Please choose today or a later date.');
    if (to < from) return error('The end date must be the same as or after the start date.');
    if ((to - from) / 86400000 > 90) return error('Please choose 90 days or less at a time.');

    const startIdx = SLOTS.indexOf($('schStart').value);
    const endValue = $('schEnd').value;
    const endIdx = endValue === CLOSING_TIME ? SLOTS.length : SLOTS.indexOf(endValue);
    if (endIdx <= startIdx) return error('The end time must be after the start time.');

    const taken = Store.bookedMap(['Pending', 'Confirmed']);
    const items = [];
    let skipped = 0;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = D.toKey(d);
      for (let i = startIdx; i < endIdx; i++) {
        if (mode === 'block' && taken[key + '|' + SLOTS[i]]) { skipped++; continue; }   // never block a booked time
        items.push({ date: key, time: SLOTS[i] });
      }
    }

    Store.setBlocked(items, mode === 'block');
    window.closeModal('scheduleModal');
    renderSchedule();

    const verb = mode === 'block' ? 'unavailable' : 'available again';
    D.toast(`${items.length} time slot${items.length === 1 ? '' : 's'} marked ${verb}.` +
      (skipped ? ` ${skipped} booked slot${skipped === 1 ? ' was' : 's were'} skipped.` : ''));
  };

  /* ---------- + Book for Patient pop-up ----------
     The dentist schedules an appointment for a patient (phone call, walk-in).
     It is confirmed right away and the patient gets a notification. */
  function minutesNow() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

  window.openBookPatient = function () {
    const patients = Store.getPatients().sort((a, b) => Store.personName(a).localeCompare(Store.personName(b)));
    $('bpPatient').innerHTML =
      '<option value="">Select a patient...</option>' +
      '<option value="__new">+ New walk-in patient</option>' +
      patients.map((p) => `<option value="${D.esc(p.patientId)}">${D.esc(Store.personName(p))}</option>`).join('');

    $('bpService').innerHTML = Store.SERVICES.map((sv) => `<option value="${D.esc(sv)}">${D.esc(sv)}</option>`).join('');

    ['bpFirst', 'bpLast', 'bpContact'].forEach((id) => { $(id).value = ''; });
    $('bpNewFields').style.display = 'none';

    const todayKey = D.toKey(D.today);
    $('bpDate').min = todayKey;
    $('bpDate').value = todayKey;
    $('bpError').textContent = '';
    window.bpRefreshTimes();
    D.openModal('bookPatientModal');
  };

  window.bpPatientChanged = function () {
    $('bpNewFields').style.display = $('bpPatient').value === '__new' ? 'grid' : 'none';
  };

  // only the times that are really free on the chosen date
  window.bpRefreshTimes = function () {
    const dateKey = $('bpDate').value;
    const select = $('bpTime');

    if (!dateKey) { select.innerHTML = '<option value="">Pick a date first</option>'; return; }

    const isToday = dateKey === D.toKey(D.today);
    const free = SLOTS.filter((t) => Store.isSlotFree(dateKey, t) && (!isToday || Store.timeValue(t) > minutesNow()));

    select.innerHTML = free.length
      ? free.map((t) => `<option value="${t}">${t}</option>`).join('')
      : '<option value="">No free times on this date</option>';
  };

  window.saveBookPatient = function () {
    const error = (msg) => { $('bpError').textContent = msg; };
    const choice = $('bpPatient').value;
    const service = $('bpService').value;
    const dateKey = $('bpDate').value;
    const time = $('bpTime').value;

    if (!choice) return error('Please select a patient.');

    let patient;
    const walkIn = choice === '__new';
    if (walkIn) {
      const first = $('bpFirst').value.trim();
      const last = $('bpLast').value.trim();
      if (!first || !last) return error('Please enter the walk-in patient\'s first and last name.');
      patient = {
        patientId: Store.nextPatientId(), firstName: first, middleName: '', lastName: last,
        dob: '', gender: '', contact: $('bpContact').value.trim(), email: '', address: ''
      };
    } else {
      patient = Store.getPatient(choice);
      if (!patient) return error('That patient could not be found.');
    }

    if (!dateKey) return error('Please choose a date.');
    if (Store.parseKey(dateKey) < D.today) return error('Please choose today or a later date.');
    if (!time) return error('Please choose a time.');
    if (!Store.isSlotFree(dateKey, time)) { window.bpRefreshTimes(); return error('That time was just taken. Please pick another.'); }

    if (!patient.patientId) return;                       // the server could not give an ID (message already shown)
    if (walkIn && !Store.upsertPatient(patient)) return;  // walk-ins now appear in the Patient List

    const appt = {
      id: Store.nextAppointmentId(),
      patientId: patient.patientId,
      patientName: Store.personName(patient),
      patientContact: patient.contact,
      service: service,
      dentist: Store.DENTIST_NAME,
      date: dateKey,
      time: time,
      status: 'Confirmed',                                // booked by the dentist = confirmed
      createdBy: 'dentist'
    };
    const list = Store.getAppointments();
    if (!appt.id) return;
    list.push(appt);
    if (!Store.saveAppointments(list)) { window.bpRefreshTimes(); return; }   // someone took the time / server said no

    if (!walkIn) {                                        // walk-ins have no account to notify
      Store.addNotification({
        to: patient.patientId, type: 'scheduled', title: 'Appointment scheduled', apptId: appt.id,
        message: `${Store.DENTIST_NAME} scheduled a ${service} for you on ${D.formatDate(Store.parseKey(dateKey))} at ${time}.`
      });
    }

    window.closeModal('bookPatientModal');
    weekStartDate = D.weekStart(Store.parseKey(dateKey));  // jump to the week that now has the booking
    renderSchedule();
    D.toast(`Booked ${appt.patientName} for ${service} on ${D.formatDate(Store.parseKey(dateKey))} at ${time}.`);
  };

  D.onShow.schedulePage = function () {
    weekStartDate = D.weekStart(D.today);
    renderSchedule();
  };

  fillTimeSelects();
})();
