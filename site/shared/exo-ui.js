/* ═══════════════════════════════════════════════════════════════
   EXOSKELETONS — Shared UI Components
   Navigation, footer, cards, loading states, trust badges
   ═══════════════════════════════════════════════════════════════ */

const ExoUI = {

  // ── Navigation ──
  _mobileOpen: false,
  _moreOpen: false,

  renderNav(activePage) {
    const primary = [
      { href: 'index.html', label: 'Home', id: 'index.html' },
      { href: 'mint.html', label: 'Mint', id: 'mint.html' },
      { href: 'explorer.html', label: 'Explorer', id: 'explorer.html' },
      { href: 'exo-token.html', label: '$EXO', id: 'exo-token.html' },
      { href: 'outlier.html', label: 'Outlier', id: 'outlier.html' },
      { href: 'board.html', label: 'Board', id: 'board.html' },
      { href: 'okfc', label: 'OKFC', id: 'okfc' },
    ];

    const more = [
      { href: 'trust.html', label: 'Trust', id: 'trust.html' },
      { href: 'messages.html', label: 'Messages', id: 'messages.html' },
      { href: 'modules.html', label: 'Modules', id: 'modules.html' },
      { href: 'marketplace.html', label: 'Marketplace', id: 'marketplace.html' },
      { href: 'guide.html', label: 'Guide', id: 'guide.html' },
      { href: 'docs.html', label: 'Docs', id: 'docs.html' },
    ];

    const all = [...primary, ...more];

    const isMoreActive = more.some(p => p.id === activePage);

    const primaryLinks = primary.map(p =>
      `<a href="${p.href}" class="nav__link${p.id === activePage ? ' nav__link--active' : ''}">${p.label}</a>`
    ).join('');

    const dropdownLinks = more.map(p =>
      `<a href="${p.href}" class="nav__dropdown-link${p.id === activePage ? ' nav__dropdown-link--active' : ''}">${p.label}</a>`
    ).join('');

    const mobileLinks = all.map(p =>
      `<a href="${p.href}" class="nav__mobile-link${p.id === activePage ? ' nav__mobile-link--active' : ''}">${p.label}</a>`
    ).join('');

    return `<nav class="nav"><div class="nav__inner">
      <a href="index.html" class="nav__logo">EXO<span class="nav__logo-accent">AGENT</span></a>
      <div class="nav__primary-links">${primaryLinks}</div>
      <div class="nav__more" id="navMore">
        <button class="nav__more-btn${isMoreActive ? ' nav__more-btn--active' : ''}" onclick="ExoUI.toggleMore()">More</button>
        <div class="nav__dropdown" id="navDropdown">
          ${dropdownLinks}
          <div class="nav__dropdown-divider"></div>
          <a href="/exo-whitepaper" target="_blank" class="nav__dropdown-link">Whitepaper &#x2197;</a>
        </div>
      </div>
      <div class="nav__spacer"></div>
      <button class="nav__wallet nav__wallet--disconnected" id="navWalletBtn" onclick="ExoUI.onWalletClick()">Connect</button>
      <button class="nav__hamburger" id="navHamburger" onclick="ExoUI.toggleMobile()" aria-label="Menu">
        <span class="nav__hamburger-line"></span>
        <span class="nav__hamburger-line"></span>
        <span class="nav__hamburger-line"></span>
      </button>
    </div></nav>
    <div class="nav__mobile-overlay" id="navMobileOverlay">
      <div class="nav__mobile-menu">
        ${mobileLinks}
        <div class="nav__dropdown-divider"></div>
        <a href="/exo-whitepaper" target="_blank" class="nav__mobile-link">Whitepaper &#x2197;</a>
        <button class="nav__wallet nav__wallet--disconnected" id="navWalletBtnMobile" onclick="ExoUI.onWalletClick()" style="margin-top:16px;width:100%">Connect</button>
      </div>
    </div>`;
  },

  toggleMore() {
    this._moreOpen = !this._moreOpen;
    const dropdown = document.getElementById('navDropdown');
    if (dropdown) dropdown.classList.toggle('nav__dropdown--open', this._moreOpen);
  },

  toggleMobile() {
    this._mobileOpen = !this._mobileOpen;
    const overlay = document.getElementById('navMobileOverlay');
    const hamburger = document.getElementById('navHamburger');
    if (overlay) overlay.classList.toggle('nav__mobile-overlay--open', this._mobileOpen);
    if (hamburger) hamburger.classList.toggle('nav__hamburger--open', this._mobileOpen);
    document.body.style.overflow = this._mobileOpen ? 'hidden' : '';
  },

  closeMobileMenu() {
    if (!this._mobileOpen) return;
    this._mobileOpen = false;
    const overlay = document.getElementById('navMobileOverlay');
    const hamburger = document.getElementById('navHamburger');
    if (overlay) overlay.classList.remove('nav__mobile-overlay--open');
    if (hamburger) hamburger.classList.remove('nav__hamburger--open');
    document.body.style.overflow = '';
  },

  // ── Footer ──
  renderFooter() {
    return `<footer class="footer">
      <span class="text-mono">EXOAGENT.XYZ // BUILT BY <span class="footer-gold">POTDEALER</span> &amp; <span class="footer-cyan">OLLIE</span> // CC0 // BASE</span><br>
      <span class="text-mono">Core: <a href="https://basescan.org/address/${ExoCore.CONTRACTS.core}" target="_blank">${ExoCore.truncAddr(ExoCore.CONTRACTS.core)}</a> · Registry: <a href="https://basescan.org/address/${ExoCore.CONTRACTS.registry}" target="_blank">${ExoCore.truncAddr(ExoCore.CONTRACTS.registry)}</a></span>
    </footer>`;
  },

  // ── Wallet Button Updates ──
  updateWalletButton(account) {
    const btns = [document.getElementById('navWalletBtn'), document.getElementById('navWalletBtnMobile')];
    btns.forEach(btn => {
      if (!btn) return;
      if (account) {
        btn.textContent = ExoCore.truncAddr(account);
        btn.classList.remove('nav__wallet--disconnected');
      } else {
        btn.textContent = 'Connect';
        btn.classList.add('nav__wallet--disconnected');
      }
    });
  },

  async onWalletClick() {
    if (ExoCore.account) return;
    try {
      await ExoCore.connectWallet();
    } catch (e) {
      console.error('Wallet connect error:', e);
    }
  },

  // ── Token Card ──
  renderTokenCard(token, svgContent) {
    const genesis = token.genesis ? '<span class="token-card__genesis"></span>' : '';
    const name = token.name ? `<div class="token-card__name">${ExoCore.escHtml(token.name)}</div>` : '';
    const svg = svgContent
      ? `<div class="token-card__svg">${svgContent}</div>`
      : `<div class="token-card__svg skeleton" style="aspect-ratio:1"></div>`;

    return `<a href="token.html#${token.id}" class="token-card">
      ${svg}
      <div class="token-card__info">
        <div class="token-card__id">${genesis}#${token.id}</div>
        ${name}
        <div class="token-card__rep">REP ${ExoCore.formatScore(token.repScore || 0)}</div>
      </div>
    </a>`;
  },

  // ── Stat Box ──
  renderStatBox(value, label) {
    return `<div class="stat-box">
      <div class="stat-box__value">${value}</div>
      <div class="stat-box__label">${label}</div>
    </div>`;
  },

  // ── Trust Badge ──
  renderTrustBadge(score) {
    const tier = ExoCore.getTrustTier(score);
    return `<span class="badge trust-badge ${tier.class}">${tier.name}</span>`;
  },

  // ── Loading Skeleton Card ──
  renderSkeletonCard() {
    return `<div class="token-card" style="pointer-events:none">
      <div class="skeleton" style="aspect-ratio:1;border-radius:var(--radius-sm)"></div>
      <div class="token-card__info">
        <div class="skeleton" style="height:14px;width:50px;margin-top:8px;border-radius:3px"></div>
      </div>
    </div>`;
  },

  // ── Pagination ──
  renderPagination(currentPage, totalPages, onPageFn) {
    if (totalPages <= 1) return '';
    let html = '<div class="pagination">';
    if (currentPage > 1) html += `<a class="page-btn" href="#" onclick="${onPageFn}(${currentPage - 1});return false">Prev</a>`;
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    if (start > 1) html += `<a class="page-btn" href="#" onclick="${onPageFn}(1);return false">1</a>`;
    if (start > 2) html += '<span class="page-btn" style="border:none;cursor:default">...</span>';
    for (let p = start; p <= end; p++) {
      html += `<a class="page-btn${p === currentPage ? ' page-btn--active' : ''}" href="#" onclick="${onPageFn}(${p});return false">${p}</a>`;
    }
    if (end < totalPages - 1) html += '<span class="page-btn" style="border:none;cursor:default">...</span>';
    if (end < totalPages) html += `<a class="page-btn" href="#" onclick="${onPageFn}(${totalPages});return false">${totalPages}</a>`;
    if (currentPage < totalPages) html += `<a class="page-btn" href="#" onclick="${onPageFn}(${currentPage + 1});return false">Next</a>`;
    html += '</div>';
    return html;
  },

  // ── Status Message ──
  showStatus(elementId, msg, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = msg;
    el.className = 'status status--' + type;
    el.style.display = '';
  },

  hideStatus(elementId) {
    const el = document.getElementById(elementId);
    if (el) el.style.display = 'none';
  },

  // ── Toast Notifications ──
  _toastContainer: null,
  _toastId: 0,

  _ensureToastContainer() {
    if (this._toastContainer) return this._toastContainer;
    const c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
    this._toastContainer = c;
    return c;
  },

  /**
   * Show a toast notification.
   * @param {string} msg - HTML message content
   * @param {'success'|'error'|'pending'|'info'} type
   * @param {number} [duration=5000] - Auto-dismiss in ms (0 = manual only)
   * @returns {string} toast ID for manual dismissal
   */
  toast(msg, type = 'info', duration = 5000) {
    const container = this._ensureToastContainer();
    const id = 'toast-' + (++this._toastId);
    const icons = { success: '\u2713', error: '\u2717', pending: '\u21BB', info: '\u2139' };

    const el = document.createElement('div');
    el.className = 'toast toast--' + type;
    el.id = id;
    el.innerHTML = [
      '<span class="toast__icon">' + (icons[type] || '') + '</span>',
      '<span class="toast__msg">' + msg + '</span>',
      '<button class="toast__close" onclick="ExoUI.dismissToast(\'' + id + '\')">&times;</button>',
    ].join('');

    container.appendChild(el);

    if (duration > 0) {
      setTimeout(() => this.dismissToast(id), duration);
    }

    return id;
  },

  /**
   * Dismiss a toast by ID.
   * @param {string} id
   */
  dismissToast(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('toast--exiting');
    setTimeout(() => el.remove(), 300);
  },

  /**
   * Update an existing toast (e.g., pending -> success).
   * @param {string} id
   * @param {string} msg
   * @param {'success'|'error'|'pending'|'info'} type
   * @param {number} [duration=5000]
   */
  updateToast(id, msg, type, duration = 5000) {
    const el = document.getElementById(id);
    if (!el) return;
    const icons = { success: '\u2713', error: '\u2717', pending: '\u21BB', info: '\u2139' };
    el.className = 'toast toast--' + type;
    el.querySelector('.toast__icon').textContent = icons[type] || '';
    el.querySelector('.toast__msg').innerHTML = msg;
    if (duration > 0) {
      setTimeout(() => this.dismissToast(id), duration);
    }
  },

  // ── Tron Background Injection ──
  injectTronBackground() {
    const els = [
      '<div class="grid-bg"></div>',
      '<div class="grid-floor"></div>',
      '<div class="light-trail trail-h trail-1"></div>',
      '<div class="light-trail trail-h trail-2"></div>',
      '<div class="light-trail trail-h trail-3"></div>',
      '<div class="light-trail trail-v trail-4"></div>',
      '<div class="light-trail trail-v trail-5"></div>',
      '<div class="light-trail trail-v trail-6"></div>',
      '<div class="corner corner-tl"></div>',
      '<div class="corner corner-tr"></div>',
      '<div class="corner corner-bl"></div>',
      '<div class="corner corner-br"></div>',
      '<div class="neon-line neon-line-1"></div>',
      '<div class="neon-line neon-line-2"></div>',
      '<div class="neon-line neon-line-3"></div>',
    ];
    document.body.insertAdjacentHTML('afterbegin', els.join(''));
  },

  // ── Initialize page (nav + footer + wallet listener) ──
  initPage(activePage) {
    // Inject Tron background elements
    this.injectTronBackground();

    // Insert nav
    const navTarget = document.getElementById('app-nav');
    if (navTarget) navTarget.outerHTML = this.renderNav(activePage);

    // Insert footer
    const footerTarget = document.getElementById('app-footer');
    if (footerTarget) footerTarget.outerHTML = this.renderFooter();

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const moreEl = document.getElementById('navMore');
      if (this._moreOpen && moreEl && !moreEl.contains(e.target)) {
        this._moreOpen = false;
        const dropdown = document.getElementById('navDropdown');
        if (dropdown) dropdown.classList.remove('nav__dropdown--open');
      }
    });

    // Close mobile overlay when a link is clicked
    const overlay = document.getElementById('navMobileOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target.classList.contains('nav__mobile-link')) {
          this.closeMobileMenu();
        }
      });
    }

    // Listen for wallet changes
    window.addEventListener('exo:accountChanged', (e) => {
      this.updateWalletButton(e.detail.account);
    });

    // Auto-connect
    ExoCore.onReady(() => {
      ExoCore.autoConnect();
    });
  },
};

window.ExoUI = ExoUI;
