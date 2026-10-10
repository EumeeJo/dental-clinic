/* ============================================================
   booking.js - Book Appointment (steps 1-3 + submitted pop-up)
   Needs patient.js (and clinic-store.js) loaded first.
   ============================================================ */
(function () {
  const P = window.Patient;
  if (!P) return;                     // patient.js stopped (missing clinic-store.js)
  const $ = P.$;

  /* ---------- Settings: edit the clinic's availability here ---------- */
  const UNAVAILABLE_WEEKDAYS = [0];   // 0 = Sunday, 1 = Monday ... 6 = Saturday (Sunday is by appointment only)
  const UNAVAILABLE_DATES = [];       // e.g. ['2026-10-31', '2026-12-25']  (YYYY-MM-DD)

  const DEFAULT_SERVICE = 'Dental Cleaning';
  const booking = { service: DEFAULT_SERVICE, date: null, time: null };
  let lastSubmitted = null;

  let viewYear = P.today.getFullYear();
  let viewMonth = P.today.getMonth();

  // the bookable times are the buttons in patient-dashboard.html
  const TIME_BUTTONS = Array.from(document.querySelectorAll('.time-btn'));
  const SLOTS = TIME_BUTTONS.map((b) => b.textContent.trim());

  /* A time is free when the dentist has not blocked it and nobody else booked it. */
  function freeSlots(date) {
    const key = P.toKey(date);
    return SLOTS.filter((t) => P.isSlotFree(key, t));
  }

  /* ---------- Step 1: service ---------- */
  window.selectService = function (element) {
    document.querySelectorAll('.booking-card').forEach((c) => c.classList.remove('selected'));
    element.classList.add('selected');
    booking.service = element.dataset.service;
  };

  window.cancelBooking = function () {
    resetBooking();
    P.showSection('dashOverview');
  };

  /* ---------- Step 2: calendar + time ---------- */
  function renderCalendar() {
    const daysEl = $('calendarDays');
    daysEl.innerHTML = '';

    const monthStart = new Date(viewYear, viewMonth, 1);
    $('calMonthLabel').textContent = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    $('calPrev').disabled = (viewYear === P.today.getFullYear() && viewMonth === P.today.getMonth());

    for (let i = 0; i < monthStart.getDay(); i++) {
      daysEl.appendChild(document.createElement('span'));    // empty cells before day 1
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day';
      btn.textContent = d;

      const isPast = date < P.today;
      const isUnavailable = !isPast && (
        UNAVAILABLE_WEEKDAYS.includes(date.getDay()) ||
        UNAVAILABLE_DATES.includes(P.toKey(date)) ||
        freeSlots(date).length === 0              // the dentist is blocked / fully booked that day
      );

      if (isPast) {
        btn.classList.add('past');
        btn.disabled = true;
      } else if (isUnavailable) {
        btn.classList.add('unavailable');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => selectDate(date));
      }

      if (booking.date && P.toKey(booking.date) === P.toKey(date)) btn.classList.add('selected');
      daysEl.appendChild(btn);
    }
  }

  window.changeMonth = function (step) {
    viewMonth += step;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    renderCalendar();
  };

  function selectDate(date) {
    booking.date = date;
    refreshTimeButtons();
    renderCalendar();
    updateSelectedSummary();
  }

  // grey out the times that are not free on the chosen date
  function refreshTimeButtons() {
    const free = booking.date ? freeSlots(booking.date) : SLOTS;
    TIME_BUTTONS.forEach((b) => {
      const isFree = free.includes(b.textContent.trim());
      b.classList.toggle('taken', !isFree);
      if (!isFree) b.classList.remove('selected');
    });
    if (booking.time && !free.includes(booking.time)) booking.time = null;
  }

  window.selectTime = function (element) {
    if (element.classList.contains('taken')) return;
    TIME_BUTTONS.forEach((b) => b.classList.remove('selected'));
    element.classList.add('selected');
    booking.time = element.textContent.trim();
    updateSelectedSummary();
  };

  function updateSelectedSummary() {
    const dateEl = $('selectedDateText');
    const timeEl = $('selectedTimeText');

    dateEl.textContent = booking.date ? P.formatDate(booking.date) : 'Pick a date';
    dateEl.classList.toggle('placeholder-text', !booking.date);

    timeEl.textContent = booking.time || 'Pick a time';
    timeEl.classList.toggle('placeholder-text', !booking.time);

    $('step2NextBtn').disabled = !(booking.date && booking.time);   // Next needs both
  }

  /* ---------- Step 3: confirmation ---------- */
  window.goToConfirmation = function () {
    if (!booking.date || !booking.time) return;
    $('confirmDate').textContent = P.formatDate(booking.date);
    $('confirmTime').textContent = booking.time;
    $('confirmService').textContent = booking.service;
    P.showSection('bookStep3');
  };

  window.confirmBooking = function () {
    // someone may have taken the time while this page was open
    if (!P.isSlotFree(P.toKey(booking.date), booking.time)) {
      alert('Sorry, that time is no longer available. Please pick another time.');
      booking.time = null;
      refreshTimeButtons();
      updateSelectedSummary();
      P.showSection('bookStep2');
      return;
    }

    const profile = P.getProfile();
    const list = P.getAppointments();
    const appointment = {
      id: P.nextAppointmentId(),
      patientId: profile.patientId,
      patientName: P.fullName(profile),         // the dentist sees these in Appointment Requests
      patientContact: profile.contact,
      service: booking.service,
      dentist: P.DENTIST,
      date: P.toKey(booking.date),
      time: booking.time,
      status: 'Pending'                         // waits for the dentist to Accept / Reject
    };
    if (!appointment.id) return;                // the server could not give us an ID (error already shown)
    list.push(appointment);
    if (!P.saveAppointments(list)) {            // the server said no (e.g. someone just took that time)
      booking.time = null;
      refreshTimeButtons();
      renderCalendar();
      updateSelectedSummary();
      P.showSection('bookStep2');
      return;
    }

    P.notifyDentist('request', 'New appointment request',
      `${appointment.patientName} requested ${appointment.service} on ${P.formatDate(booking.date)} at ${appointment.time}.`,
      appointment.id);

    lastSubmitted = appointment;
    $('successApptId').textContent = appointment.id;
    $('successModal').classList.add('active');
  };

  /* ---------- "Appointment Submitted!" pop-up buttons ---------- */
  window.viewSubmittedAppointment = function () {
    $('successModal').classList.remove('active');
    P.showSection('dashOverview');
    resetBooking();
    if (lastSubmitted) P.openDetails(lastSubmitted);
  };

  window.backToDashboard = function () {
    $('successModal').classList.remove('active');
    P.showSection('dashOverview');
    resetBooking();
  };

  /* ---------- Reset (after cancel / submit) ---------- */
  function resetBooking() {
    booking.service = DEFAULT_SERVICE;
    booking.date = null;
    booking.time = null;
    viewYear = P.today.getFullYear();
    viewMonth = P.today.getMonth();

    document.querySelectorAll('.booking-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.service === DEFAULT_SERVICE);
    });
    TIME_BUTTONS.forEach((b) => b.classList.remove('selected', 'taken'));

    renderCalendar();
    updateSelectedSummary();
  }

  // the dentist may change the schedule while this page is open: refresh when the step opens
  P.onShow.bookStep2 = function () {
    refreshTimeButtons();
    renderCalendar();
    updateSelectedSummary();
  };

  /* ---------- Start ---------- */
  renderCalendar();
  updateSelectedSummary();
})();
