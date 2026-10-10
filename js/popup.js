/* ============================================================
   popup.js - system pop-up (replaces the browser's plain alert box)

   Load it on any page (also set <link href="css/popup.css">):
     <script src="js/popup.js"></script>

   Use:
     SystemPopup.show({ type: 'success', title: 'Done!', message: 'Saved.', button: 'OK', onClose: () => {} });
     type: 'success' | 'error' | 'warning' | 'info'
   Every old alert('...') on the page now shows this pop-up too.
   ============================================================ */
(function () {

  const ICONS = {
    success: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    error:   '<path d="M6 6l12 12M18 6L6 18"/>',
    warning: '<path d="M12 6v7M12 17.5v.5"/>',
    info:    '<path d="M12 11v6M12 7v.5"/>'
  };
  const TITLES = { success: 'Success', error: 'Something went wrong', warning: 'Please check', info: 'Notice' };

  const queue = [];
  let overlay = null;
  let current = null;

  function esc(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'sys-popup-overlay';
    overlay.innerHTML =
      '<div class="sys-popup-card" role="alertdialog" aria-modal="true" aria-labelledby="sysPopupTitle" aria-describedby="sysPopupText">' +
        '<div class="sys-popup-icon"><svg viewBox="0 0 24 24" id="sysPopupIcon"></svg></div>' +
        '<h3 class="sys-popup-title" id="sysPopupTitle"></h3>' +
        '<p class="sys-popup-text" id="sysPopupText"></p>' +
        '<button type="button" class="sys-popup-btn" id="sysPopupBtn">OK</button>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('#sysPopupBtn').addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (!current) return;
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
    });
  }

  function open(opts) {
    build();
    const type = ICONS[opts.type] ? opts.type : 'info';
    current = opts;
    overlay.querySelector('.sys-popup-card').className = 'sys-popup-card ' + type;
    overlay.querySelector('#sysPopupIcon').innerHTML = ICONS[type];
    overlay.querySelector('#sysPopupTitle').textContent = opts.title || TITLES[type];
    overlay.querySelector('#sysPopupText').innerHTML = esc(opts.message || '').replace(/\n/g, '<br>');
    overlay.querySelector('#sysPopupBtn').textContent = opts.button || 'OK';
    // two frames so the open animation always plays
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('open');
      overlay.querySelector('#sysPopupBtn').focus();
    }));
  }

  function close() {
    if (!current) return;
    const done = current.onClose;
    current = null;
    overlay.classList.remove('open');
    setTimeout(() => {
      if (queue.length) open(queue.shift());
      if (typeof done === 'function') done();
    }, 220);
  }

  function show(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    opts = opts || {};
    const go = () => { if (current) queue.push(opts); else open(opts); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  /* guess the style of an old-fashioned alert('...') from its words */
  function guessType(text) {
    const t = String(text).toLowerCase();
    if (/success|saved|updated|registered|confirmed|created/.test(t) && !/not |fail|cannot|can't/.test(t)) return 'success';
    if (/sorry|cannot|can't|could not|couldn't|failed|incorrect|wrong|error|unable|no longer|not available|missing|unexpected/.test(t)) return 'error';
    if (/please|must|required|do not match|invalid|check/.test(t)) return 'warning';
    return 'info';
  }

  window.SystemPopup = { show, close };

  window.alert = function (message) {
    show({ type: guessType(message), message: String(message) });
  };
})();
