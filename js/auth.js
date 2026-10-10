// Session helpers (the real session lives on the server - see api/auth.php)
function getCurrentUser() {
  const me = window.ClinicStore ? window.ClinicStore.getMe() : {};
  return { firstName: me.firstName || '' };
}

function logoutUser() {
  const done = () => { window.location.href = 'login.html'; };
  fetch('api/auth.php?action=logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'ambayec' }
  }).then(done, done);
}

// ---- Age helpers (used by register.js and the patient Profile page) ----
const MINIMUM_ACCOUNT_AGE = 18;   // patients under 18 must be registered by a parent/guardian

// Age in whole years from a date of birth ("YYYY-MM-DD").
// Returns null when the date is missing, invalid, or in the future.
function calculateAge(dob) {
  if (!dob) return null;
  const [y, m, d] = String(dob).split('-').map(Number);
  if (!y || !m || !d) return null;

  const birth = new Date(y, m - 1, d);
  const now = new Date();
  if (isNaN(birth) || birth > now) return null;

  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday = now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age--;
  return age;
}

// "24 years old" / "1 year old"
function formatAge(age) {
  return age === null ? '' : age + (age === 1 ? ' year old' : ' years old');
}