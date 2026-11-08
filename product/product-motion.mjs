// Page motion: the hero's entrance, scroll-linked hero/product movement, section reveals,
// a scroll progress bar and the nav's glass state.
// The inline script in <head> sets html.pm before the first paint (so the hero's CSS entrance never
// flashes); it skips reduced motion and headless QA shots, and then this file does nothing either.
const html = document.documentElement;

if (html.classList.contains('pm')) init();

function init() {
  // ---------------------------------------------------------------- hero numbers
  // once the facts have risen in (CSS entrance at .56s), each number counts up from 0 and pops
  document.querySelectorAll('[data-pm-count]').forEach((el, i) => {
    const m = el.textContent.trim().match(/^(\d+)(.*)$/);
    if (!m) return;
    const target = +m[1];
    const num = document.createElement('span');
    num.className = 'pm-num';
    num.textContent = m[1];
    el.replaceChildren(num, m[2]);
    num.textContent = '0';
    setTimeout(() => {
      // hold the final number's width (measured now, in the loaded font) so the suffix never shifts
      num.textContent = m[1];
      num.style.minWidth = `${num.getBoundingClientRect().width}px`;
      num.textContent = '0';
      el.classList.add('pm-pop');
      const t0 = performance.now(), ms = 1400;
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        num.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 650 + i * 120);
  });

  // ---------------------------------------------------------------- reveals (once, on scroll)
  const groups = [
    ['.product-copy h2', '.product-lead', '.feature-list > div', '.product-copy > .link'],
    ['.product-visual'],
    ['.closing__cta h2', '.closing__cta > p', '.closing__cta .btn-row'],
    ['.privacy-notes > div', '.footer__legal'],
  ];
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  for (const group of groups) {
    let i = 0;
    for (const sel of group) {
      document.querySelectorAll(sel).forEach(el => {
        el.classList.add('pm-reveal');
        el.style.setProperty('--pm-d', `${i++ * 90}ms`);
        io.observe(el);
      });
    }
  }

  // ---------------------------------------------------------------- scroll-linked
  const bar = document.createElement('div');
  bar.className = 'pm-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);

  const nav = document.querySelector('.nav');
  const hero = document.querySelector('.midnight-hero');
  const visual = document.querySelector('.product-visual');
  const clamp = v => Math.min(1, Math.max(0, v));
  let queued = false;

  const update = () => {
    queued = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    html.style.setProperty('--pm-sp', max > 0 ? clamp(y / max).toFixed(4) : '0');
    nav?.classList.toggle('is-scrolled', y > 8);
    // the page's last lines can sit inside the observer's bottom margin: at the very end, show what is left
    if (max > 0 && y >= max - 2) document.querySelectorAll('.pm-reveal:not(.is-in)').forEach(el => { el.classList.add('is-in'); io.unobserve(el); });
    if (hero) hero.style.setProperty('--pm-hp', clamp(y / hero.offsetHeight).toFixed(4));
    if (visual) {
      const r = visual.getBoundingClientRect();
      // 0 when its top meets the bottom of the screen, 1 when its bottom leaves the top
      visual.style.setProperty('--pm-pp', clamp((innerHeight - r.top) / (innerHeight + r.height)).toFixed(4));
    }
  };
  const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  update();
}
