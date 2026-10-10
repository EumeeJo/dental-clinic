document.addEventListener('DOMContentLoaded', () => {
  const links = Array.from(document.querySelectorAll('.nav-item[href^="#"]'));
  const sections = links.map((l) => document.querySelector(l.getAttribute('href'))).filter(Boolean);
  const header = document.querySelector('.navbar-wrapper');
  let lockUntil = 0;   // after a click, ignore scroll events while the smooth scroll runs

  function setActive(id) {
    links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + id));
  }

  function updateActive() {
    if (Date.now() < lockUntil || !sections.length) return;

    const offset = header.offsetHeight + 80;
    let current = sections[0].id;
    sections.forEach((s) => {
      if (s.getBoundingClientRect().top <= offset) current = s.id;
    });

    // at the very bottom of the page, the last section (About) is the active one
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      current = sections[sections.length - 1].id;
    }
    setActive(current);
  }

  links.forEach((l) => {
    l.addEventListener('click', () => {
      setActive(l.getAttribute('href').slice(1));
      lockUntil = Date.now() + 900;
      setTimeout(updateActive, 950);
    });
  });

  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', updateActive);
  updateActive();
});
