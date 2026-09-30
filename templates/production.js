(function () {
  'use strict';

  window.SkynetTemplates = window.SkynetTemplates || {};
  window.SkynetTemplates.production = {
    mount(root, api) {
      const database = api.data || window.SkynetSnapshot?.databases?.production || {};
      const records = Array.isArray(database.records) ? database.records : [];
      const escape = api.escape;
      const icon = api.icon;
      const number = value => api.number ? api.number(value) : String(value);
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const animations = new Set();
      const missing = 'Not set';
      let query = '';
      let statusFilter = '';
      let formatFilter = '';
      let view = 'board';
      let destroyed = false;

      const field = (record, key) => {
        const value = record.fields?.[key];
        return value == null || value === '' ? '' : String(value);
      };
      const title = record => field(record, 'title') || 'Untitled record';
      const platforms = record => {
        const values = record.fields?.platforms;
        return Array.isArray(values) ? values.map(String).filter(Boolean) : values ? [String(values)] : [];
      };
      const valuesFor = key => [...new Set(records.map(record => field(record, key) || missing))];
      const statusValues = valuesFor('status');
      const formatValues = valuesFor('format').sort((a, b) => a.localeCompare(b));
      const statusCounts = new Map(statusValues.map(status => [status, records.filter(record => (field(record, 'status') || missing) === status).length]));
      const statusOrder = [...statusValues].sort((a, b) => statusCounts.get(b) - statusCounts.get(a) || a.localeCompare(b));
      const indexById = new Map(records.map((record, index) => [String(index), record]));
      const iconForFormat = format => ({ 'Article/Blog': 'file-text', 'Carousel': 'layers', 'Single Image': 'image', 'Reel/Short Video': 'video', 'Thread': 'list', 'Single Tweet': 'message-circle', 'Quote Tweet': 'quote', 'Poll': 'chart-no-axes-column', 'Space': 'mic', 'Ad': 'megaphone' }[format] || 'file-text');
      const statusTone = status => ['Approved', 'Ready to publish', 'Complete', 'Published'].includes(status) ? 'sage' : ['Review', 'Waiting for approval', 'Draft — Pending Approval'].includes(status) ? 'warm' : 'violet';
      const updated = record => record.updated_at ? api.date(record.updated_at) : 'Date not set';

      function visibleRecords() {
        const needle = query.trim().toLocaleLowerCase();
        return records.filter(record => {
          if (statusFilter && (field(record, 'status') || missing) !== statusFilter) return false;
          if (formatFilter && (field(record, 'format') || missing) !== formatFilter) return false;
          if (!needle) return true;
          return ['title', 'hook', 'description', 'format', 'status', 'pillar', 'idea_tier'].map(key => field(record, key)).concat(platforms(record)).join(' ').toLocaleLowerCase().includes(needle);
        });
      }

      function selectOptions(values, selected, allLabel, includeCounts) {
        return `<option value="">${allLabel}</option>${values.map(value => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(value)}${includeCounts ? ` (${number(statusCounts.get(value))})` : ''}</option>`).join('')}`;
      }

      function renderShell() {
        root.innerHTML = `<section class="production-template" aria-label="Content ideas dashboard">
          <header class="production-heading"><div><h2>${escape(database.name || 'Content ideas')}</h2><p>Ideas, hooks and formats, organised by their recorded status.</p></div><span class="production-readonly">${icon('database')} Export snapshot</span></header>
          <div class="production-summary"><span><strong>${number(records.length)}</strong> of ${number(database.totalCount ?? records.length)} records loaded</span><span><strong>${number(statusValues.length)}</strong> recorded statuses</span><span><strong>${number(formatValues.length)}</strong> formats</span></div>
          <div class="production-toolbar">
            <div class="production-search"><label class="production-sr-only" for="production-search">Search content ideas</label>${icon('search')}<input id="production-search" type="search" placeholder="Search ideas or hooks…" autocomplete="off" value="${escape(query)}"><button type="button" class="production-clear" data-action="clear-search" aria-label="Clear search"${query ? '' : ' hidden'}>${icon('x')}</button></div>
            <label class="production-filter"><span>Status</span><select id="production-status" aria-label="Filter by status">${selectOptions(statusOrder, statusFilter, 'All statuses', true)}</select></label>
            <label class="production-filter"><span>Format</span><select id="production-format" aria-label="Filter by format">${selectOptions(formatValues, formatFilter, 'All formats', false)}</select></label>
            <div class="production-view" role="group" aria-label="Dashboard view"><button type="button" data-view="board" aria-pressed="${view === 'board'}" aria-label="Board view">${icon('columns-3')}<span>Board</span></button><button type="button" data-view="list" aria-pressed="${view === 'list'}" aria-label="List view">${icon('list')}<span>List</span></button></div>
          </div>
          <div class="production-results-bar"><p data-results-summary aria-live="polite"></p><div class="production-scroll-controls"><span>Scroll through statuses</span><button type="button" data-action="scroll-back" aria-label="Previous status columns">${icon('chevron-left')}</button><button type="button" data-action="scroll-next" aria-label="Next status columns">${icon('chevron-right')}</button></div></div>
          <div class="production-results"></div>
          <footer class="production-footnote"><span>${icon('info')} Counts and filters cover the ${number(records.length)} loaded records.</span><span>Statuses come from the Status field.</span></footer>
        </section>`;
        renderResults();
      }

      function card(record) {
        const index = records.indexOf(record);
        const format = field(record, 'format') || 'Format not set';
        const hook = field(record, 'hook');
        const tier = field(record, 'idea_tier');
        const channels = platforms(record);
        return `<article class="production-card snapshot-reveal">
          <div class="production-card-top"><span>${icon(iconForFormat(format))}${escape(format)}</span><span class="production-record-mark">${icon('arrow-up-right')}</span></div>
          <h4><button type="button" data-record="${index}">${escape(title(record))}</button></h4>
          <div class="production-hook${hook ? '' : ' production-missing'}"><span>Hook</span><p>${hook ? escape(hook) : 'No hook recorded'}</p></div>
          <div class="production-platforms">${channels.length ? channels.map(channel => `<span>${escape(channel)}</span>`).join('') : '<span class="production-missing">Platform not set</span>'}</div>
          <div class="production-card-bottom"><span>${escape(tier || 'Tier not set')}</span><span title="Last updated">${escape(updated(record))}</span></div>
        </article>`;
      }

      function board(rows) {
        const groups = statusOrder.map(status => ({ status, records: rows.filter(record => (field(record, 'status') || missing) === status) })).filter(group => group.records.length);
        return `<div class="production-board" tabindex="0" role="region" aria-label="Content board; scroll horizontally for all status columns">${groups.map(group => `<section class="production-lane production-tone-${statusTone(group.status)}" aria-label="${escape(group.status)}: ${group.records.length} records"><header><span class="production-status-dot" aria-hidden="true"></span><h3>${escape(group.status)}</h3><span class="production-count">${number(group.records.length)}</span></header><div class="production-lane-body" tabindex="0" role="region" aria-label="${escape(group.status)} records">${group.records.map(card).join('')}</div></section>`).join('')}</div>`;
      }

      function list(rows) {
        return `<div class="production-list"><table><caption class="production-sr-only">Content ideas matching the current filters</caption><thead><tr><th scope="col">Idea</th><th scope="col">Status</th><th scope="col">Format / platforms</th><th scope="col">Updated</th></tr></thead><tbody>${rows.map(record => {
          const status = field(record, 'status') || missing;
          return `<tr class="snapshot-reveal"><td><button type="button" class="production-list-title" data-record="${records.indexOf(record)}">${escape(title(record))}${icon('arrow-up-right')}</button><span class="production-list-pillar">${escape(field(record, 'pillar') || 'Pillar not set')}</span></td><td data-label="Status"><span class="production-status-badge production-tone-${statusTone(status)}">${escape(status)}</span></td><td data-label="Format / platforms"><span class="production-list-format">${escape(field(record, 'format') || 'Format not set')}</span><span class="production-list-platforms">${escape(platforms(record).join(' · ') || 'Platform not set')}</span></td><td data-label="Updated"><span class="production-list-date">${escape(updated(record))}</span></td></tr>`;
        }).join('')}</tbody></table></div>`;
      }

      function renderResults() {
        if (destroyed) return;
        const rows = visibleRecords();
        const result = root.querySelector('.production-results');
        const activeFilters = !!(query.trim() || statusFilter || formatFilter);
        const summary = root.querySelector('[data-results-summary]');
        summary.textContent = `${number(rows.length)} ${rows.length === 1 ? 'idea' : 'ideas'}${activeFilters ? ` matching · ${number(records.length)} loaded` : ` · ${view === 'board' ? 'Largest status groups first' : 'Export order'}`}`;
        if (!rows.length) {
          result.innerHTML = `<div class="production-empty">${icon('search')}<h3>${records.length ? 'No ideas match these filters' : 'No content ideas in this export'}</h3><p>${records.length ? 'Try another phrase, status or format.' : 'There are no records to display in this snapshot.'}</p>${records.length ? '<button type="button" class="button" data-action="clear-filters">Clear filters</button>' : ''}</div>`;
        } else result.innerHTML = view === 'board' ? board(rows) : list(rows);
        const controls = root.querySelector('.production-scroll-controls');
        controls.hidden = view !== 'board' || !rows.length;
        root.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
        const clear = root.querySelector('[data-action="clear-search"]');
        clear.hidden = !query;
        const viewport = root.querySelector('.production-board');
        if (viewport) viewport.addEventListener('scroll', updateScrollControls, { passive: true });
        updateScrollControls();
        api.status(`${number(rows.length)} of ${number(records.length)} loaded content ideas shown. Read-only export.`);
      }

      function updateScrollControls() {
        const viewport = root.querySelector('.production-board');
        const previous = root.querySelector('[data-action="scroll-back"]');
        const next = root.querySelector('[data-action="scroll-next"]');
        if (!viewport || !previous || !next) return;
        const canScroll = viewport.scrollWidth > viewport.clientWidth + 2;
        root.querySelector('.production-scroll-controls').hidden = !canScroll;
        previous.disabled = viewport.scrollLeft <= 2;
        next.disabled = viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2;
      }

      function clearFilters() {
        query = '';
        statusFilter = '';
        formatFilter = '';
        root.querySelector('#production-search').value = '';
        root.querySelector('#production-status').value = '';
        root.querySelector('#production-format').value = '';
        renderResults();
        root.querySelector('#production-search').focus({ preventScroll: true });
      }

      function handleClick(event) {
        const recordButton = event.target.closest('[data-record]');
        if (recordButton && root.contains(recordButton)) {
          const record = indexById.get(recordButton.dataset.record);
          if (record) api.openRecord(record, title(record));
          return;
        }
        const viewButton = event.target.closest('[data-view]');
        if (viewButton && root.contains(viewButton)) { view = viewButton.dataset.view; renderResults(); return; }
        const action = event.target.closest('[data-action]');
        if (!action || !root.contains(action)) return;
        if (action.dataset.action === 'clear-search') {
          query = '';
          root.querySelector('#production-search').value = '';
          renderResults();
          root.querySelector('#production-search').focus({ preventScroll: true });
        } else if (action.dataset.action === 'clear-filters') clearFilters();
        else if (action.dataset.action.startsWith('scroll-')) {
          const viewport = root.querySelector('.production-board');
          if (viewport) viewport.scrollBy({ left: (action.dataset.action === 'scroll-next' ? 1 : -1) * Math.max(280, viewport.clientWidth * .75), behavior: motion.matches ? 'instant' : 'smooth' });
        }
      }

      function handleInput(event) {
        if (event.target.id === 'production-search') { query = event.target.value; renderResults(); }
      }
      function handleChange(event) {
        if (event.target.id === 'production-status') { statusFilter = event.target.value; renderResults(); }
        if (event.target.id === 'production-format') { formatFilter = event.target.value; renderResults(); }
      }
      function replay() {
        animations.forEach(animation => animation.cancel());
        animations.clear();
        if (destroyed || motion.matches) return;
        root.querySelectorAll('.production-lane, .production-list tbody tr').forEach((element, index) => {
          if (index > 7) return;
          const animation = element.animate([{ opacity: .72, transform: 'translateY(9px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 380, delay: index * 35, easing: 'cubic-bezier(.2,.8,.2,1)' });
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        });
      }
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateScrollControls) : null;
      root.addEventListener('click', handleClick);
      root.addEventListener('input', handleInput);
      root.addEventListener('change', handleChange);
      renderShell();
      observer?.observe(root);
      return {
        reset() { query = ''; statusFilter = ''; formatFilter = ''; view = 'board'; renderShell(); },
        replay,
        destroy() {
          destroyed = true;
          observer?.disconnect();
          animations.forEach(animation => animation.cancel());
          animations.clear();
          root.removeEventListener('click', handleClick);
          root.removeEventListener('input', handleInput);
          root.removeEventListener('change', handleChange);
        },
      };
    },
  };
})();
