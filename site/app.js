import {localResponse} from './backend.mjs';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let current = null, sources = [], status = null, timer, demoMode=false;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('#toast').hidden = true, 6500); }
async function api(path, method = 'GET', data) {
  const response = await localResponse(path,method,data);
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '請求失敗'); return result;
}
async function action(button, fn) {
  const old = button.textContent; button.disabled = true; button.textContent = '處理中…';
  try { await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; button.textContent = old; }
}
function page(id) {
  for (const el of document.querySelectorAll('.page')) el.hidden = el.id !== id;
  for (const el of document.querySelectorAll('.nav')) el.classList.toggle('active', el.dataset.page === id);
  $('#breadcrumb').textContent = `工作空間 / ${{workspace:'開始查核',sources:'來源與更新',history:'查核紀錄',guide:'使用指南'}[id]}`;
  if (id === 'sources') loadSources().catch(e => toast(e.message));
  if (id === 'history') loadHistory().catch(e => toast(e.message));
}
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => page(b.dataset.page)));
$('.brand').addEventListener('click', () => page('workspace'));
document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => { $('#message').value = b.dataset.demo; demoMode=true;$('#online').checked=false;$('#message').focus();toast('已切換離線虛構展示；一般查核不使用這些資料。'); }));
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {$('#message').value=b.dataset.example;demoMode=false;$('#online').checked=true;$('#message').focus();}));
$('#message').addEventListener('input',()=>{demoMode=false;});
async function refresh() { [status,sources] = await Promise.all([api('/api/status'),api('/api/sources')]); $('#source-count').textContent = status.automatic_sources; $('#case-count').textContent = status.cases; $('#model-status').textContent = status.ai.message;$('#sync-status').textContent=`已保存 ${status.automatic_sources} 則公開摘要${status.feed_updated_at?'；資料更新 '+new Date(status.feed_updated_at).toLocaleString('zh-TW'):''}`;$('#provider-status').textContent=`自動來源：${status.automatic_sources} 筆；查核時會再次依關鍵詞搜尋。`; }
async function synchronize(button) {const r=await api('/api/sync','POST',{});await refresh();if(!$('#sources').hidden)await loadSources();const message=r.errors.length ? `公開來源更新失敗：${r.errors.join('；')}。仍可使用本機快取。` : `已自動取得公開報告：新增 ${r.added} 筆、更新 ${r.updated} 筆。`;$('#sync-status').textContent=r.errors.length?'來源連線失敗，使用快取':`已保存 ${status.automatic_sources} 則公開報告摘要`;$('#provider-status').textContent=message+' '+(r.scope||'');return message;}
$('#sync-sources').addEventListener('click',e=>action(e.currentTarget,async()=>toast(await synchronize())));
$('#seed').addEventListener('click', e => action(e.currentTarget, async () => { const result = await api('/api/demo','POST',{}); toast(`新增 ${result.added} 筆虛構展示來源`); await refresh(); }));
$('#analyze-form').addEventListener('submit', e => { e.preventDefault(); action($('#analyze'), async () => {
  const ai = $('#mode').value === 'ai';
  if (ai && !status?.ai.ready) throw new Error('本機 AI 尚未就緒，請先完成 Ollama 設定，或選規則輔助模式。');
  current = await api('/api/cases','POST',{text:$('#message').value,cutoff:$('#cutoff').value,ai,online:$('#online').checked,include_demo:demoMode}); await refresh();renderCase(); $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}); });
