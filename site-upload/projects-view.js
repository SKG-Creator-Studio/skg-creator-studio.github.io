// =========================================================
//  PROJECT CARDS + VIEWER
//  Draws project cards from window.SKG_PROJECTS (projects.js)
//  and opens a project (picture or video) in a popup on click.
//  Used by index.html and projects.html.
// =========================================================
(function () {
  const ARROW = '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"></path></svg>';
  const PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>';

  const css = document.createElement('style');
  css.textContent =
    '.proj { cursor: pointer; }' +
    '.thumb > video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .5s; pointer-events: none; }' +
    '.proj:hover .thumb > video { transform: scale(1.06); }' +
    '.thumb .play { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%;' +
    '  background: rgba(227,18,43,.92); display: grid; place-items: center; box-shadow: 0 6px 24px rgba(0,0,0,.45); transition: transform .3s; }' +
    '.thumb .play svg { width: 22px; height: 22px; fill: #fff; margin-left: 3px; }' +
    '.proj:hover .thumb .play { transform: scale(1.12); }' +
    '.pv { position: fixed; inset: 0; z-index: 200; display: none; align-items: center; justify-content: center; padding: 24px;' +
    '  background: rgba(5,1,6,.88); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }' +
    '.pv.open { display: flex; }' +
    '.pv-box { position: relative; width: min(1000px, 100%); max-height: 100%; display: flex; flex-direction: column;' +
    '  background: rgba(14,6,12,.96); border: 1px solid rgba(255,255,255,.09); }' +
    '.pv-media { position: relative; background: #000; display: grid; place-items: center; min-height: 200px; }' +
    '.pv-media img, .pv-media video { display: block; max-width: 100%; max-height: 70vh; width: auto; height: auto; }' +
    '.pv-media iframe { display: block; width: 100%; aspect-ratio: 16/9; border: 0; }' +
    '.pv-info { padding: 18px 22px 22px; overflow-y: auto; }' +
    '.pv-info small { font-size: 11px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e3122b; }' +
    '.pv-info h3 { font-size: 20px; margin: 4px 0 8px; }' +
    '.pv-info p { color: #a99ea4; font-size: 14px; white-space: pre-line; }' +
    '.pv-info .btn { margin-top: 14px; }' +
    '.pv-x, .pv-nav { position: absolute; z-index: 2; width: 42px; height: 42px; border: 1px solid rgba(255,255,255,.25);' +
    '  background: rgba(0,0,0,.55); color: #fff; font-size: 22px; line-height: 1; cursor: pointer; display: grid; place-items: center; }' +
    '.pv-x { top: -14px; right: -14px; border-radius: 50%; background: #e3122b; border-color: #e3122b; }' +
    '.pv-nav { top: 50%; margin-top: -21px; }' +
    '.pv-prev { left: 10px; } .pv-next { right: 10px; }' +
    '.pv-nav:hover { border-color: #fff; }' +
    '@media (max-width: 600px) { .pv { padding: 12px; } .pv-x { top: 6px; right: 6px; } }';
  document.head.appendChild(css);

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function youTubeId(url) {
    const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  }
  function isVideoFile(url) { return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url || ''); }

  function thumbHTML(p) {
    let inner;
    const yt = youTubeId(p.video);
    if (p.image) inner = '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" loading="lazy">';
    else if (isVideoFile(p.video)) inner = '<video src="' + esc(p.video) + '#t=0.5" muted playsinline preload="metadata"></video>';
    else if (yt) inner = '<img src="https://img.youtube.com/vi/' + yt + '/hqdefault.jpg" alt="' + esc(p.title) + '" loading="lazy">';
    else inner = '<div class="mock"' + (p.mockStyle ? ' style="' + esc(p.mockStyle) + '"' : '') + '>' + (p.mock || '') + '</div>';
    if (p.video) inner += '<span class="play">' + PLAY + '</span>';
    return '<div class="thumb">' + inner + '</div>';
  }

  // opts: { featured: only featured ones, limit: max cards, reveal: add scroll-reveal classes }
  window.SKG_renderProjects = function (grid, opts) {
    opts = opts || {};
    const all = window.SKG_PROJECTS || [];
    let list = all.map(function (p, i) { return { p: p, i: i }; });
    if (opts.featured) list = list.filter(function (x) { return x.p.featured; });
    if (opts.filter) list = list.filter(function (x) { return x.p.category === opts.filter; });
    if (opts.limit) list = list.slice(0, opts.limit);
    grid.innerHTML = list.map(function (x, n) {
      return '<a href="#" class="proj panel' + (opts.reveal ? ' reveal d' + (n % 4 + 1) : '') + '" data-proj="' + x.i + '">' +
        thumbHTML(x.p) +
        '<div class="meta"><div><h3>' + esc(x.p.title) + '</h3><small>' + esc(x.p.category) + '</small></div>' +
        '<span class="go">' + ARROW + '</span></div></a>';
    }).join('');
    grid.setAttribute('data-order', list.map(function (x) { return x.i; }).join(','));
  };

  // ---------------- viewer ----------------
  let box = null, order = [], pos = 0;

  function build() {
    box = document.createElement('div');
    box.className = 'pv';
    box.innerHTML = '<div class="pv-box"><button class="pv-x" aria-label="Close">&times;</button>' +
      '<div class="pv-media"></div><div class="pv-info"></div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.closest('.pv-x')) close();
      else if (e.target.closest('.pv-prev')) step(-1);
      else if (e.target.closest('.pv-next')) step(1);
    });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    });
  }

  function show() {
    const p = (window.SKG_PROJECTS || [])[order[pos]];
    if (!p) return;
    const yt = youTubeId(p.video);
    let media;
    if (isVideoFile(p.video)) media = '<video src="' + esc(p.video) + '" controls autoplay playsinline></video>';
    else if (yt) media = '<iframe src="https://www.youtube.com/embed/' + yt + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="' + esc(p.title) + '"></iframe>';
    else if (p.image) media = '<img src="' + esc(p.image) + '" alt="' + esc(p.title) + '">';
    else media = '<div class="thumb" style="width:100%;border:0">' + thumbHTML(p).replace(/^<div class="thumb">|<\/div>$/g, '') + '</div>';
    if (order.length > 1) media += '<button class="pv-nav pv-prev" aria-label="Previous">&#8249;</button><button class="pv-nav pv-next" aria-label="Next">&#8250;</button>';
    box.querySelector('.pv-media').innerHTML = media;

    // A link that isn't playable here (TikTok, Drive, Instagram...) becomes a button.
    const extLink = p.link || (p.video && !yt && !isVideoFile(p.video) ? p.video : '');
    box.querySelector('.pv-info').innerHTML =
      (p.category ? '<small>' + esc(p.category) + '</small>' : '') +
      '<h3>' + esc(p.title) + '</h3>' +
      (p.description ? '<p>' + esc(p.description) + '</p>' : '') +
      (extLink ? '<a class="btn btn-red" href="' + esc(extLink) + '" target="_blank" rel="noopener">' +
        (p.link ? 'Open project' : 'Watch video') + '</a>' : '');
  }

  function open(index, grid) {
    if (!box) build();
    const o = grid && grid.getAttribute('data-order');
    order = o ? o.split(',').map(Number) : [index];
    pos = Math.max(0, order.indexOf(index));
    show();
    box.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
  }
  function close() {
    box.classList.remove('open');
    box.querySelector('.pv-media').innerHTML = '';   // stops a playing video
    document.documentElement.style.overflow = '';
  }
  function step(d) {
    pos = (pos + d + order.length) % order.length;
    show();
  }

  document.addEventListener('click', function (e) {
    const card = e.target.closest('[data-proj]');
    if (!card || e.defaultPrevented) return;
    e.preventDefault();
    open(Number(card.getAttribute('data-proj')), card.closest('[data-order]'));
  });
})();
