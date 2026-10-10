/* ============================================================
   notifications.js - animated notification bell + inbox panel
   Shared by the patient dashboard AND the dentist dashboard.
   Load it after clinic-store.js and BEFORE patient.js / dentist.js.

   Use:
     <div id="notifMount"></div>          (in the page)
     Notifications.init({
       mount:     document.getElementById('notifMount'),
       recipient: () => 'dentist',        // or () => patientId
       onSelect:  (notification) => { ...open the right page... }
     });

   The bell swings and shows a red dot while something is unread.
   It also updates by itself when another tab (for example the
   dentist's page) creates a notification for you.
   ============================================================ */
(function () {

  const Store = window.ClinicStore;
  if (!Store) return;

  let cfg = null;
  let tab = 'unread';            // 'unread' | 'all'
  let lastUnread = null;

  /* type -> colour + icon (the icon sits in a coloured circle) */
  const TYPES = {
    'request':           { color: '#19a5cf', icon: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM11 11h2v2h2v2h-2v2h-2v-2H9v-2h2z' },
    'scheduled':         { color: '#8e63d1', icon: 'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zM10.500 17 7.500 14l1.400-1.400 1.600 1.600 4.600-4.600L16.500 11z' },
    'confirmed':         { color: '#2fb457', icon: 'M9.500 16.500 5 12l1.500-1.500 3 3 8-8L19 7z' },
    'completed':         { color: '#2fb457', icon: 'M9.500 16.500 5 12l1.500-1.500 3 3 8-8L19 7z' },
    'declined':          { color: '#d64545', icon: 'M6.500 5 12 10.500 17.500 5 19 6.500 13.500 12 19 17.500 17.500 19 12 13.500 6.500 19 5 17.500 10.500 12 5 6.500z' },
    'cancelled':         { color: '#d64545', icon: 'M6.500 5 12 10.500 17.500 5 19 6.500 13.500 12 19 17.500 17.500 19 12 13.500 6.500 19 5 17.500 10.500 12 5 6.500z' },
    'patient-cancelled': { color: '#d64545', icon: 'M6.500 5 12 10.500 17.500 5 19 6.500 13.500 12 19 17.500 17.500 19 12 13.500 6.500 19 5 17.500 10.500 12 5 6.500z' }
  };
  const FALLBACK = { color: '#19a5cf', icon: 'M12 2a7 7 0 0 0-7 7v5l-2 3h18l-2-3V9a7 7 0 0 0-7-7z' };

  const BELL_SVG = `
    <svg class="bell-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path class="bell-body" d="M12 2.500a1.300 1.300 0 0 0-1.300 1.300v.6C8.100 5 6.500 7.200 6.500 10v4.200L4.800 16.500a.9.9 0 0 0 .7 1.500h13a.9.9 0 0 0 .7-1.500l-1.700-2.300V10c0-2.800-1.600-5-4.200-5.600v-.6A1.300 1.300 0 0 0 12 2.500z"/>
      <path class="bell-clapper" d="M9.800 19h4.400a2.200 2.200 0 0 1-4.400 0z"/>
    </svg>`;

  const $ = (id) => document.getElementById(id);
  const esc = Store.esc;

  function recipient() { return cfg.recipient(); }

  function formatTime(iso) {                         // 10/7/2026 5:23 PM
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', '');
  }

  /* ---------- build the bell + panel once ---------- */
  function build() {
    cfg.mount.innerHTML = `
      <div class="notif-wrap">
        <button type="button" class="notif-bell" id="notifBell" aria-label="Notifications" title="Notifications">
          ${BELL_SVG}
          <span class="notif-dot" id="notifDot" style="display:none"></span>
        </button>

        <div class="notif-panel" id="notifPanel" role="dialog" aria-label="Notifications">
          <div class="notif-head">
            <div class="notif-title">${BELL_SVG}<span>Notifications</span><em id="notifCount"></em></div>
            <button type="button" class="notif-markall" id="notifMarkAll" title="Mark all as read" aria-label="Mark all as read">
              <svg viewBox="0 0 24 24"><path d="M1.500 12.500 6 17l1.200-1.200L2.700 11.300zM22 7l-1.300-1.300L11.500 14.900 8 11.400l-1.300 1.300 4.800 4.800zM17.500 7 16.200 5.700 9.500 12.400l1.300 1.300z"/></svg>
            </button>
          </div>
          <div class="notif-tabs">
            <button type="button" class="notif-tab active" data-tab="unread">Unread</button>
            <button type="button" class="notif-tab" data-tab="all">All</button>
          </div>
          <div class="notif-list" id="notifList"></div>
        </div>
      </div>`;

    $('notifBell').addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });
    $('notifPanel').addEventListener('click', (e) => e.stopPropagation());

    $('notifMarkAll').addEventListener('click', () => {
      Store.markAllNotificationsRead(recipient());
      refresh();
    });

    cfg.mount.querySelectorAll('.notif-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        tab = btn.dataset.tab;
        cfg.mount.querySelectorAll('.notif-tab').forEach((b) => b.classList.toggle('active', b === btn));
        renderList();
      });
    });

    $('notifList').addEventListener('click', (e) => {
      const item = e.target.closest('.notif-item');
      if (!item) return;
      const n = Store.getNotifications(recipient()).find((x) => x.id === item.dataset.id);
      if (!n) return;
      Store.markNotificationRead(n.id);
      closePanel();
      refresh();
      if (typeof cfg.onSelect === 'function') cfg.onSelect(n);
    });

    document.addEventListener('click', closePanel);                 // click anywhere else closes it
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });
  }

  function togglePanel() {
    const open = $('notifPanel').classList.toggle('open');
    if (open) renderList();
  }
  function closePanel() { const p = $('notifPanel'); if (p) p.classList.remove('open'); }

  /* ---------- list ---------- */
  function renderList() {
    const all = Store.getNotifications(recipient());
    const list = tab === 'unread' ? all.filter((n) => !n.read) : all;

    $('notifList').innerHTML = list.length
      ? list.map((n) => {
          const t = TYPES[n.type] || FALLBACK;
          return `
            <div class="notif-item${n.read ? '' : ' unread'}" data-id="${esc(n.id)}" style="--accent:${t.color}">
              <span class="notif-avatar"><svg viewBox="0 0 24 24"><path d="${t.icon}"/></svg></span>
              <div class="notif-body">
                <div class="notif-row">
                  <strong>${esc(n.title)}</strong>
                  <time>${esc(formatTime(n.time))}</time>
                </div>
                <div class="notif-msg">${esc(n.message)}</div>
              </div>
            </div>`;
        }).join('')
      : `<div class="notif-empty">${tab === 'unread' ? 'You’re all caught up!' : 'No notifications yet.'}</div>`;
  }

  /* ---------- keep the bell in step with the data ---------- */
  function refresh() {
    if (!cfg) return;
    const unread = Store.unreadCount(recipient());
    const bell = $('notifBell');

    $('notifDot').style.display = unread > 0 ? 'block' : 'none';
    bell.classList.toggle('has-unread', unread > 0);
    $('notifCount').textContent = unread > 0 ? unread + ' new' : '';

    // a new notification arrived while this page is open: ring right away
    if (lastUnread !== null && unread > lastUnread) {
      bell.classList.remove('ring-now');
      void bell.offsetWidth;                    // restart the animation
      bell.classList.add('ring-now');
    }
    lastUnread = unread;

    if ($('notifPanel').classList.contains('open')) renderList();
  }

  function init(options) {
    cfg = options;
    if (!cfg || !cfg.mount) return;
    build();
    refresh();

    window.addEventListener('clinicstore:updated', refresh);   // the store found something new on the server
    document.addEventListener('visibilitychange', refresh);
  }

  window.Notifications = { init, refresh };
})();