function option(values, selected) { return values.map(x => `<option${x === selected ? ' selected' : ''}>${esc(x)}</option>`).join(''); }
function evidenceHTML(e, cl) {
  return `<article class="evidence"><h4>${esc(e.title)} ${e.demo ? '<span class="badge amber">虛構展示</span>' : ''}${e.automatic ? '<span class="badge">平台自動取得</span>' : ''}</h4><div class="meta">${e.provider_name?esc(e.provider_name)+' · ':''}發布 ${esc(e.published || '未知')} · 取得 ${esc(e.retrieved.slice(0,10))} · ${esc(e.language)} · 搜尋分數 ${e.score}<br><a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.url)} ↗</a>${e.content_kind?'<br>'+esc(e.content_kind)+'；摘要可能重述傳言，請開原文核對結論。':''}</div><blockquote>${esc(e.quote)}</blockquote>
  ${e.ai_suggestion ? `<div class="suggestion"><b>AI 建議・待覆核：${esc(e.ai_suggestion.relation)}</b><p>${esc(e.ai_suggestion.quote)}</p><p>${esc(e.ai_suggestion.note)}</p><button class="quiet use-suggestion" data-claim="${cl.id}" data-evidence="${e.id}">填入建議供人工確認</button></div>` : ''}
  <details><summary>閱讀完整收錄原文與使用依據</summary><p>${esc(e.content)}</p><p>使用依據：${esc(e.license)}</p></details>
  <form class="evidence-form" data-claim="${cl.id}" data-evidence="${e.id}"><label>證據關係 <select name="relation">${option(['待確認','支持','反駁','無關'],e.relation)}</select></label><label>逐字引文（至少 4 字）<textarea name="quote" maxlength="800" required rows="2">${esc(e.quote)}</textarea></label><label>核對註記<input name="note" maxlength="1000" value="${esc(e.note)}"></label><div class="actions"><button class="secondary" type="submit">${e.reviewed ? '更新證據註記' : '儲存人工確認'}</button><span class="badge">${e.reviewed ? '已人工確認' : '候選證據・未確認'}</span></div></form></article>`;
}
function renderCase() {
  const c = current;
  $('#results').innerHTML = `<div class="result-top"><h2>查核工作區 <span class="badge">${c.claims.length} 個主張</span></h2><div class="actions"><a class="secondary" href="/api/cases/${c.id}/report?format=md">下載 Markdown</a><a class="secondary" href="/api/cases/${c.id}/report">下載 JSON</a></div></div><p class="meta">${esc(c.mode)} · ${esc(new Date(c.created).toLocaleString('zh-TW'))} · 證據截止 ${esc(c.cutoff || '未限制')}</p>${c.warning ? `<p class="notice">${esc(c.warning)}</p>` : ''}
  ${c.collection?`<div class="collection"><b>平台已自動搜尋公開來源</b><br>${esc(c.collection.provider)} · 找到 ${c.collection.found} 份報告 · 新增 ${c.collection.added} 筆 · 更新 ${c.collection.updated} 筆<br>搜尋關鍵詞：${esc(c.collection.queries.join('／') || '未取得有效關鍵詞')}<br>${esc(c.collection.scope)}${c.collection.errors.length?`<ul>${c.collection.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`:'<p class="meta">本次未連線搜尋，使用本機已保存來源。</p>'}
  ${c.checklist?`<section class="five-checks" aria-label="五大查核要素"><h2>先看這五件事</h2><p class="meta">${esc(c.checklist.method)}</p><div class="check-grid">${c.checklist.items.map((item,i)=>`<article class="check-card"><span class="step">0${i+1}</span><h3>${esc(item.title)}</h3><span class="badge ${item.key==='sharing'?'amber':''}">${esc(item.status)}</span><ul>${item.details.map(d=>`<li>${esc(d)}</li>`).join('')}</ul></article>`).join('')}</div></section>`:''}
  ${c.claims.map((cl,i) => `<article class="panel"><div class="claim-title"><span class="step">${String(i+1).padStart(2,'0')}</span><h3>${esc(cl.text)}</h3><span class="badge${!cl.reviewed ? ' amber' : ''}">${esc(cl.verdict)} · ${cl.reviewed ? '人工覆核' : '待覆核'}</span></div><p class="anchor">輸入原文：${esc(cl.anchor)}</p><div class="actions"><button class="quiet edit-claim" data-claim="${cl.id}">編輯主張</button><button class="quiet suggest" data-claim="${cl.id}">請本機 AI 比對證據</button></div><form class="edit-form" data-claim="${cl.id}" hidden><label>修改主張後會重新搜尋，並重設此主張的覆核紀錄<textarea name="text" required maxlength="2000">${esc(cl.text)}</textarea></label><button class="secondary" type="submit">儲存並重新搜尋</button></form>
  ${cl.evidence.length ? cl.evidence.map(e => evidenceHTML(e,cl)).join('') : '<p class="empty">目前搜尋範圍找不到相關候選證據。可以縮短訊息、換個說法重新查詢，或稍後再試；找不到資料不代表主張為假。</p>'}
  <details><summary>進階：補入其他已保存來源</summary><form class="attach-form" data-claim="${cl.id}"><label>從資料庫選擇來源<select name="source_id" required><option value="">請選擇來源</option>${sources.filter(s=>(c.include_demo||!s.demo)&&!cl.evidence.some(e=>e.id===s.id)&&(!c.cutoff||(s.published&&s.published<=c.cutoff))).map(s=>`<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></label><button class="secondary" type="submit">加入候選證據</button></form><p class="meta">可補入跨語言或用詞不同的來源；加入後需要重新確認結論。</p></details>
  <form class="review" data-claim="${cl.id}"><h3>完成這個主張的覆核</h3><div class="form-row"><label>查核結論<select name="verdict">${option(['證據不足','支持','反駁','證據衝突'],cl.verdict)}</select></label><label>覆核人（姓名或研究代號）<input name="reviewer" required maxlength="100" value="${esc(cl.reviewer || '')}"></label></div><label>結論理由<textarea name="reason" required maxlength="3000" rows="2" placeholder="說明日期、對象、數字或語意是否相符，以及哪些證據支持此判斷。">${esc(cl.reason)}</textarea></label><button class="primary" type="submit">儲存覆核結論</button></form></article>`).join('')}
  <article class="panel"><h2>來源關聯與時間脈絡</h2><p class="muted small">${esc(c.graph.caveat)}</p><p class="meta">${c.graph.nodes.length} 個來源 · ${c.graph.groups} 個相依／相似群 · 實線表示明確引用，虛線表示內容相似或相同</p><div id="graph-view"></div><h3>目前收錄來源的發布時間</h3>${[...c.graph.nodes].sort((a,b) => (a.published || '9999').localeCompare(b.published || '9999')).map(n => `<div class="timeline"><span>${esc(n.published || '日期未知')}</span><span>${esc(n.title)} ${c.graph.earliest.includes(n.id) ? '<span class="badge">收錄資料中最早</span>' : ''}</span></div>`).join('') || '<p class="empty">尚無來源可顯示。</p>'}</article><article class="panel"><h2>修改歷程</h2><div id="audit" class="audit">載入中…</div></article>`;
  renderGraph(c.graph);
  api(`/api/cases/${c.id}/audit`).then(items => { if (current.id === c.id) $('#audit').innerHTML = items.map(x => `<div>${esc(new Date(x.created).toLocaleString('zh-TW'))} · ${esc(x.action)}</div>`).join(''); }).catch(e => toast(e.message));
}
function renderGraph(g) {
  if (!g.nodes.length) { $('#graph-view').innerHTML = '<p class="empty">匯入相關證據後，來源圖會出現在這裡。</p>'; return; }
  const positions = new Map(g.nodes.map((n,i) => {const a = i/g.nodes.length*Math.PI*2;return [n.id,{x:350+Math.cos(a)*230,y:165+Math.sin(a)*115}];}));
  const lines = g.edges.map(e => {const a=positions.get(e.from),b=positions.get(e.to);return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${e.type === '明確引用' ? '' : 'similar'}"${e.type === '明確引用' ? ' marker-end="url(#arrow)"' : ''}><title>${esc(e.type)}</title></line>`;}).join('');
  const nodes = g.nodes.map((n,i) => {const p=positions.get(n.id);return `<a href="${esc(n.url)}" target="_blank" rel="noreferrer"><circle cx="${p.x}" cy="${p.y}" r="27"><title>${esc(n.title)}</title></circle><text x="${p.x}" y="${p.y+4}" text-anchor="middle">${i+1}</text><text x="${p.x}" y="${p.y+45}" text-anchor="middle">${esc(n.title.slice(0,20))}</text></a>`;}).join('');
  $('#graph-view').innerHTML = `<div class="graph-scroll"><svg class="graph" viewBox="0 0 700 340" role="img" aria-label="來源關聯圖"><defs><marker id="arrow" viewBox="0 0 10 10" refX="35" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#9baea5"/></marker></defs>${lines}${nodes}</svg></div>`;
}
$('#results').addEventListener('click',async e=>{
  const link=e.target.closest('a[href^="/api/"]');if(link){e.preventDefault();try{const response=await localResponse(link.getAttribute('href'));if(!response.ok)throw new Error((await response.json()).error);const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tracefact-'+current.id+(link.href.includes('format=md')?'.md':'.json');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){toast(err.message);}return;}
});
$('#results').addEventListener('click', e => {
  const b=e.target.closest('button'); if(!b)return;
  if(b.classList.contains('edit-claim')) { const f=$(`.edit-form[data-claim="${b.dataset.claim}"]`);f.hidden=!f.hidden; }
  if(b.classList.contains('suggest')) action(b,async()=>{current=await api(`/api/cases/${current.id}/suggest`,'POST',{claim_id:b.dataset.claim});renderCase();toast('AI 建議已產生，請逐項核對，尚未改變結論。');});
  if(b.classList.contains('use-suggestion')) {const cl=current.claims.find(c=>c.id===b.dataset.claim),ev=cl.evidence.find(x=>x.id===b.dataset.evidence),f=$(`.evidence-form[data-claim="${cl.id}"][data-evidence="${ev.id}"]`);f.elements.relation.value=ev.ai_suggestion.relation;f.elements.quote.value=ev.ai_suggestion.quote;f.elements.note.value=ev.ai_suggestion.note;toast('已填入建議，請核對後按儲存人工確認。');}
});
$('#results').addEventListener('submit', e => {
  e.preventDefault();const f=e.target,data=Object.fromEntries(new FormData(f));data.claim_id=f.dataset.claim;if(f.dataset.evidence)data.evidence_id=f.dataset.evidence;
  action(f.querySelector('button[type=submit]'),async()=>{current=await api(`/api/cases/${current.id}`,'PATCH',data);renderCase();toast('已儲存，並保留修改歷程。');});
});
$('#source-form').addEventListener('submit',e=>{e.preventDefault();action(e.target.querySelector('button[type=submit]'),async()=>{
  const result=await api('/api/sources','POST',{title:$('#source-title').value,url:$('#source-url').value,published:$('#source-date').value,language:$('#source-language').value,content:$('#source-content').value,license:$('#source-license').value || undefined,cites:$('#source-cites').value.split('\n').map(s=>s.trim()).filter(Boolean)});
  toast(result.added ? '來源已儲存' : '相同網址已存在，未重複匯入');e.target.reset();await loadSources();await refresh();
});});
$('#import').addEventListener('click',e=>action(e.currentTarget,async()=>{const file=$('#import-file').files[0];if(!file)throw new Error('請先選擇 JSON 檔案');if(file.size>2_000_000)throw new Error('檔案不可超過 2 MB');let input;try{input=JSON.parse(await file.text());}catch{throw new Error('JSON 檔案格式錯誤');}const r=await api('/api/sources','POST',input);toast(`新增 ${r.added} 筆來源`);await loadSources();await refresh();}));
$('#export-sources').addEventListener('click',async()=>{try{const list=await api('/api/sources');const blob=new Blob([JSON.stringify(list,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='tracefact-sources.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch(e){toast(e.message);}});
async function loadSources(){sources=await api('/api/sources');renderSources();}
function renderSources(){const q=$('#source-search').value.toLowerCase(),list=sources.filter(s=>(s.title+s.url+s.content).toLowerCase().includes(q));$('#source-list').innerHTML=list.map(s=>`<article class="log-card source-card"><h3>${esc(s.title)} ${s.demo?'<span class="badge amber">虛構展示</span>':''}${s.automatic?'<span class="badge">平台自動取得</span>':''}</h3><div class="meta">${esc(s.provider_name||'手動補充')} · ${esc(s.published||'日期未知')} · ${esc(s.language)} · <a href="${esc(s.url)}" target="_blank" rel="noreferrer">原始網址 ↗</a></div><p class="small">${esc(s.content.slice(0,220))}${s.content.length>220?'…':''}</p><p class="meta">使用依據：${esc(s.license)}</p></article>`).join('')||'<p class="empty">尚無符合的快取來源。平台會在查核時自動搜尋；也可按上方「更新公開查核資料」。</p>';}
$('#source-search').addEventListener('input',renderSources);
async function loadHistory(){const items=await api('/api/cases');$('#history-list').innerHTML=items.map(c=>`<article class="log-card"><h3>${esc(c.title)}</h3><div class="meta">${esc(new Date(c.created).toLocaleString('zh-TW'))}</div><button class="secondary open-case" data-id="${c.id}">開啟查核紀錄 →</button></article>`).join('')||'<p class="empty">尚未建立查核紀錄。從一則訊息開始。</p>';}
$('#history-list').addEventListener('click',e=>{const b=e.target.closest('.open-case');if(b)action(b,async()=>{current=await api(`/api/cases/${b.dataset.id}`);page('workspace');$('#message').value=current.input;$('#cutoff').value=current.cutoff;renderCase();$('#results').scrollIntoView({behavior:'smooth'});});});
refresh().then(()=>synchronize()).catch(e=>{toast(e.message);$('#sync-status').textContent='目前無法更新來源，仍可使用本機快取。';});
