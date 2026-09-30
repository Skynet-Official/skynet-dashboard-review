(function () {
  'use strict';
  window.SkynetTemplates = window.SkynetTemplates || {};
  window.SkynetTemplates.campaign = {
    mount(root, api) {
      const db = api.data || window.SkynetSnapshot?.databases?.campaign || {};
      const records = Array.isArray(db.records) ? db.records : [];
      const esc = api.escape || (value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])));
      const icon = name => api.icon ? api.icon(name) : '';
      const events = new AbortController();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const animations = new Set();
      const present = value => value !== null && value !== undefined && String(value).trim() !== '';
      const text = value => Array.isArray(value) ? value.join(', ') : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
      const title = record => present(record.fields?.campaign_name) ? text(record.fields.campaign_name) : 'Untitled campaign';
      const sourceId = record => String(record.row_id || record.rowId || '');
      const field = (record, key) => record.fields?.[key];
      const number = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 8 }) : text(value);
      const date = value => value && !Number.isNaN(Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : 'Not set';
      const statusValues = [...new Set(records.map(record => text(field(record, 'status'))).filter(Boolean))];
      const hasMissingStatus = records.some(record => !present(field(record, 'status')));
      const declaredStatuses = (db.columns || []).find(column => column.key === 'status')?.options || [];
      const counts = {
        named: records.filter(record => present(field(record, 'campaign_name'))).length,
        brief: records.filter(record => present(field(record, 'content_briefs'))).length,
        budget: records.filter(record => present(field(record, 'budget_total'))).length
      };
      let selectedId = records[0] ? sourceId(records[0]) : null;
      let query = '', statusFilter = '', compareMode = false, nameMissingOnly = false;
      const selectedCompare = new Set();
      const $ = selector => root.querySelector(selector);
      const listen = (target, event, callback) => target.addEventListener(event, callback, { signal: events.signal });
      const safeUrl = value => { try { const url = new URL(String(value)); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
      function chips(value, empty = 'Not set') {
        if (!present(value) || (Array.isArray(value) && !value.length)) return `<span class="campaign-empty-value">${esc(empty)}</span>`;
        return (Array.isArray(value) ? value : [value]).map(item => `<span class="campaign-value-chip">${esc(text(item))}</span>`).join('');
      }
      function statusChip(record) {
        const value = field(record, 'status');
        return present(value) ? `<span class="campaign-status ${value === 'live' || value === 'active' ? 'campaign-status-live' : ''}">${esc(text(value))}</span>` : '<span class="campaign-status campaign-status-empty">Status not set</span>';
      }
      function matching() {
        const needle = query.trim().toLowerCase();
        return records.filter(record => {
          const values = record.fields || {};
          const status = text(values.status);
          if (statusFilter && (statusFilter === '__missing' ? present(values.status) : status !== statusFilter)) return false;
          if (nameMissingOnly && present(values.campaign_name)) return false;
          return !needle || [sourceId(record), ...Object.values(values).map(text)].join(' ').toLowerCase().includes(needle);
        });
      }
      root.innerHTML = `<section class="campaign-template" aria-labelledby="campaign-heading">
        <header class="campaign-header"><div><h2 id="campaign-heading">Campaign planner</h2><p>Explore the plans, audiences and creative briefs in your campaign database.</p></div><span class="campaign-source-badge">${icon('database')} Production snapshot</span></header>
        <div class="campaign-overview"><span><strong>${records.length}</strong> records</span><span><strong>${counts.brief}</strong> with a creative brief</span><span><strong>${counts.budget}</strong> with a recorded budget</span><button type="button" class="campaign-missing-filter" aria-pressed="false">${records.length - counts.named} without a campaign name ${icon('arrow-up-right')}</button></div>
        <div class="campaign-toolbar"><div class="campaign-search">${icon('search')}<label class="campaign-visually-hidden" for="campaign-search">Search campaign records</label><input id="campaign-search" type="search" placeholder="Search names, audiences or briefs…" autocomplete="off"><button type="button" class="campaign-clear" aria-label="Clear campaign search" hidden>${icon('x')}</button></div><div class="campaign-status-filter"><label for="campaign-status-filter">Status</label><select id="campaign-status-filter"><option value="">All values</option>${statusValues.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('')}${hasMissingStatus ? '<option value="__missing">Not set</option>' : ''}</select></div><button type="button" class="button campaign-compare-button" disabled>${icon('columns-3')} Compare <span data-compare-count>0</span></button></div>
        <div class="campaign-results-heading"><p data-results-count aria-live="polite"></p><button type="button" class="campaign-back" hidden>${icon('arrow-left')} Back to plan</button><span class="campaign-selection-hint">Select up to 3 records to compare</span></div>
        <div class="campaign-layout"><aside class="campaign-records" aria-label="Campaign records"></aside><div class="campaign-focus" aria-live="polite"></div></div>
        <div class="campaign-comparison" hidden></div>
        <footer class="campaign-source-note"><span>${icon('file-text')} ${esc(db.name || 'Campaign database')} · ${records.length} of ${esc(db.totalCount ?? records.length)} records</span><span>Read-only snapshot · No campaign changes</span></footer>
      </section>`;
      function animateSurface(surface) {
        if (reducedMotion.matches || !surface || typeof surface.animate !== 'function') return;
        const animation = surface.animate([{ opacity: .5, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
        animations.add(animation); animation.onfinish = () => animations.delete(animation);
      }
      function renderList() {
        const visible = matching();
        if (!visible.some(record => sourceId(record) === selectedId)) selectedId = visible[0] ? sourceId(visible[0]) : null;
        $('[data-results-count]').textContent = `${visible.length} of ${records.length} records${query.trim() ? ' match your search' : ''}`;
        $('.campaign-clear').hidden = !query;
        $('.campaign-records').innerHTML = visible.length ? visible.map(record => {
          const id = sourceId(record), isNamed = present(field(record, 'campaign_name'));
          return `<article class="campaign-list-item snapshot-reveal ${id === selectedId ? 'is-selected' : ''}"><button type="button" class="campaign-record-button" data-select="${esc(id)}" aria-pressed="${id === selectedId}"><span class="campaign-list-top">${statusChip(record)}<span>${esc(date(record.updated_at || record.updatedAt))}</span></span><strong>${esc(title(record))}</strong><span class="campaign-list-meta">${isNamed ? esc(present(field(record, 'objective')) ? text(field(record, 'objective')) : 'Objective not set') : `Row ${esc(id.slice(0, 8))} · Name not set`}</span></button><label class="campaign-compare-check"><input type="checkbox" data-compare="${esc(id)}" ${selectedCompare.has(id) ? 'checked' : ''} aria-label="Compare ${esc(title(record))}, row ${esc(id.slice(0, 8))}"><span>Compare</span></label></article>`;
        }).join('') : '<div class="campaign-no-results"><strong>No matching records</strong><p>Try another search or clear the filters.</p><button type="button" class="button" data-reset-filters>Clear filters</button></div>';
        renderFocus();
      }
      function proseSection(record, key, label, options = {}) {
        const value = field(record, key);
        if (!present(value) && !options.always) return '';
        return `<section class="campaign-prose-section ${options.feature ? 'campaign-brief-section snapshot-reveal' : ''}"><h4>${label}</h4>${present(value) ? `<p>${esc(text(value))}</p>` : '<p class="campaign-empty-value">Not set in this row.</p>'}</section>`;
      }
      function renderFocus() {
        const record = records.find(row => sourceId(row) === selectedId);
        if (!record) { $('.campaign-focus').innerHTML = '<div class="campaign-focus-empty"><span>' + icon('file-search') + '</span><h3>No campaign selected</h3><p>A matching record will appear here when you adjust the filters.</p></div>'; return; }
        const f = record.fields || {}, url = safeUrl(f.asset_link);
        const outsideStatus = present(f.status) && declaredStatuses.length && !declaredStatuses.includes(f.status);
        $('.campaign-focus').innerHTML = `<article class="campaign-plan">
          <div class="campaign-plan-cover snapshot-reveal"><div class="campaign-plan-top">${statusChip(record)}<span>Updated ${esc(date(record.updated_at || record.updatedAt))}</span></div><h3>${esc(title(record))}</h3>${!present(f.campaign_name) ? `<p class="campaign-unnamed-note">Campaign name not set · Row ${esc(sourceId(record).slice(0, 8))}</p>` : ''}<div class="campaign-plan-goals"><div><span>Objective</span><strong>${esc(present(f.objective) ? text(f.objective) : 'Not set')}</strong></div><div><span>Business goal</span><strong>${esc(present(f.business_goal) ? text(f.business_goal) : 'Not set')}</strong></div></div></div>
          <div class="campaign-plan-body"><div class="campaign-plan-actions"><button type="button" class="button button-ghost" data-open-record="${esc(sourceId(record))}">${icon('table-properties')} View source record</button>${url ? `<a class="button button-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">View linked asset ${icon('external-link')}</a>` : ''}</div>
            ${outsideStatus ? `<p class="campaign-field-note">Stored status is <strong>${esc(text(f.status))}</strong>. It is outside the database’s declared status options; the original value is preserved.</p>` : ''}
            <div class="campaign-specs"><div><h4>Formats</h4><div class="campaign-chip-group">${chips(f.formats)}</div></div><div><h4>Placements</h4><div class="campaign-chip-group">${chips(f.placements)}</div></div></div>
            ${proseSection(record, 'content_briefs', 'Creative brief', { always: true, feature: true })}
            ${proseSection(record, 'targeting', 'Audience & targeting')}
            <section class="campaign-budget-section"><div><h4>Recorded budget</h4><strong>${present(f.budget_total) ? esc(number(f.budget_total)) : 'Not set'}</strong><p>Currency and budget period are not specified consistently, so values are shown separately.</p></div>${present(f.budget_split) ? `<h5 class="campaign-budget-breakdown-label">Budget breakdown</h5><blockquote>${esc(text(f.budget_split))}</blockquote>` : '<p class="campaign-empty-value">Budget breakdown not set.</p>'}</section>
            ${proseSection(record, 'campaign_structure', 'Campaign structure')}
            ${proseSection(record, 'learning_agenda', 'Learning agenda')}
            ${proseSection(record, 'measurement_plan', 'Measurement plan')}
            <details class="campaign-source-details"><summary>More context from this record ${icon('chevron-down')}</summary>${['icp_summary', 'bid_strategy', 'kill_scale_rules', 'learning_phase_target', 'historical_insights', 'risk_flags', 'forecast_scenarios', 'confidence_labels', 'notes'].map(key => proseSection(record, key, key.replace(/_/g, ' '))).join('') || '<p class="campaign-empty-value">No additional context recorded.</p>'}</details>
          </div></article>`;
      }
      function updateCompare() {
        $('[data-compare-count]').textContent = selectedCompare.size;
        $('.campaign-compare-button').disabled = selectedCompare.size < 2;
        if (compareMode) renderComparison();
      }
      function renderComparison() {
        const compared = records.filter(record => selectedCompare.has(sourceId(record)));
        if (compared.length < 2) { compareMode = false; showView(); return; }
        $('.campaign-comparison').innerHTML = `<div class="campaign-comparison-intro"><h3>The plans, side by side.</h3><p>Original values from ${compared.length} selected records. Currency and budget period are not specified consistently, so values are shown separately.</p></div><div class="campaign-compare-grid" style="--compare-columns:${compared.length}">${compared.map(record => `<article class="campaign-compare-card snapshot-reveal"><div class="campaign-compare-card-header">${statusChip(record)}<h4>${esc(title(record))}</h4><span>Row ${esc(sourceId(record).slice(0, 8))}</span></div><dl><div><dt>Objective</dt><dd>${esc(present(field(record, 'objective')) ? text(field(record, 'objective')) : 'Not set')}</dd></div><div><dt>Business goal</dt><dd>${esc(present(field(record, 'business_goal')) ? text(field(record, 'business_goal')) : 'Not set')}</dd></div><div><dt>Recorded budget</dt><dd class="campaign-compare-budget">${present(field(record, 'budget_total')) ? esc(number(field(record, 'budget_total'))) : 'Not set'}</dd></div><div><dt>Budget breakdown</dt><dd>${esc(present(field(record, 'budget_split')) ? text(field(record, 'budget_split')) : 'Not set')}</dd></div><div><dt>Formats</dt><dd class="campaign-chip-group">${chips(field(record, 'formats'))}</dd></div><div><dt>Placements</dt><dd class="campaign-chip-group">${chips(field(record, 'placements'))}</dd></div><div><dt>Creative brief</dt><dd>${esc(present(field(record, 'content_briefs')) ? text(field(record, 'content_briefs')) : 'Not set')}</dd></div><div><dt>Targeting</dt><dd>${esc(present(field(record, 'targeting')) ? text(field(record, 'targeting')) : 'Not set')}</dd></div></dl><button type="button" class="button button-ghost" data-open-record="${esc(sourceId(record))}">View source record ${icon('arrow-up-right')}</button></article>`).join('')}</div>`;
      }
      function showView() {
        $('.campaign-layout').hidden = compareMode;
        $('.campaign-comparison').hidden = !compareMode;
        $('.campaign-back').hidden = !compareMode;
        $('.campaign-selection-hint').hidden = compareMode;
        $('.campaign-compare-button').setAttribute('aria-pressed', String(compareMode));
        if (compareMode) { renderComparison(); api.status(`Comparing ${selectedCompare.size} source records · read only`); }
        else api.status(`${records.length} campaign records · read-only snapshot`);
      }
      function reset() {
        query = ''; statusFilter = ''; nameMissingOnly = false; compareMode = false; selectedCompare.clear();
        selectedId = records[0] ? sourceId(records[0]) : null;
        $('#campaign-search').value = ''; $('#campaign-status-filter').value = '';
        $('.campaign-missing-filter').setAttribute('aria-pressed', 'false');
        renderList(); updateCompare(); showView(); api.setPlaying?.(false);
      }
      listen($('#campaign-search'), 'input', event => { query = event.target.value; if (compareMode) { compareMode = false; showView(); } renderList(); });
      listen($('.campaign-clear'), 'click', () => { query = ''; $('#campaign-search').value = ''; renderList(); $('#campaign-search').focus(); });
      listen($('#campaign-status-filter'), 'change', event => { statusFilter = event.target.value; if (compareMode) { compareMode = false; showView(); } renderList(); });
      listen($('.campaign-missing-filter'), 'click', event => { nameMissingOnly = !nameMissingOnly; event.currentTarget.setAttribute('aria-pressed', String(nameMissingOnly)); if (compareMode) { compareMode = false; showView(); } renderList(); });
      listen($('.campaign-compare-button'), 'click', () => { compareMode = !compareMode; showView(); animateSurface(compareMode ? $('.campaign-comparison') : $('.campaign-focus')); });
      listen($('.campaign-back'), 'click', () => { compareMode = false; showView(); });
      listen(root, 'click', event => {
        const choose = event.target.closest('[data-select]');
        if (choose) { selectedId = choose.dataset.select; renderList(); animateSurface($('.campaign-focus')); const focus = root.querySelector(`[data-select="${selectedId}"]`); focus?.focus({ preventScroll: true }); api.status(`Selected ${title(records.find(record => sourceId(record) === selectedId))}`); }
        const open = event.target.closest('[data-open-record]');
        if (open) { const record = records.find(row => sourceId(row) === open.dataset.openRecord); if (record) api.openRecord(record, title(record)); }
        if (event.target.closest('[data-reset-filters]')) { reset(); $('#campaign-search').focus(); }
      });
      listen(root, 'change', event => {
        const input = event.target.closest('[data-compare]');
        if (!input) return;
        if (input.checked && selectedCompare.size >= 3) { input.checked = false; api.toast('Compare up to 3 records. Deselect one to add another.'); return; }
        if (input.checked) selectedCompare.add(input.dataset.compare); else selectedCompare.delete(input.dataset.compare);
        updateCompare();
      });
      renderList(); updateCompare(); showView();
      return {
        reset,
        play() { animateSurface(compareMode ? $('.campaign-comparison') : $('.campaign-focus')); api.setPlaying?.(false); api.status('Read-only snapshot · record values remain unchanged'); },
        pause() { animations.forEach(animation => animation.cancel()); animations.clear(); api.setPlaying?.(false); },
        destroy() { events.abort(); animations.forEach(animation => animation.cancel()); animations.clear(); api.setPlaying?.(false); }
      };
    }
  };
})();
