/* ============================================================
   greeting.js - time-of-day greeting for the whole system
   Uses the clock of the device the page is opened on.

   How to use it on any page:
     1. add   <script src="js/greeting.js"></script>
     2. write <span data-greeting></span>   where the greeting should appear
        e.g.  <h2><span data-greeting></span>, Chai!</h2>

   Hours (device time):
     5:00 AM - 11:59 AM  -> Good Morning
     12:00 PM - 5:59 PM  -> Good Afternoon
     6:00 PM - 4:59 AM   -> Good Evening
   ============================================================ */
(function () {

  function getGreeting(date) {
    const hour = (date || new Date()).getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  function updateGreetings() {
    const text = getGreeting();
    document.querySelectorAll('[data-greeting]').forEach((el) => {
      if (el.textContent !== text) el.textContent = text;
    });
  }

  window.getGreeting = getGreeting;

  updateGreetings();                              // right away
  setInterval(updateGreetings, 60 * 1000);        // and keep it right if the page stays open past noon / 6 PM
  document.addEventListener('visibilitychange', updateGreetings);
})();