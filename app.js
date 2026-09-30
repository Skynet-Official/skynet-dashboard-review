(() => {
  'use strict';
  const snapshot = window.SkynetSnapshot;
  const catalog = {
    production: {title:'Content board',fields:['title','status','format','platforms','hook','idea_tier'],summary:'An editorial board of real content ideas, grouped by the status stored in Skynet.',prompt:'Create a content board from Skynet Content Ideas, grouped by status, with formats and platforms.'},
    campaign: {title:'Campaign planner',fields:['campaign_name','status','objective','budget_total','placements','content_briefs'],summary:'A planning workspace for campaign briefs, objectives, placements and recorded budgets.',prompt:'Create a campaign dashboard from db_ads_campaign_db with campaign briefs, objectives, placements and budgets.'},
    newsletter: {title:'Newsletter ideas',fields:['idea','type','approval_status','core_angle','key_points','cta'],summary:'An editorial reading workspace for newsletter ideas, their angles and recorded approval status.',prompt:'Create a newsletter workspace from Newsletter_ideas with idea types, approval status and a detailed brief.'}
  };
  const $ = q => document.querySelector(q);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value) : 'Not set';
  const date = value => {if(!value)return 'Not set';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(d);};
  function icon(name){const pascal=name.replace(/(^|-)([a-z])/g,(_,a,b)=>b.toUpperCase());const node=window.lucide?.icons?.[pascal]||window.lucide?.icons?.Sparkles;if(!node)return '';function serialize(n){const[tag,attrs,children=[]]=n;return `<${tag} ${Object.entries(attrs||{}).map(([k,v])=>`${k}="${escape(v)}"`).join(' ')}>${children.map(serialize).join('')}</${tag}>`;}return serialize([node[0],{...node[1],class:'icon','aria-hidden':'true',width:18,height:18,'stroke-width':1.65},node[2]]);}
  function fillIcons(scope=document){scope.querySelectorAll('[data-icon]').forEach(el=>{el.outerHTML=icon(el.dataset.icon);});}
  fillIcons();
  let current='production',active=null,toastTimer=null,lastFocus=null,revealAnimations=[];
  let shortlist=[];
  try{shortlist=JSON.parse(localStorage.getItem('skynet-template-review-shortlist')||'[]').filter(id=>catalog[id]);}catch{}
  const dialog=$('#studio-dialog');
  function toast(message){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('is-visible');toastTimer=setTimeout(()=>$('#toast').classList.remove('is-visible'),3200);}
  function status(message){$('#demo-status').textContent=message;}
  function openDetails({title,html}){lastFocus=document.activeElement;$('#dialog-title').textContent=title;$('#dialog-content').innerHTML=html;fillIcons(dialog);if(!dialog.open)dialog.showModal();}
  function closeDialog(){dialog.close();}
  $('#close-dialog').addEventListener('click',closeDialog);
  dialog.addEventListener('close',()=>{if(lastFocus?.isConnected)lastFocus.focus();});
  dialog.addEventListener('click',event=>{const b=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom))closeDialog();});
  function fieldHtml(value,column={}){
    if(value===undefined||value===null||value==='')return '<span class="field-empty">Not set</span>';
    if(Array.isArray(value))return value.length?`<div class="field-chips">${value.map(x=>`<span>${escape(typeof x==='object'?JSON.stringify(x):x)}</span>`).join('')}</div>`:'<span class="field-empty">Not set</span>';
    if(typeof value==='boolean')return value?'Yes':'No';
    if(typeof value==='number')return escape(number(value));
    if(typeof value==='object')return `<div class="record-text">${escape(JSON.stringify(value,null,2))}</div>`;
    if(column.type==='url'){try{const u=new URL(value);if(['https:','http:'].includes(u.protocol))return `<a href="${escape(u.href)}" target="_blank" rel="noopener noreferrer">${escape(value)} ${icon('arrow-up-right')}</a>`;}catch{}}
    if(column.type==='date')return escape(date(value));
    return `<div class="record-text">${escape(value)}</div>`;
  }
  function openRecord(record,title){const db=snapshot.databases[current];const byKey=new Map(db.columns.map(c=>[c.key,c]));const entries=[...db.columns.map(c=>[c,record.fields[c.key]]),...Object.entries(record.fields).filter(([key])=>!byKey.has(key)).map(([key,v])=>[{key,name:key,type:'text'},v])];openDetails({title:title||'Record details',html:`<p class="dialog-description">${escape(db.name)} · Updated ${escape(date(record.updated_at))}</p><dl class="record-fields">${entries.map(([column,value])=>`<div><dt>${escape(column.name)}</dt><dd>${fieldHtml(value,column)}</dd></div>`).join('')}</dl><details class="record-source"><summary>Source record</summary><p>${escape(record.row_id)}</p><p>Production export · ${escape(date(snapshot.capturedAt))}</p></details>`});}
  function updateShortlist(){const saved=shortlist.includes(current);$('#shortlist-count').textContent=shortlist.length;$('#shortlist-toggle').setAttribute('aria-pressed',String(saved));$('#shortlist-toggle').innerHTML=icon(saved?'bookmark-check':'bookmark')+`<span>${saved?'Shortlisted':'Shortlist'}</span>`;try{localStorage.setItem('skynet-template-review-shortlist',JSON.stringify(shortlist));}catch{}}
  function toggleShortlist(id=current){const had=shortlist.includes(id);shortlist=had?shortlist.filter(x=>x!==id):[...shortlist,id];updateShortlist();toast(`${catalog[id].title} ${had?'removed from':'added to'} your shortlist.`);}
  function replay(){revealAnimations.forEach(a=>a.cancel());revealAnimations=[];if(matchMedia('(prefers-reduced-motion: reduce)').matches){toast('Reduced motion is on. The layout is shown without animation.');return;}const stage=$('#template-stage');const items=[...stage.querySelectorAll('.snapshot-reveal')];const targets=items.length?items.slice(0,12):[stage];revealAnimations=targets.map((el,i)=>el.animate([{opacity:.45,clipPath:'inset(0 0 8% 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}],{duration:450,delay:i*30,easing:'cubic-bezier(.16,1,.3,1)'}));}
  function select(id,changeHash=true){
    if(!catalog[id])id='production';active?.destroy?.();revealAnimations.forEach(a=>a.cancel());current=id;
    document.querySelectorAll('[data-template]').forEach(b=>{const selected=b.dataset.template===id;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected));});
    const db=snapshot?.databases?.[id];$('#template-name').textContent=catalog[id].title;$('#template-stage').innerHTML='';
    if(!db){status('Production export unavailable.');$('#template-stage').innerHTML='<p>The exported data could not be loaded. Reopen the complete review folder.</p>';active=null;return;}
    $('#database-summary').textContent=db.name;$('#snapshot-context').innerHTML=`${icon('database')}<span><strong>${escape(db.name)}</strong><span>${db.isComplete?`All ${db.loadedCount} records`:`Latest ${db.loadedCount} of ${db.totalCount} records`} · Exported 30 Sep 2026, 12:34 IST</span></span><span class="snapshot-readonly">${icon('lock-keyhole')} Read-only snapshot</span>`;
    status(db.isComplete?'All records from this database are included in the export.':'This export contains the latest 20 records. Counts and distributions describe these records only.');
    const module=window.SkynetTemplates?.[id];active=module?module.mount($('#template-stage'),{data:db,escape,number,date,icon,toast,status,openDetails,openRecord,fieldHtml,replay}):null;
    updateShortlist();if(changeHash)history.replaceState(null,'',`#${id}`);document.title=`${catalog[id].title} · Skynet dashboards`;
  }
  $('#template-picker').addEventListener('click',e=>{const b=e.target.closest('[data-template]');if(b)select(b.dataset.template);});
  window.addEventListener('hashchange',()=>select(location.hash.slice(1),false));
  $('#replay-animation').addEventListener('click',replay);
  $('#reset-view').addEventListener('click',()=>{active?.reset?.();toast('View reset. Source records are unchanged.');});
  $('#shortlist-toggle').addEventListener('click',()=>toggleShortlist());
  $('#review-button').addEventListener('click',()=>{openDetails({title:'Your review shortlist',html:`<p class="dialog-description">Layout preferences saved in this browser. Share your choices with the team when you’re ready.</p>${shortlist.length?shortlist.map(id=>`<div class="review-item"><div><strong>${catalog[id].title}</strong><span>${escape(snapshot.databases[id].name)}</span></div><button class="button button-light" data-review-open="${id}">Open ${icon('arrow-up-right')}</button></div>`).join(''):'<div class="empty-review">No layouts shortlisted yet. Use “Shortlist” on a dashboard to keep it here.</div>'}`});dialog.querySelectorAll('[data-review-open]').forEach(b=>b.addEventListener('click',()=>{closeDialog();select(b.dataset.reviewOpen);}));});
  function openChat(){
    openDetails({title:'Describe your dashboard',html:`<p class="dialog-description">Try matching a request to one of these three layouts using the exported Skynet Labs databases.</p><form id="chat-form" novalidate><label for="chat-prompt" class="chat-input-label">What would you like to see?</label><textarea class="chat-input" id="chat-prompt" aria-describedby="chat-error" placeholder="Show our content ideas grouped by status…"></textarea><p class="inline-error" id="chat-error" role="alert"></p><div class="chat-examples">${Object.entries(catalog).map(([id,item])=>`<button type="button" class="button button-light" data-example="${id}">${item.title}</button>`).join('')}</div><div class="dialog-actions"><button type="button" class="button" id="chat-cancel">Cancel</button><button type="submit" class="button button-primary">Preview layout ${icon('arrow-right')}</button></div><p class="dialog-footnote">Local matching demonstration · No AI request or live database connection</p></form>`});
    $('#chat-cancel').addEventListener('click',closeDialog);
    dialog.querySelectorAll('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('#chat-prompt').value=catalog[b.dataset.example].prompt;$('#chat-prompt').focus();$('#chat-error').textContent='';$('#chat-prompt').removeAttribute('aria-invalid');}));
    $('#chat-form').addEventListener('submit',e=>{e.preventDefault();const value=$('#chat-prompt').value.trim();const patterns={production:/production|content|board|draft|editorial|platforms/gi,campaign:/campaign|ads?\b|budget|objective|placement|briefs/gi,newsletter:/newsletter|email|edition|approval|core.angle/gi};const ranked=Object.entries(patterns).map(([id,re])=>[id,(value.match(re)||[]).length]).sort((a,b)=>b[1]-a[1]);if(!value||!ranked[0][1]){$('#chat-error').textContent='Describe a content board, campaign planner or newsletter workspace to preview a match.';$('#chat-prompt').setAttribute('aria-invalid','true');$('#chat-prompt').focus();return;}closeDialog();select(ranked[0][0]);toast(`Showing ${catalog[current].title} with the exported records.`);});
  }
  $('#chat-button').addEventListener('click',openChat);
  $('#use-template').addEventListener('click',()=>{const c=catalog[current],db=snapshot.databases[current];openDetails({title:'Data & fields',html:`<p class="dialog-description">${c.summary}</p><dl class="record-fields"><div><dt>Source</dt><dd>${escape(db.name)}</dd></div><div><dt>Included records</dt><dd>${db.loadedCount} of ${db.totalCount}${db.isComplete?' · Complete export':' · Latest records only'}</dd></div><div><dt>Exported</dt><dd>30 September 2026 at 12:34 IST</dd></div><div><dt>Main fields</dt><dd><div class="field-chips">${c.fields.map(key=>`<span>${escape(db.columns.find(x=>x.key===key)?.name||key)}</span>`).join('')}</div></dd></div></dl><p class="dialog-footnote">Source: SQL results supplied for this review. Missing values remain “Not set”. Filters and selection stay in this browser; source records are not modified. Chat matching is a local prototype.</p>`});});
  select(location.hash.slice(1)||'production',false);
})();
