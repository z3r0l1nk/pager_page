/**
 * WiFi Pineapple Pager Library — App
 * Client-side logic: loads payloads.json, renders main tabs (Payloads/Themes/Ringtones/PRs),
 * handles search, and shows detail modals.
 */

(function () {
    'use strict';

    // ================================================================
    // State
    // ================================================================
    let payloadData = null;
    let activeMainTab = 'payloads'; // 'payloads', 'themes', 'ringtones', 'pullrequests'
    let activeCategory = null;
    let activeSubcategory = null;
    let searchQuery = '';
    let prFilter = 'all';
    let prRepoFilter = 'all';

    // DOM refs
    const mainTabs = document.getElementById('mainTabs');
    const categoryTabs = document.getElementById('categoryTabs');
    const subcategoryList = document.getElementById('subcategoryList');
    const payloadGrid = document.getElementById('payloadGrid');
    const gridHeader = document.getElementById('currentSection');
    const gridCount = document.getElementById('gridCount');
    const searchInput = document.getElementById('searchInput');
    const payloadCount = document.getElementById('payloadCount');
    const loadingState = document.getElementById('loadingState');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalContent = document.getElementById('modalContent');
    const modalClose = document.getElementById('modalClose');

    // ================================================================
    // Init
    // ================================================================
    async function init() {
        try {
            const res = await fetch('payloads.json');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            payloadData = await res.json();

            const total = payloadData.totalPayloads + (payloadData.totalThemes || 0) + (payloadData.totalRingtones || 0);
            payloadCount.textContent = `${total} items`;

            renderMainTabs();
            selectMainTab('payloads');
        } catch (err) {
            loadingState.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">\u26a0\ufe0f</div>
          <p>Failed to load data.</p>
          <p style="font-size:12px;margin-top:8px;color:var(--text-muted)">
            Run <code>node fetch_data.js</code> to generate payloads.json first.
          </p>
        </div>`;
        }
    }

    // ================================================================
    // Main Tabs (Payloads / Themes / Ringtones / PRs)
    // ================================================================
    function renderMainTabs() {
        mainTabs.innerHTML = '';
        const tabs = [
            { key: 'payloads', icon: '\ud83d\udce6', label: 'Payloads', count: payloadData.totalPayloads || 0 },
            { key: 'themes', icon: '\ud83c\udfa8', label: 'Themes', count: payloadData.totalThemes || 0 },
            { key: 'ringtones', icon: '\ud83d\udd14', label: 'Ringtones', count: payloadData.totalRingtones || 0 },
            { key: 'pullrequests', icon: '\ud83d\udd00', label: 'Pull Requests', count: payloadData.pullRequests ? payloadData.pullRequests.length : 0 }
        ];

        for (const t of tabs) {
            const btn = document.createElement('button');
            btn.className = 'main-tab' + (activeMainTab === t.key ? ' active' : '');
            btn.dataset.tab = t.key;
            btn.innerHTML = `<span>${t.icon}</span><span>${t.label}</span><span class="tab-count">${t.count}</span>`;
            btn.addEventListener('click', () => selectMainTab(t.key));
            mainTabs.appendChild(btn);
        }
    }

    function selectMainTab(key) {
        activeMainTab = key;
        searchQuery = '';
        searchInput.value = '';

        // Update main tab active states
        mainTabs.querySelectorAll('.main-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === key);
        });

        if (key === 'payloads') {
            categoryTabs.style.display = '';
            renderCategoryTabs();
            const cats = Object.keys(payloadData.categories);
            if (cats.length > 0) selectCategory(cats[0]);
        } else {
            categoryTabs.style.display = 'none';
            categoryTabs.innerHTML = '';
            if (key === 'themes') selectThemesView();
            else if (key === 'ringtones') selectRingtonesView();
            else if (key === 'pullrequests') selectPRView();
        }
    }

    // ================================================================
    // Payload Category Sub-Tabs
    // ================================================================
    function renderCategoryTabs() {
        categoryTabs.innerHTML = '';
        const icons = { alerts: '\ud83d\udd14', recon: '\ud83d\udce1', user: '\ud83d\udc64' };

        for (const [key, cat] of Object.entries(payloadData.categories)) {
            const total = Object.values(cat.subcategories)
                .reduce((acc, sub) => acc + sub.payloads.length, 0);

            const tab = document.createElement('button');
            tab.className = 'cat-tab';
            tab.dataset.cat = key;
            tab.innerHTML = `<span>${icons[key] || '\ud83d\udcc2'}</span><span>${cat.displayName}</span><span class="tab-count">${total}</span>`;
            tab.addEventListener('click', () => selectCategory(key));
            categoryTabs.appendChild(tab);
        }
    }

    function selectCategory(catKey) {
        activeCategory = catKey;
        activeSubcategory = null;

        document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.cat === catKey);
        });

        renderPayloadSidebar();
        renderPayloads();
    }

    // ================================================================
    // Sidebar: Payload Subcategories
    // ================================================================
    function renderPayloadSidebar() {
        subcategoryList.innerHTML = '';
        if (!activeCategory || !payloadData) return;

        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Subcategories';

        const cat = payloadData.categories[activeCategory];
        const subs = Object.entries(cat.subcategories);

        const allCount = subs.reduce((acc, [, sub]) => acc + sub.payloads.length, 0);
        const allItem = createSidebarItem('All', allCount, null, !activeSubcategory);
        allItem.classList.add('sub-all-item');
        subcategoryList.appendChild(allItem);

        for (const [key, sub] of subs) {
            subcategoryList.appendChild(
                createSidebarItem(sub.displayName, sub.payloads.length, key, activeSubcategory === key)
            );
        }
    }

    function createSidebarItem(label, count, key, isActive) {
        const li = document.createElement('li');
        li.className = 'subcategory-item' + (isActive ? ' active' : '');
        li.innerHTML = `<span>${label}</span><span class="sub-count">${count}</span>`;
        li.addEventListener('click', () => {
            activeSubcategory = key;
            document.querySelectorAll('.subcategory-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            renderPayloads();
        });
        return li;
    }

    // ================================================================
    // Payload Grid
    // ================================================================
    function getVisiblePayloads() {
        if (!activeCategory || !payloadData) return [];
        const cat = payloadData.categories[activeCategory];
        let payloads = [];

        if (activeSubcategory) {
            const sub = cat.subcategories[activeSubcategory];
            payloads = sub ? sub.payloads.map(p => ({ ...p, subcategory: activeSubcategory })) : [];
        } else {
            for (const [subKey, sub] of Object.entries(cat.subcategories)) {
                payloads.push(...sub.payloads.map(p => ({ ...p, subcategory: subKey })));
            }
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            payloads = payloads.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                p.author.toLowerCase().includes(q) ||
                p.name.toLowerCase().includes(q) ||
                (p.subcategory && p.subcategory.toLowerCase().includes(q))
            );
        }
        return payloads;
    }

    function renderPayloads() {
        const payloads = getVisiblePayloads();
        const cat = payloadData.categories[activeCategory];

        if (activeSubcategory) {
            const sub = cat.subcategories[activeSubcategory];
            gridHeader.textContent = sub ? sub.displayName : activeSubcategory;
        } else {
            gridHeader.textContent = cat.displayName + ' \u2014 All Payloads';
        }
        gridCount.textContent = `${payloads.length} payload${payloads.length !== 1 ? 's' : ''}`;

        payloadGrid.innerHTML = '';
        if (payloads.length === 0) {
            payloadGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">\ud83d\udd0d</div><p>${searchQuery ? 'No payloads match your search.' : 'No payloads in this category.'}</p></div>`;
            return;
        }
        for (const payload of payloads) payloadGrid.appendChild(createPayloadCard(payload));
    }

    function createPayloadCard(payload) {
        const card = document.createElement('div');
        card.className = 'payload-card';
        card.dataset.cat = activeCategory;
        const authorInitial = payload.author.charAt(0).toUpperCase();

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(payload.title)}</span>
        ${payload.version ? `<span class="card-version">v${escapeHtml(payload.version)}</span>` : ''}
      </div>
      <p class="card-description">${escapeHtml(payload.description)}</p>
      <div class="card-footer">
        <div class="card-author"><span class="card-author-icon">${authorInitial}</span><span>${escapeHtml(payload.author)}</span></div>
        <div class="card-tags">
          ${payload.readme ? '<span class="card-tag tag-has-readme">README</span>' : ''}
          <span class="card-tag tag-has-source">SRC</span>
        </div>
      </div>`;

        card.addEventListener('click', () => openPayloadModal(payload));
        return card;
    }

    // ================================================================
    // Themes
    // ================================================================
    function selectThemesView() {
        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Info';

        subcategoryList.innerHTML = '';
        const total = payloadData.themes ? payloadData.themes.length : 0;
        const withReadme = payloadData.themes ? payloadData.themes.filter(t => t.readme).length : 0;

        const info = document.createElement('li');
        info.className = 'subcategory-item sidebar-info-item';
        info.innerHTML = `<span style="font-size:12px;color:var(--text-muted);line-height:1.6">
            ${total} themes available.<br>${withReadme} have README files.<br>
            Themes are UI compositions for the Pager device.
        </span>`;
        subcategoryList.appendChild(info);

        renderThemes();
    }

    function renderThemes() {
        const themes = payloadData.themes || [];
        let filtered = themes;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = themes.filter(t =>
                t.title.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.author.toLowerCase().includes(q) ||
                (t.description && t.description.toLowerCase().includes(q))
            );
        }

        gridHeader.textContent = 'Themes';
        gridCount.textContent = `${filtered.length} theme${filtered.length !== 1 ? 's' : ''}`;
        payloadGrid.innerHTML = '';

        if (filtered.length === 0) {
            payloadGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">\ud83c\udfa8</div><p>${searchQuery ? 'No themes match your search.' : 'No themes found.'}</p></div>`;
            return;
        }

        for (const theme of filtered) payloadGrid.appendChild(createThemeCard(theme));
    }

    function createThemeCard(theme) {
        const card = document.createElement('div');
        card.className = 'payload-card theme-card';
        const authorInitial = (theme.author || 'U').charAt(0).toUpperCase();
        const desc = theme.description || 'No description available.';
        const imgCount = extractImages(theme.readme, theme).length;

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(theme.title)}</span>
      </div>
      <p class="card-description">${escapeHtml(typeof desc === 'string' ? desc.substring(0, 200) : '')}</p>
      <div class="card-footer">
        <div class="card-author"><span class="card-author-icon">${authorInitial}</span><span>${escapeHtml(theme.author || 'Unknown')}</span></div>
        <div class="card-tags">
          ${imgCount > 0 ? `<span class="card-tag tag-has-images">\ud83d\uddbc ${imgCount}</span>` : ''}
          ${theme.readme ? '<span class="card-tag tag-has-readme">README</span>' : ''}
          ${theme.files && theme.files.includes('theme.json') ? '<span class="card-tag tag-theme-json">JSON</span>' : ''}
        </div>
      </div>`;

        card.addEventListener('click', () => openThemeModal(theme));
        return card;
    }

    function extractImages(md, theme) {
        if (!md) return [];
        const imgs = [];
        const seen = new Set();
        const baseUrl = `https://raw.githubusercontent.com/hak5/wifipineapplepager-themes/master/themes/${theme.name}/`;

        function resolveUrl(url) {
            if (!url) return '';
            if (url.startsWith('http://') || url.startsWith('https://')) return url;
            return baseUrl + url;
        }

        function addImg(alt, url) {
            const resolved = resolveUrl(url);
            if (resolved && !seen.has(resolved)) {
                seen.add(resolved);
                imgs.push({ alt: alt || '', url: resolved });
            }
        }

        // Markdown images: ![alt](url)
        let m;
        const mdRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
        while ((m = mdRe.exec(md)) !== null) addImg(m[1], m[2]);

        // HTML img tags: <img src="url" ... alt="alt">
        const htmlRe = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
        while ((m = htmlRe.exec(md)) !== null) {
            const altMatch = m[0].match(/alt=["']([^"']*)["']/i);
            addImg(altMatch ? altMatch[1] : '', m[1]);
        }

        return imgs;
    }

    function openThemeModal(theme) {
        const images = extractImages(theme.readme, theme);
        const hasImages = images.length > 0;
        let activeTab = theme.readme ? 'readme' : 'info';

        function render() {
            modalContent.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(theme.title)}</h2>
          <div class="modal-meta">
            <span class="modal-meta-item">\ud83d\udc64 <strong>${escapeHtml(theme.author || 'Unknown')}</strong></span>
            <span class="modal-meta-item"><a href="${theme.githubUrl}" target="_blank" rel="noopener">View on GitHub \u2192</a></span>
          </div>
        </div>
        <div class="modal-tabs">
          ${theme.readme ? `<button class="modal-tab ${activeTab === 'readme' ? 'active' : ''}" data-tab="readme">\ud83d\udcd6 README</button>` : ''}
          <button class="modal-tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info">\ud83d\udcdd Info</button>
          ${hasImages ? `<button class="modal-tab ${activeTab === 'images' ? 'active' : ''}" data-tab="images">\ud83d\uddbc Images <span class="tab-count">${images.length}</span></button>` : ''}
          ${theme.themeJson && Object.keys(theme.themeJson).length > 0 ? `<button class="modal-tab ${activeTab === 'json' ? 'active' : ''}" data-tab="json">\ud83d\udcbe theme.json</button>` : ''}
        </div>
        <div class="modal-body">
          ${activeTab === 'images' ? renderThemeImages(images, theme) : ''}
          ${activeTab === 'readme' ? `<div>${simpleMarkdown(theme.readme, `https://raw.githubusercontent.com/hak5/wifipineapplepager-themes/master/themes/${theme.name}/`, true)}</div>` : ''}
          ${activeTab === 'info' ? renderThemeInfo(theme) : ''}
          ${activeTab === 'json' ? renderThemeJson(theme) : ''}
        </div>`;

            modalContent.querySelectorAll('.modal-tab').forEach(tab => {
                tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); });
            });
        }

        render();
        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function renderThemeImages(images, theme) {
        return `<div class="theme-images-grid">${images.map(img =>
            `<figure class="theme-image-item">
                // <img src="${img.url}" alt="${escapeHtml(img.alt)}" loading="lazy">
                <img src="${img.url}" alt="${escapeHtml(img.alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.style.display='none';this.parentElement.style.display='none'">
                ${img.alt ? `<figcaption>${escapeHtml(img.alt)}</figcaption>` : ''}
            </figure>`
        ).join('')}</div>`;
    }

    function renderThemeInfo(theme) {
        return `
      <table class="pr-info-table">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(theme.name)}</td></tr>
        <tr><td><strong>Author</strong></td><td>${escapeHtml(theme.author || 'Unknown')}</td></tr>
        ${theme.files ? `<tr><td><strong>Files</strong></td><td>${theme.files.map(f => `<code>${escapeHtml(f)}</code>`).join(', ')}</td></tr>` : ''}
      </table>`;
    }

    function renderThemeJson(theme) {
        if (!theme.themeJson || Object.keys(theme.themeJson).length === 0) return '<p>No theme.json data.</p>';
        return `<div class="source-code-view"><div class="source-code-header"><span class="source-code-filename">theme.json</span></div><pre><code>${escapeHtml(JSON.stringify(theme.themeJson, null, 2))}</code></pre></div>`;
    }

    // ================================================================
    // RTTTL Player (Web Audio API)
    // ================================================================
    let rtttlAudioCtx = null;
    let rtttlPlaying = null; // { id, stop() }

    const RTTTL_NOTES = { c:0, 'd':2, e:4, f:5, g:7, a:9, b:11, h:11, p:-1 };

    function parseRTTTL(rtttl) {
        const parts = rtttl.split(':');
        if (parts.length < 3) return null;
        const name = parts[0].trim();
        const defaults = parts[1].trim();
        const noteStr = parts.slice(2).join(':').trim();

        let d = 4, o = 6, b = 63;
        for (const param of defaults.split(',')) {
            const [k, v] = param.trim().split('=');
            if (k === 'd') d = parseInt(v) || 4;
            else if (k === 'o') o = parseInt(v) || 6;
            else if (k === 'b') b = parseInt(v) || 63;
        }

        const wholeNote = (60000 / b) * 4;
        const notes = [];

        for (const token of noteStr.split(',')) {
            const t = token.trim().toLowerCase();
            if (!t) continue;
            const m = t.match(/^(\d{0,2})([a-hp])(#?)(\.?)(\d?)(\.?)$/);
            if (!m) continue;

            const dur = parseInt(m[1]) || d;
            const note = m[2];
            const sharp = m[3] === '#';
            const dotted = m[4] === '.' || m[6] === '.';
            const octave = parseInt(m[5]) || o;

            let ms = wholeNote / dur;
            if (dotted) ms *= 1.5;

            let freq = 0;
            if (note !== 'p' && RTTTL_NOTES[note] !== undefined) {
                const semitone = RTTTL_NOTES[note] + (sharp ? 1 : 0);
                const midi = 12 * octave + semitone;
                freq = 440 * Math.pow(2, (midi - 69) / 12);
            }

            notes.push({ freq, duration: ms / 1000 });
        }
        return { name, notes };
    }

    function playRTTTL(rtttlSource, id) {
        stopRTTTL();
        const parsed = parseRTTTL(rtttlSource);
        if (!parsed || parsed.notes.length === 0) return null;

        if (!rtttlAudioCtx) rtttlAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = rtttlAudioCtx;
        if (ctx.state === 'suspended') ctx.resume();

        let time = ctx.currentTime + 0.05;
        const oscillators = [];
        let cancelled = false;

        for (const note of parsed.notes) {
            if (note.freq > 0) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.value = note.freq;
                gain.gain.setValueAtTime(0.15, time);
                gain.gain.exponentialRampToValueAtTime(0.001, time + note.duration * 0.95);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(time);
                osc.stop(time + note.duration);
                oscillators.push(osc);
            }
            time += note.duration;
        }

        const totalDuration = (time - ctx.currentTime) * 1000;

        const stopFn = () => {
            if (cancelled) return;
            cancelled = true;
            oscillators.forEach(osc => { try { osc.stop(); } catch {} });
            if (rtttlPlaying && rtttlPlaying.id === id) {
                rtttlPlaying = null;
                updateAllPlayButtons();
            }
        };

        const timer = setTimeout(stopFn, totalDuration + 100);

        rtttlPlaying = {
            id,
            stop: () => { clearTimeout(timer); stopFn(); }
        };

        updateAllPlayButtons();
        return rtttlPlaying;
    }

    function stopRTTTL() {
        if (rtttlPlaying) {
            rtttlPlaying.stop();
            rtttlPlaying = null;
            updateAllPlayButtons();
        }
    }

    function updateAllPlayButtons() {
        document.querySelectorAll('.rtttl-play-btn').forEach(btn => {
            const rid = btn.dataset.ringtoneId;
            const isPlaying = rtttlPlaying && rtttlPlaying.id === rid;
            btn.classList.toggle('playing', isPlaying);
            btn.querySelector('.play-icon').textContent = isPlaying ? '\u23f9' : '\u25b6';
        });
        document.querySelectorAll('.rtttl-player-label').forEach(label => {
            const bar = label.closest('.rtttl-player-bar');
            if (!bar) return;
            const btn = bar.querySelector('.rtttl-play-btn');
            if (!btn) return;
            const isPlaying = rtttlPlaying && rtttlPlaying.id === btn.dataset.ringtoneId;
            label.textContent = isPlaying ? 'Playing...' : 'Play Ringtone';
        });
    }

    function handlePlayClick(e, ringtone) {
        e.stopPropagation();
        if (rtttlPlaying && rtttlPlaying.id === ringtone.name) {
            stopRTTTL();
        } else {
            playRTTTL(ringtone.source, ringtone.name);
        }
    }

    // ================================================================
    // Ringtones
    // ================================================================
    function selectRingtonesView() {
        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Info';

        subcategoryList.innerHTML = '';
        const total = payloadData.ringtones ? payloadData.ringtones.length : 0;

        const info = document.createElement('li');
        info.className = 'subcategory-item sidebar-info-item';
        info.innerHTML = `<span style="font-size:12px;color:var(--text-muted);line-height:1.6">
            ${total} ringtones available.<br>
            RTTTL format (Ring Tone Text Transfer Language).<br>
            Copy to /root/ringtones/ on your Pager.
        </span>`;
        subcategoryList.appendChild(info);

        renderRingtones();
    }

    function renderRingtones() {
        const ringtones = payloadData.ringtones || [];
        let filtered = ringtones;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = ringtones.filter(r =>
                r.title.toLowerCase().includes(q) ||
                r.name.toLowerCase().includes(q) ||
                r.rtttlName.toLowerCase().includes(q)
            );
        }

        gridHeader.textContent = 'Ringtones';
        gridCount.textContent = `${filtered.length} ringtone${filtered.length !== 1 ? 's' : ''}`;
        payloadGrid.innerHTML = '';

        if (filtered.length === 0) {
            payloadGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">\ud83d\udd14</div><p>${searchQuery ? 'No ringtones match your search.' : 'No ringtones found.'}</p></div>`;
            return;
        }

        for (const ringtone of filtered) payloadGrid.appendChild(createRingtoneCard(ringtone));
    }

    function createRingtoneCard(ringtone) {
        const card = document.createElement('div');
        card.className = 'payload-card ringtone-card';
        const isPlaying = rtttlPlaying && rtttlPlaying.id === ringtone.name;

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(ringtone.title)}</span>
        <button class="rtttl-play-btn ${isPlaying ? 'playing' : ''}" data-ringtone-id="${escapeHtml(ringtone.name)}" title="Play ringtone">
          <span class="play-icon">${isPlaying ? '\u23f9' : '\u25b6'}</span>
        </button>
      </div>
      <p class="card-description" style="font-family:var(--font-mono);font-size:11px;opacity:0.7">${escapeHtml(ringtone.source.substring(0, 120))}${ringtone.source.length > 120 ? '...' : ''}</p>
      <div class="card-footer">
        <div class="card-author"><span class="card-author-icon">\ud83c\udfb5</span><span>${escapeHtml(ringtone.fileName)}</span></div>
        <div class="card-tags">
          <span class="card-tag tag-ringtone-size">${ringtone.size}B</span>
          <span class="card-tag tag-has-source">RTTTL</span>
        </div>
      </div>`;

        card.querySelector('.rtttl-play-btn').addEventListener('click', (e) => handlePlayClick(e, ringtone));
        card.addEventListener('click', () => openRingtoneModal(ringtone));
        return card;
    }

    function openRingtoneModal(ringtone) {
        const isPlaying = rtttlPlaying && rtttlPlaying.id === ringtone.name;
        modalContent.innerHTML = `
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(ringtone.title)}</h2>
        <div class="modal-meta">
          <span class="modal-meta-item">\ud83c\udfb5 ${escapeHtml(ringtone.fileName)}</span>
          <span class="modal-meta-item">${ringtone.size} bytes</span>
          <span class="modal-meta-item"><a href="${ringtone.githubUrl}" target="_blank" rel="noopener">View on GitHub \u2192</a></span>
        </div>
      </div>
      <div class="modal-body">
        <div class="rtttl-player-bar">
          <button class="rtttl-play-btn rtttl-play-btn-lg ${isPlaying ? 'playing' : ''}" data-ringtone-id="${escapeHtml(ringtone.name)}" title="Play ringtone">
            <span class="play-icon">${isPlaying ? '\u23f9' : '\u25b6'}</span>
          </button>
          <span class="rtttl-player-label">${isPlaying ? 'Playing...' : 'Play Ringtone'}</span>
        </div>
        <div class="source-code-view">
          <div class="source-code-header">
            <span class="source-code-filename">${escapeHtml(ringtone.fileName)}</span>
            <button class="copy-btn" id="ringtoneCopyBtn">Copy</button>
          </div>
          <pre><code>${escapeHtml(ringtone.source)}</code></pre>
        </div>
        <table class="pr-info-table" style="margin-top:20px">
          <tr><td><strong>RTTTL Name</strong></td><td>${escapeHtml(ringtone.rtttlName)}</td></tr>
          <tr><td><strong>Settings</strong></td><td><code>${escapeHtml(ringtone.settings)}</code></td></tr>
          <tr><td><strong>Notes</strong></td><td style="word-break:break-all"><code>${escapeHtml(ringtone.notes)}</code></td></tr>
        </table>
      </div>`;

        modalContent.querySelector('.rtttl-play-btn').addEventListener('click', (e) => handlePlayClick(e, ringtone));

        const copyBtn = modalContent.querySelector('#ringtoneCopyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(ringtone.source).then(() => {
                    copyBtn.textContent = '\u2713 Copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
                });
            });
        }

        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    // ================================================================
    // Pull Requests
    // ================================================================
    function selectPRView() {
        prFilter = 'all';
        prRepoFilter = 'all';
        renderPRSidebar();
        renderPullRequests();
    }

    function renderPRSidebar() {
        subcategoryList.innerHTML = '';
        if (!payloadData || !payloadData.pullRequests) return;

        const sidebarHeader = document.querySelector('.sidebar-header h3');
        if (sidebarHeader) sidebarHeader.textContent = 'Filter';

        const prs = payloadData.pullRequests;

        // State filters
        const stateCounts = {
            all: prs.length,
            open: prs.filter(p => p.state === 'open').length,
            merged: prs.filter(p => p.merged).length,
            closed: prs.filter(p => p.state === 'closed' && !p.merged).length
        };

        const stateLabel = document.createElement('li');
        stateLabel.className = 'subcategory-item sidebar-section-label';
        stateLabel.innerHTML = '<span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">State</span>';
        subcategoryList.appendChild(stateLabel);

        for (const f of [
            { key: 'all', label: 'All' },
            { key: 'open', label: 'Open' },
            { key: 'merged', label: 'Merged' },
            { key: 'closed', label: 'Closed' }
        ]) {
            const li = document.createElement('li');
            li.className = 'subcategory-item' + (prFilter === f.key ? ' active' : '');
            if (f.key === 'all') li.classList.add('sub-all-item');
            li.innerHTML = `<span>${f.label}</span><span class="sub-count">${stateCounts[f.key]}</span>`;
            li.addEventListener('click', () => {
                prFilter = f.key;
                renderPRSidebar();
                renderPullRequests();
            });
            subcategoryList.appendChild(li);
        }

        // Repo filters
        const repos = [...new Set(prs.map(p => p.repo))];
        if (repos.length > 1) {
            const repoLabel = document.createElement('li');
            repoLabel.className = 'subcategory-item sidebar-section-label';
            repoLabel.innerHTML = '<span style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-top:12px;display:block">Repository</span>';
            subcategoryList.appendChild(repoLabel);

            const repoShortNames = {
                'wifipineapplepager-payloads': 'Payloads',
                'wifipineapplepager-themes': 'Themes',
                'wifipineapplepager-ringtones': 'Ringtones'
            };

            const allRepoLi = document.createElement('li');
            allRepoLi.className = 'subcategory-item' + (prRepoFilter === 'all' ? ' active' : '');
            allRepoLi.innerHTML = `<span>All Repos</span><span class="sub-count">${prs.length}</span>`;
            allRepoLi.addEventListener('click', () => {
                prRepoFilter = 'all';
                renderPRSidebar();
                renderPullRequests();
            });
            subcategoryList.appendChild(allRepoLi);

            for (const repo of repos) {
                const count = prs.filter(p => p.repo === repo).length;
                const li = document.createElement('li');
                li.className = 'subcategory-item' + (prRepoFilter === repo ? ' active' : '');
                li.innerHTML = `<span>${repoShortNames[repo] || repo}</span><span class="sub-count">${count}</span>`;
                li.addEventListener('click', () => {
                    prRepoFilter = repo;
                    renderPRSidebar();
                    renderPullRequests();
                });
                subcategoryList.appendChild(li);
            }
        }
    }

    function getFilteredPRs() {
        if (!payloadData || !payloadData.pullRequests) return [];
        let prs = payloadData.pullRequests;

        if (prFilter === 'open') prs = prs.filter(p => p.state === 'open');
        else if (prFilter === 'merged') prs = prs.filter(p => p.merged);
        else if (prFilter === 'closed') prs = prs.filter(p => p.state === 'closed' && !p.merged);

        if (prRepoFilter !== 'all') prs = prs.filter(p => p.repo === prRepoFilter);

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            prs = prs.filter(p =>
                p.title.toLowerCase().includes(q) ||
                p.author.toLowerCase().includes(q) ||
                p.body.toLowerCase().includes(q) ||
                String(p.number).includes(q) ||
                p.labels.some(l => l.name.toLowerCase().includes(q))
            );
        }
        return prs;
    }

    function renderPullRequests() {
        const prs = getFilteredPRs();
        gridHeader.textContent = 'Pull Requests';
        gridCount.textContent = `${prs.length} PR${prs.length !== 1 ? 's' : ''}`;
        payloadGrid.innerHTML = '';

        if (prs.length === 0) {
            payloadGrid.innerHTML = `<div class="empty-state"><div class="empty-icon">\ud83d\udd00</div><p>${searchQuery ? 'No pull requests match your search.' : 'No pull requests found.'}</p></div>`;
            return;
        }
        for (const pr of prs) payloadGrid.appendChild(createPRCard(pr));
    }

    function getPRStateInfo(pr) {
        if (pr.merged) return { label: 'Merged', cssClass: 'pr-merged', icon: '\ud83d\udfe3' };
        if (pr.state === 'open') return { label: 'Open', cssClass: 'pr-open', icon: '\ud83d\udfe2' };
        return { label: 'Closed', cssClass: 'pr-closed', icon: '\ud83d\udd34' };
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function extractPlainText(md) {
        if (!md) return '';
        return md
            .replace(/```[\s\S]*?```/g, '')
            .replace(/#{1,6}\s+/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/[|`>-]/g, ' ')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200);
    }

    function getRepoShortName(repo) {
        const map = {
            'wifipineapplepager-payloads': 'payloads',
            'wifipineapplepager-themes': 'themes',
            'wifipineapplepager-ringtones': 'ringtones'
        };
        return map[repo] || repo;
    }

    function createPRCard(pr) {
        const card = document.createElement('div');
        card.className = 'payload-card pr-card';
        const stateInfo = getPRStateInfo(pr);
        const description = extractPlainText(pr.body) || 'No description provided.';
        const labelsHtml = pr.labels.map(l =>
            `<span class="pr-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`
        ).join('');

        card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(pr.title)}</span>
        <span class="pr-state-badge ${stateInfo.cssClass}">${stateInfo.icon} ${stateInfo.label}</span>
      </div>
      <p class="card-description">${escapeHtml(description)}</p>
      ${labelsHtml ? `<div class="pr-labels-row">${labelsHtml}</div>` : ''}
      <div class="card-footer">
        <div class="card-author">
          ${pr.authorAvatar ? `<img class="pr-avatar" src="${pr.authorAvatar}" alt="${escapeHtml(pr.author)}" width="16" height="16">` : `<span class="card-author-icon">${pr.author.charAt(0).toUpperCase()}</span>`}
          <span>${escapeHtml(pr.author)}</span>
        </div>
        <div class="card-tags">
          <span class="card-tag tag-pr-number">#${pr.number}</span>
          ${pr.repo ? `<span class="card-tag tag-pr-repo">${getRepoShortName(pr.repo)}</span>` : ''}
          ${pr.body ? '<span class="card-tag tag-has-readme">DESC</span>' : ''}
          ${pr.draft ? '<span class="card-tag tag-draft">DRAFT</span>' : ''}
        </div>
      </div>`;

        card.addEventListener('click', () => openPRModal(pr));
        return card;
    }

    function openPRModal(pr) {
        const stateInfo = getPRStateInfo(pr);
        let activeTab = pr.body ? 'description' : 'info';

        function render() {
            modalContent.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(pr.title)}</h2>
          <div class="modal-meta">
            <span class="modal-meta-item"><span class="pr-state-badge ${stateInfo.cssClass}">${stateInfo.icon} ${stateInfo.label}</span></span>
            <span class="modal-meta-item">\ud83d\udc64 <strong>${escapeHtml(pr.author)}</strong></span>
            <span class="modal-meta-item">#${pr.number}</span>
            <span class="modal-meta-item"><a href="${pr.htmlUrl}" target="_blank" rel="noopener">View on GitHub \u2192</a></span>
          </div>
        </div>
        <div class="modal-tabs">
          ${pr.body ? `<button class="modal-tab ${activeTab === 'description' ? 'active' : ''}" data-tab="description">\ud83d\udcd6 Description</button>` : ''}
          <button class="modal-tab ${activeTab === 'info' ? 'active' : ''}" data-tab="info">\ud83d\udcdd Info</button>
        </div>
        <div class="modal-body">
          ${activeTab === 'description' ? `<div>${simpleMarkdown(pr.body)}</div>` : ''}
          ${activeTab === 'info' ? renderPRInfo(pr) : ''}
        </div>`;

            modalContent.querySelectorAll('.modal-tab').forEach(tab => {
                tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); });
            });
        }

        render();
        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function renderPRInfo(pr) {
        const stateInfo = getPRStateInfo(pr);
        return `
      <table class="pr-info-table">
        <tr><td><strong>Number</strong></td><td>#${pr.number}</td></tr>
        <tr><td><strong>State</strong></td><td><span class="pr-state-badge ${stateInfo.cssClass}">${stateInfo.icon} ${stateInfo.label}</span></td></tr>
        <tr><td><strong>Repository</strong></td><td>${escapeHtml(pr.repo || '')}</td></tr>
        <tr><td><strong>Author</strong></td><td>
          <span style="display:inline-flex;align-items:center;gap:6px">
            ${pr.authorAvatar ? `<img class="pr-avatar" src="${pr.authorAvatar}" width="20" height="20">` : ''}
            ${pr.authorUrl ? `<a href="${pr.authorUrl}" target="_blank" rel="noopener">${escapeHtml(pr.author)}</a>` : escapeHtml(pr.author)}
          </span>
        </td></tr>
        <tr><td><strong>Created</strong></td><td>${formatDate(pr.createdAt)}</td></tr>
        ${pr.updatedAt ? `<tr><td><strong>Updated</strong></td><td>${formatDate(pr.updatedAt)}</td></tr>` : ''}
        ${pr.mergedAt ? `<tr><td><strong>Merged</strong></td><td>${formatDate(pr.mergedAt)}</td></tr>` : ''}
        ${pr.closedAt && !pr.merged ? `<tr><td><strong>Closed</strong></td><td>${formatDate(pr.closedAt)}</td></tr>` : ''}
        ${pr.draft ? '<tr><td><strong>Draft</strong></td><td>Yes</td></tr>' : ''}
      </table>
      ${pr.labels.length > 0 ? `<div style="margin-top:16px"><strong style="color:var(--text-primary)">Labels</strong><div class="pr-labels-row" style="margin-top:8px">${pr.labels.map(l => `<span class="pr-label" style="background:#${l.color}22;color:#${l.color};border:1px solid #${l.color}44">${escapeHtml(l.name)}</span>`).join('')}</div></div>` : ''}`;
    }

    // ================================================================
    // Payload Modal
    // ================================================================
    function openPayloadModal(payload) {
        let activeTab = payload.readme ? 'readme' : 'source';

        function render() {
            modalContent.innerHTML = `
        <div class="modal-header">
          <h2 class="modal-title">${escapeHtml(payload.title)}</h2>
          <div class="modal-meta">
            <span class="modal-meta-item">\ud83d\udc64 <strong>${escapeHtml(payload.author)}</strong></span>
            ${payload.version ? `<span class="modal-meta-item">\ud83d\udce6 v${escapeHtml(payload.version)}</span>` : ''}
            ${payload.payloadCategory ? `<span class="modal-meta-item">\ud83c\udff7\ufe0f ${escapeHtml(payload.payloadCategory)}</span>` : ''}
            <span class="modal-meta-item"><a href="${payload.githubUrl}" target="_blank" rel="noopener">View on GitHub \u2192</a></span>
          </div>
        </div>
        <div class="modal-tabs">
          ${payload.readme ? `<button class="modal-tab ${activeTab === 'readme' ? 'active' : ''}" data-tab="readme">\ud83d\udcd6 README</button>` : ''}
          <button class="modal-tab ${activeTab === 'source' ? 'active' : ''}" data-tab="source">\ud83d\udcbb Source Code</button>
          <button class="modal-tab ${activeTab === 'description' ? 'active' : ''}" data-tab="description">\ud83d\udcdd Description</button>
        </div>
        <div class="modal-body">
          ${activeTab === 'readme' ? `<div>${simpleMarkdown(payload.readme)}</div>` : ''}
          ${activeTab === 'source' ? `<div class="source-code-view"><div class="source-code-header"><span class="source-code-filename">payload.sh</span><button class="copy-btn">Copy</button></div><pre><code>${escapeHtml(payload.payloadSource)}</code></pre></div>` : ''}
          ${activeTab === 'description' ? `<h3 style="color:var(--text-primary);margin-bottom:12px">Description</h3><p>${escapeHtml(payload.description)}</p>${payload.payloadCategory ? `<p style="margin-top:12px"><strong>Category:</strong> ${escapeHtml(payload.payloadCategory)}</p>` : ''}` : ''}
        </div>`;

            modalContent.querySelectorAll('.modal-tab').forEach(tab => {
                tab.addEventListener('click', () => { activeTab = tab.dataset.tab; render(); });
            });

            const copyBtn = modalContent.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(payload.payloadSource).then(() => {
                        copyBtn.textContent = '\u2713 Copied!';
                        copyBtn.classList.add('copied');
                        setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
                    });
                });
            }
        }

        render();
        modalOverlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    // ================================================================
    // Simple Markdown Renderer
    // ================================================================
    function simpleMarkdown(md, baseUrl, stripImages) {
        if (!md) return '';

        // Preserve safe HTML tags and entities through escaping
        const preserved = [];
        const safeTags = /^\/?(img|br|hr|p|h[1-6]|em|strong|b|i|a|div|span|pre|code|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|details|summary|sub|sup)$/i;
        let raw = md.replace(/<\/?[a-z][a-z0-9]*\b[^>]*\/?>/gi, (match) => {
            // Extract tag name
            const tagMatch = match.match(/^<\/?([a-z][a-z0-9]*)/i);
            if (!tagMatch || !safeTags.test(tagMatch[1])) return match;
            // Strip img tags entirely if requested (images shown in separate tab)
            if (stripImages && /^<img/i.test(match)) return '';
            // Resolve relative src/href URLs if baseUrl provided
            if (baseUrl) {
                match = match.replace(/(src|href)=["']([^"']+)["']/gi, (s, attr, url) => {
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('#') && !url.startsWith('mailto:')) {
                        return `${attr}="${baseUrl}${url}"`;
                    }
                    return s;
                });
            }
            // Add styling to img tags
            if (/^<img/i.test(match) && !match.includes('style=')) {
                match = match.replace(/<img/i, '<img style="max-width:100%;border-radius:8px;margin:8px 0"');
            }
            const idx = preserved.length;
            preserved.push(match);
            return `\x00SAFE${idx}\x00`;
        });
        // Preserve HTML entities
        raw = raw.replace(/&(nbsp|amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/gi, (match) => {
            const idx = preserved.length;
            preserved.push(match);
            return `\x00SAFE${idx}\x00`;
        });

        let html = escapeHtml(raw);

        // Restore preserved HTML
        html = html.replace(/\x00SAFE(\d+)\x00/g, (_, idx) => preserved[parseInt(idx)]);

        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.trim()}</code></pre>`);
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
            if (stripImages) return '';
            if (baseUrl && !url.startsWith('http://') && !url.startsWith('https://')) url = baseUrl + url;
            return `<img src="${url}" alt="${alt}" style="max-width:100%;border-radius:8px;margin:8px 0">`;
        });
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        html = html.replace(/^\|(.+)\|$/gm, (match) => {
            const cells = match.split('|').filter(c => c.trim());
            if (cells.every(c => /^[\s-:]+$/.test(c))) return '<!-- table separator -->';
            return match;
        });

        const lines = html.split('\n');
        let inTable = false, tableHtml = '';
        const result = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (!inTable) { inTable = true; tableHtml = '<table>'; }
                if (trimmed === '&lt;!-- table separator --&gt;' || trimmed === '<!-- table separator -->') continue;
                const cells = trimmed.split('|').filter(c => c.trim());
                const tag = !tableHtml.includes('<td') ? 'th' : 'td';
                tableHtml += '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
            } else {
                if (inTable) { tableHtml += '</table>'; result.push(tableHtml); tableHtml = ''; inTable = false; }
                result.push(trimmed);
            }
        }
        if (inTable) { tableHtml += '</table>'; result.push(tableHtml); }
        html = result.join('\n');

        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/^---$/gm, '<hr>');
        html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
        html = html.replace(/<p>\s*<\/p>/g, '');

        return html;
    }

    // ================================================================
    // Search
    // ================================================================
    function handleSearch() {
        searchQuery = searchInput.value.trim();
        if (activeMainTab === 'payloads') renderPayloads();
        else if (activeMainTab === 'themes') renderThemes();
        else if (activeMainTab === 'ringtones') renderRingtones();
        else if (activeMainTab === 'pullrequests') renderPullRequests();
    }

    // ================================================================
    // Helpers
    // ================================================================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function closeModal() {
        stopRTTTL();
        modalOverlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function debounce(fn, ms) {
        let timer;
        return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    // ================================================================
    // Event Listeners
    // ================================================================
    searchInput.addEventListener('input', debounce(handleSearch, 200));

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('open')) {
                closeModal();
            } else {
                searchInput.blur();
                searchInput.value = '';
                searchQuery = '';
                handleSearch();
            }
        }
    });

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    // ================================================================
    // Boot
    // ================================================================
    init();
})();
