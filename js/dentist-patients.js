/* ============================================================
   dentist-patients.js - Patient List (search, View, Edit)
   Patients come from the shared directory in clinic-store.js:
   everyone who registers appears here automatically.
   Needs dentist.js loaded first.
   ============================================================ */
(function () {
  const D = window.Dentist;
  if (!D) return;
  const Store = D.Store;
  const $ = D.$;

  let editingId = null;

  // latest COMPLETED visit of a patient, shown like 10/4/26
  function lastVisit(patientId) {
    const done = Store.getAppointments()
      .filter((a) => a.patientId === patientId && a.status === 'Completed')
      .sort((a, b) => Store.compareAppts(b, a));
    if (!done.length) return '—';
    const d = Store.apptDate(done[0]);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }

  window.renderPatients = function () {
    const query = $('patientSearch').value.trim().toLowerCase();

    const rows = Store.getPatients()
      .filter((p) => !query || Store.personName(p).toLowerCase().includes(query))
      .sort((a, b) => Store.personName(a).localeCompare(Store.personName(b)));

    $('patientRows').innerHTML = rows.length
      ? rows.map((p) => `
          <div class="pat-row">
            <span class="name">${D.esc(Store.personName(p))}</span>
            <span>${D.esc(p.contact || '—')}</span>
            <span>${D.esc(p.email || '—')}</span>
            <span>${lastVisit(p.patientId)}</span>
            <div class="pat-actions">
              <button class="btn-mini" onclick="viewPatient('${D.esc(p.patientId)}')">View</button>
              <button class="btn-mini" onclick="editPatient('${D.esc(p.patientId)}')">Edit</button>
            </div>
          </div>`).join('')
      : '<div class="empty-note">No patients found.</div>';
  };

  /* ---------- View ---------- */
  window.viewPatient = function (id) {
    const p = Store.getPatient(id);
    if (!p) return;

    const age = Store.calculateAge(p.dob);
    $('pvName').textContent = Store.personName(p);
    $('pvId').textContent = p.patientId;
    $('pvAge').textContent = age === null ? '—' : age + (age === 1 ? ' year old' : ' years old');
    $('pvGender').textContent = p.gender || '—';
    $('pvContact').textContent = p.contact || '—';
    $('pvEmail').textContent = p.email || '—';
    $('pvAddress').textContent = p.address || '—';

    const visits = Store.getAppointments()
      .filter((a) => a.patientId === id)
      .sort((a, b) => Store.compareAppts(b, a));

    $('pvVisits').innerHTML = visits.length
      ? visits.map((a) => `
          <div class="pv-visit">
            <span>${D.esc(D.formatDate(Store.apptDate(a)))}, ${D.esc(a.time)}</span>
            <span>${D.esc(a.service)}</span>
            ${D.statusBadge(a.status)}
          </div>`).join('')
      : '<div class="empty-note">No appointments yet.</div>';

    D.openModal('patientViewModal');
  };

  /* ---------- Edit ---------- */
  window.editPatient = function (id) {
    const p = Store.getPatient(id);
    if (!p) return;
    editingId = id;
    $('peFirst').value = p.firstName || '';
    $('peLast').value = p.lastName || '';
    $('peContact').value = p.contact || '';
    $('peEmail').value = p.email || '';
    $('peError').textContent = '';
    D.openModal('patientEditModal');
  };

  window.savePatientEdit = function () {
    const first = $('peFirst').value.trim();
    const last = $('peLast').value.trim();
    const contact = $('peContact').value.trim();
    const email = $('peEmail').value.trim();
    const error = (msg) => { $('peError').textContent = msg; };

    if (!first || !last) return error('First name and last name are required.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error('Please enter a valid email address.');

    const p = Store.getPatient(editingId);
    if (!p) return;
    Object.assign(p, { firstName: first, lastName: last, contact: contact, email: email });
    if (!Store.upsertPatient(p)) return;             // the server also updates the patient's own profile + their appointments

    window.closeModal('patientEditModal');
    window.renderPatients();
    D.toast('Patient updated.');
  };

  D.onShow.patientsPage = function () { window.renderPatients(); };
})();
