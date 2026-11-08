(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Theme toggle ---------- */
  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var items = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Copy buttons ---------- */
  var copyStatus = document.getElementById('copy-status');
  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        var old = btn.textContent;
        btn.textContent = 'Copied';
        if (copyStatus) copyStatus.textContent = 'Copied to clipboard';
        setTimeout(function () { btn.textContent = old; if (copyStatus) copyStatus.textContent = ''; }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      }
    });
  });

  /* ---------- Skills carousel ----------
     Each row holds one group of items. We clone it once so the track can slide by exactly
     one group and loop seamlessly. With reduced motion (or no JS) the rows stay as static,
     wrapped lists. */
  var SPEED = 42; // px per second: slow and calm
  var marquees = [].slice.call(document.querySelectorAll('.marquee'));

  function setupMarquee(m) {
    var track = m.querySelector('.marquee-track');
    var group = m.querySelector('.marquee-group');
    if (!track || !group || m.classList.contains('is-live')) return;
    var clone = group.cloneNode(true);
    clone.removeAttribute('aria-label');
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    m.classList.add('is-live');
    setDuration(m);
  }
  function setDuration(m) {
    var group = m.querySelector('.marquee-group');
    var track = m.querySelector('.marquee-track');
    if (!group || !track) return;
    track.style.setProperty('--dur', Math.max(20, group.scrollWidth / SPEED).toFixed(1) + 's');
  }
  if (!reduce) {
    marquees.forEach(setupMarquee);
    window.addEventListener('resize', function () { marquees.forEach(setDuration); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { marquees.forEach(setDuration); });
    }
  }

  /* ---------- Custom cursor ----------
     Only for devices with a mouse. A dot follows the pointer exactly, a ring follows with
     a little lag and changes with what is under it: it grows over links, shows an arrow over
     external links and steps aside over text fields. A thin comet trail fades behind it. */
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    var ring = document.createElement('div');
    var dot = document.createElement('div');
    var canvas = document.createElement('canvas');
    ring.className = 'cursor-ring';
    dot.className = 'cursor-dot';
    canvas.className = 'cursor-trail';
    [ring, dot, canvas].forEach(function (n) { n.setAttribute('aria-hidden', 'true'); });
    if (reduce) canvas.hidden = true;
    document.body.appendChild(canvas);
    document.body.appendChild(ring);
    document.body.appendChild(dot);
    root.classList.add('has-cursor');

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var resize = function () {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    var rgb = [61, 92, 150];
    var readAccent = function () {
      var v = getComputedStyle(root).getPropertyValue('--accent').trim();
      var m = /^#([0-9a-f]{6})$/i.exec(v);
      if (m) rgb = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    };
    readAccent();
    new MutationObserver(readAccent).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

    var mx = -100, my = -100, rx = -100, ry = -100;
    var rs = 1, rsT = 1, ds = 1, dsT = 1;
    var pressed = false, state = '';
    var pts = [];
    var LIFE = 420;
    var raf = 0;

    var TEXT = 'input, textarea, select, [contenteditable="true"]';
    var EXT = 'a[target="_blank"]';
    var LINK = 'a, button, summary, [role="button"], label';
    var SOFT = '.tool, .project-media';

    function setState(target) {
      var next = '';
      if (target && target.closest) {
        if (target.closest(TEXT)) next = 'text';
        else if (target.closest(EXT)) next = 'ext';
        else if (target.closest(LINK)) next = 'link';
        else if (target.closest(SOFT)) next = 'soft';
      }
      if (next === state) return;
      state = next;
      ring.classList.toggle('is-text', state === 'text');
      dot.classList.toggle('is-text', state === 'text');
      ring.classList.toggle('is-link', state === 'link');
      ring.classList.toggle('is-ext', state === 'ext');
      ring.classList.toggle('is-soft', state === 'soft');
      if (state === 'ext') ring.setAttribute('data-label', '↗'); else ring.removeAttribute('data-label');
      rsT = state === 'link' ? 1.7 : state === 'ext' ? 1.9 : state === 'soft' ? 1.45 : 1;
      dsT = (state === 'link' || state === 'ext') ? 0 : 1;
      kick();
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      if (pts.length < 2) return;
      ctx.lineCap = 'round';
      for (var i = 1; i < pts.length; i++) {
        var age = (now - pts[i].t) / LIFE;
        var a = Math.pow(1 - age, 1.6) * 0.55;
        ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
        ctx.lineWidth = 0.6 + (1 - age) * 3.4;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }

    function tick(now) {
      var k = reduce ? 1 : 0.2;
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      var target = rsT * (pressed ? 0.82 : 1);
      rs += (target - rs) * 0.22;
      ds += (dsT - ds) * 0.25;
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%) scale(' + rs.toFixed(3) + ')';
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0) translate(-50%,-50%) scale(' + ds.toFixed(3) + ')';
      if (!reduce) draw(now);
      var moving = Math.abs(mx - rx) > 0.1 || Math.abs(my - ry) > 0.1 ||
                   Math.abs(target - rs) > 0.003 || Math.abs(dsT - ds) > 0.003 || pts.length > 0;
      raf = moving ? requestAnimationFrame(tick) : 0;
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }

    document.addEventListener('mousemove', function (e) {
      if (!root.classList.contains('cursor-on')) {
        rx = e.clientX; ry = e.clientY; // first move: no flight from the corner
        root.classList.add('cursor-on');
      }
      mx = e.clientX; my = e.clientY;
      if (!reduce) pts.push({ x: mx, y: my, t: performance.now() });
      kick();
    }, { passive: true });
    document.addEventListener('mouseover', function (e) { setState(e.target); });
    document.addEventListener('mousedown', function () { pressed = true; kick(); });
    document.addEventListener('mouseup', function () { pressed = false; kick(); });
    root.addEventListener('mouseleave', function () { root.classList.remove('cursor-on'); pts.length = 0; });
    root.addEventListener('mouseenter', function () { root.classList.add('cursor-on'); });
  }

  /* ---------- Contact form ----------
     With a Web3Forms access key in data-access-key the message goes straight to the inbox
     without leaving the page. Without one it opens the visitor's email app with the message
     already written, so it works from day one. */
  var form = document.getElementById('contact-form');
  if (form) {
    var statusEl = document.getElementById('form-status');
    var submit = form.querySelector('button[type="submit"]');
    var say = function (msg, kind) {
      statusEl.className = 'form-status' + (kind ? ' ' + kind : '');
      statusEl.textContent = msg;
    };
    var fields = [].slice.call(form.querySelectorAll('input[required], textarea[required]'));
    fields.forEach(function (f) {
      f.addEventListener('input', function () { f.closest('.field').classList.remove('invalid'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = fields.filter(function (f) {
        var invalid = !f.checkValidity();
        f.closest('.field').classList.toggle('invalid', invalid);
        f.setAttribute('aria-invalid', invalid ? 'true' : 'false');
        return invalid;
      });
      if (bad.length) {
        say('Please fill in every field with a valid value.', 'err');
        bad[0].focus();
        return;
      }
      var data = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        subject: form.elements.subject.value.trim(),
        message: form.elements.message.value.trim()
      };
      if (form.elements.botcheck && form.elements.botcheck.value) return; // bots fill the hidden field

      var key = form.getAttribute('data-access-key');
      var to = form.getAttribute('data-fallback-email');

      if (!key) {
        var body = data.message + '\n\n— ' + data.name + ' (' + data.email + ')';
        window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(data.subject) +
          '&body=' + encodeURIComponent(body);
        say('Opening your email app… if nothing opens, write to ' + to + '.', 'ok');
        return;
      }

      submit.disabled = true;
      say('Sending…');
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          access_key: key,
          from_name: 'Portfolio contact form',
          name: data.name,
          email: data.email,
          subject: data.subject,
          message: data.message
        })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.success) {
          form.reset();
          say('Thanks, ' + data.name.split(' ')[0] + '! Your message has been sent.', 'ok');
        } else {
          throw new Error('rejected');
        }
      }).catch(function () {
        say('Something went wrong. You can write to ' + to + ' directly.', 'err');
      }).then(function () { submit.disabled = false; });
    });
  }
})();
