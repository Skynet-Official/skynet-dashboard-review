(function () {
  'use strict';
  window.SkynetTemplates = window.SkynetTemplates || {};
  window.SkynetTemplates.newsletter = {
    mount(root, api) {
      const db = api.data || window.SkynetSnapshot?.databases?.newsletter || { records: [], name: 'Newsletter_ideas' };
      const records = db.records || [];
      const esc = api.escape || (text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])));
      const events = new AbortController();
      const icon = name => api.icon(name);
      const field = (record, key) => record.fields?.[key] == null || record.fields[key] === '' ? 'Not set' : String(record.fields[key]);
      const statusOf = record => field(record, 'approval_status');
      const titleOf = record => field(record, 'idea');
      const keyOf = (record, index) => record.row_id || record.rowId || String(index);
      const rowKeys = new Map(records.map((record, index) => [record, keyOf(record, index)]));
      const types = [...new Set(records.map(record => field(record, 'type')))];
      const statuses = [...new Set(records.map(statusOf))];
      const approved = records.filter(record => statusOf(record) === 'Approved').length;
      const notSet = records.filter(record => statusOf(record) === 'Not set').length;
      const campaigns = new Set(records.filter(record => field(record, 'campaign_id') !== 'Not set').map(record => field(record, 'campaign_id'))).size;
      let query = '';
      let type = 'all';
      let approval = 'all';
      let selected = records[0] || null;
      let visible = records.slice();
      let animation = null;
      const typeIcons = { Philosophy: 'lightbulb', Proof: 'chart-no-axes-combined', Problem: 'circle-help', Plan: 'list-checks', 'Direct Ask': 'mouse-pointer-2' };
      const countStatus = status => records.filter(record => statusOf(record) === status).length;
      const text = value => esc(String(value));

      root.innerHTML = `<section class="newsletter-template" aria-label="Newsletter ideas">
        <header class="nl-heading"><div><h2 class="nl-title">Newsletter ideas</h2><p>Explore the angle. Read the brief. Keep the whole story in view.</p></div><div class="nl-source-label">${icon('database')}<span>${esc(db.name)}</span></div></header>
        <div class="nl-summary" aria-label="Snapshot record counts"><div class="nl-summary-intro"><span class="nl-summary-mark">${icon('notebook-pen')}</span><div><strong>${records.length} ideas</strong><span>Across ${campaigns} ${campaigns === 1 ? 'campaign' : 'campaigns'}</span></div></div><div class="nl-summary-count"><strong>${approved}</strong><span><i class="nl-status-dot is-approved"></i>Approved</span></div><div class="nl-summary-count"><strong>${notSet}</strong><span><i class="nl-status-dot"></i>Approval not set</span></div><div class="nl-summary-note"><span>APPROVAL STATUS</span><div class="nl-ratio-track" aria-hidden="true"><div style="width:${records.length ? approved / records.length * 100 : 0}%"></div></div><small>${approved} of ${records.length} ideas marked Approved</small></div></div>
        <div class="nl-filter-bar"><div class="nl-search">${icon('search')}<input type="search" data-search aria-label="Search newsletter ideas" placeholder="Search ideas, angles, campaigns…" autocomplete="off"><button type="button" data-clear-search aria-label="Clear idea search" hidden>${icon('x')}</button></div><div class="nl-type-filter"><label for="newsletter-type-filter">Type</label><select id="newsletter-type-filter" data-type><option value="all">All types</option>${types.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}</select>${icon('chevron-down')}</div></div>
        <div class="nl-status-filters" role="group" aria-label="Filter by approval status"><button type="button" data-status="all" aria-pressed="true" class="is-active">All ideas <span>${records.length}</span></button>${statuses.map(value => `<button type="button" data-status="${esc(value)}" aria-pressed="false">${esc(value)} <span>${countStatus(value)}</span></button>`).join('')}<button type="button" data-reset-filters class="nl-reset-filters" hidden>Clear filters ${icon('x')}</button></div>
        <div class="nl-workspace"><section class="nl-idea-index" aria-label="Newsletter idea list"><header class="nl-index-heading"><h3>Your ideas</h3><span data-match-count>${records.length} records</span></header><div data-list></div></section><section class="nl-reading-pane" aria-label="Selected idea brief" data-detail></section></div>
        <p class="nl-live" aria-live="polite" role="status" data-live></p>
      </section>`;
      const $ = selector => root.querySelector(selector);
      const $$ = selector => [...root.querySelectorAll(selector)];
      const announce = message => { $('[data-live]').textContent = message; api.status(message); };
      const isFiltered = () => query.trim() !== '' || type !== 'all' || approval !== 'all';

      function renderList() {
        $('[data-match-count]').textContent = `${visible.length} of ${records.length} records`;
        $('[data-list]').innerHTML = visible.length ? visible.map(record => {
          const status = statusOf(record);
          const selectedRow = record === selected;
          return `<button type="button" class="nl-idea snapshot-reveal ${selectedRow ? 'is-selected' : ''}" data-record="${esc(rowKeys.get(record))}" aria-pressed="${selectedRow}"><div class="nl-idea-meta"><span class="nl-type-label">${icon(typeIcons[field(record, 'type')] || 'file-text')}${esc(field(record, 'type'))}</span><span class="nl-status ${status === 'Approved' ? 'is-approved' : ''}"><i></i>${esc(status)}</span></div><strong>${esc(titleOf(record))}</strong><div class="nl-idea-footer"><span title="${esc(field(record, 'campaign_id'))}">${esc(field(record, 'campaign_id'))}</span>${icon('arrow-up-right')}</div></button>`;
        }).join('') : `<div class="nl-empty-list">${icon('search')}<h4>No ideas match these filters</h4><p>Try another phrase, type, or approval status.</p><button type="button" class="button button-ghost" data-empty-reset>Clear filters</button></div>`;
      }

      function replay() {
        animation?.cancel();
        if (!selected || window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof $('[data-detail]').animate !== 'function') return;
        animation = $('[data-detail]').animate([{ opacity: .45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 330, easing: 'cubic-bezier(.2,.7,.3,1)' });
      }

      function renderDetail(animate = false) {
        if (!selected) {
          $('[data-detail]').innerHTML = `<div class="nl-empty-detail"><span>${icon('notebook-pen')}</span><h3>A little room for a good idea.</h3><p>${records.length ? 'Clear your filters to explore the newsletter briefs in this snapshot.' : 'This snapshot contains no newsletter ideas.'}</p></div>`;
          return;
        }
        const status = statusOf(selected);
        const updated = selected.updated_at || selected.updatedAt;
        const date = updated ? (api.date ? api.date(updated) : new Date(updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })) : 'Not set';
        $('[data-detail]').innerHTML = `<article class="nl-brief snapshot-reveal"><div class="nl-brief-top"><span>${icon('file-text')} THE IDEA BRIEF</span><span class="nl-status ${status === 'Approved' ? 'is-approved' : ''}"><i></i>${esc(status)}</span></div><div class="nl-brief-header"><span class="nl-brief-type">${icon(typeIcons[field(selected, 'type')] || 'file-text')}${esc(field(selected, 'type'))}</span><h3>${esc(titleOf(selected))}</h3><div class="nl-brief-campaign"><span>CAMPAIGN</span><strong>${esc(field(selected, 'campaign_id'))}</strong></div></div><div class="nl-brief-body"><section class="nl-angle"><div class="nl-section-label">${icon('focus')}<h4>Core angle</h4></div><p>${esc(field(selected, 'core_angle'))}</p></section><section class="nl-key-points"><div class="nl-section-label">${icon('list')}<h4>Key points</h4></div><p>${esc(field(selected, 'key_points'))}</p></section><section class="nl-cta"><span>${icon('corner-down-right')}</span><div><h4>Call to action</h4><p>${esc(field(selected, 'cta'))}</p></div></section></div><footer class="nl-brief-footer"><div><span>Last updated</span><strong>${text(date)}</strong></div><button type="button" class="button button-ghost" data-open-record>View source record ${icon('arrow-up-right')}</button></footer></article><p class="nl-source-note">${icon('database')} Text shown as stored in ${esc(db.name)}.</p>`;
        if (animate) replay();
      }

      function applyFilters() {
        const needle = query.trim().toLocaleLowerCase();
        visible = records.filter(record => (type === 'all' || field(record, 'type') === type) && (approval === 'all' || statusOf(record) === approval) && (!needle || Object.values(record.fields || {}).some(value => String(value ?? '').toLocaleLowerCase().includes(needle))));
        if (!visible.includes(selected)) selected = visible[0] || null;
        $('[data-clear-search]').hidden = query === '';
        $('[data-reset-filters]').hidden = !isFiltered();
        $$('[data-status]').forEach(button => { const active = button.dataset.status === approval; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
        renderList();
        renderDetail();
        announce(`${visible.length} of ${records.length} newsletter ideas shown.`);
      }

      function reset() {
        query = '';
        type = 'all';
        approval = 'all';
        selected = records[0] || null;
        $('[data-search]').value = '';
        $('[data-type]').value = 'all';
        applyFilters();
      }

      root.addEventListener('input', event => { if (event.target.matches('[data-search]')) { query = event.target.value; applyFilters(); } }, { signal: events.signal });
      root.addEventListener('change', event => { if (event.target.matches('[data-type]')) { type = event.target.value; applyFilters(); } }, { signal: events.signal });
      root.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || !root.contains(button)) return;
        if (button.hasAttribute('data-record')) {
          selected = records.find(record => rowKeys.get(record) === button.dataset.record) || null;
          $$('[data-record]').forEach(item => { const active = item === button; item.classList.toggle('is-selected', active); item.setAttribute('aria-pressed', String(active)); });
          renderDetail(true);
          if (window.matchMedia('(max-width: 800px)').matches && typeof $('[data-detail]').scrollIntoView === 'function') {
            $('[data-detail]').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          }
          announce(`Reading ${titleOf(selected)}.`);
        }
        if (button.hasAttribute('data-status')) { approval = button.dataset.status; applyFilters(); }
        if (button.hasAttribute('data-clear-search')) { query = ''; $('[data-search]').value = ''; applyFilters(); $('[data-search]').focus(); }
        if (button.hasAttribute('data-reset-filters') || button.hasAttribute('data-empty-reset')) { reset(); $('[data-search]').focus(); }
        if (button.hasAttribute('data-open-record') && selected) api.openRecord(selected, titleOf(selected));
      }, { signal: events.signal });
      renderList();
      renderDetail();
      return { reset, replay, destroy() { events.abort(); animation?.cancel(); } };
    }
  };
})();
