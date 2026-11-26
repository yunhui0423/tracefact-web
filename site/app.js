import {localResponse,sourcePassage,validEvidenceQuote,setSemanticRetriever} from './backend.mjs?v=8';
import {semanticSearch,resetSemantic} from './semantic-client.mjs';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let current = null, sources = [], status = null, timer, demoMode=false;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('#toast').hidden = true, 6500); }
async function api(path, method = 'GET', data) {
  const response = await localResponse(path,method,data);
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '請求失敗'); return result;
}
async function action(button, fn) {
  const old = [...button.childNodes].map(n=>n.cloneNode(true)); button.disabled = true; button.textContent = '處理中…';
  try { await fn(); } catch (e) { toast(e.message); } finally { button.disabled = false; button.replaceChildren(...old); }
}
function page(id) {
  for (const el of document.querySelectorAll('.page')) el.hidden = el.id !== id;
  for (const el of document.querySelectorAll('.nav')) el.classList.toggle('active', el.dataset.page === id);
  $('#breadcrumb').textContent = `工作空間 / ${{workspace:'開始查核',sources:'來源與更新',history:'查核紀錄',guide:'使用指南',quality:'測試與能力邊界'}[id]}`;
  if (id === 'sources') loadSources().catch(e => toast(e.message));
  if (id === 'history') loadHistory().catch(e => toast(e.message));
  if (id === 'quality') loadQuality().catch(e=>toast(e.message));
}
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => page(b.dataset.page)));
$('.brand').addEventListener('click', () => page('workspace'));
document.querySelectorAll('[data-demo]').forEach(b => b.addEventListener('click', () => { $('#subject').value='';$('#message').value = b.dataset.demo; demoMode=true;$('#online').checked=false;$('#message').focus();toast('已切換離線虛構展示；一般查核不使用這些資料。'); }));
document.querySelectorAll('[data-example]').forEach(b => b.addEventListener('click', () => {$('#subject').value='';$('#message').value=b.dataset.example;demoMode=false;$('#online').checked=true;$('#message').focus();}));
$('#message').addEventListener('input',()=>{demoMode=false;});
$('#semantic').addEventListener('change',()=>{if(!$('#semantic').checked){resetSemantic();$('#semantic-status').textContent='使用關鍵詞模式；可勾選載入裝置端語意模型，首次下載約170 MB。';}});
$('#cancel-semantic').addEventListener('click',()=>{resetSemantic();$('#semantic-status').textContent='已停止語意比對；取消勾選可使用關鍵詞模式。';});
async function refresh() { [status,sources] = await Promise.all([api('/api/status'),api('/api/sources')]); $('#source-count').textContent = status.automatic_sources; $('#case-count').textContent = status.cases; $('#model-status').textContent = status.ai.message;$('#sync-status').textContent=`已保存 ${status.automatic_sources} 則公開資料${status.feed_updated_at?'；資料更新 '+new Date(status.feed_updated_at).toLocaleString('zh-TW'):''}`;$('#provider-status').textContent=`自動資料 ${status.automatic_sources} 筆。台灣事實查核中心、衛福部與行政院彙整管道；角色不同，不代表三個獨立查核。`; }
async function synchronize(button) {const r=await api('/api/sync','POST',{});await refresh();if(!$('#sources').hidden)await loadSources();const message=r.errors.length ? `公開來源更新失敗：${r.errors.join('；')}。仍可使用本機快取。` : `已自動取得公開報告：新增 ${r.added} 筆、更新 ${r.updated} 筆。`;$('#sync-status').textContent=r.errors.length?'來源連線失敗，使用快取':(r.snapshot_at?`摘要更新 ${new Date(r.snapshot_at).toLocaleString('zh-TW')}`:'已連線公開報告搜尋');$('#provider-status').textContent=message+' '+(r.scope||'');return message;}
$('#sync-sources').addEventListener('click',e=>action(e.currentTarget,async()=>toast(await synchronize())));
$('#seed').addEventListener('click', e => action(e.currentTarget, async () => { const result = await api('/api/demo','POST',{}); toast(`新增 ${result.added} 筆虛構展示來源`); await refresh(); }));
$('#analyze-form').addEventListener('submit', e => { e.preventDefault(); action($('#analyze'), async () => {
  const ai = $('#mode').value === 'ai';
  if (ai && !status?.ai.ready) throw new Error('本機 AI 尚未就緒，請先完成 Ollama 設定，或選規則輔助模式。');
  const useSemantic=$('#semantic').checked;$('#cancel-semantic').hidden=!useSemantic;
  if(useSemantic){$('#semantic-status').textContent='正在準備 AI 語意模型，首次下載約 170 MB，請稍候…';setSemanticRetriever(async(query,pool,cutoff)=>{try{const found=await semanticSearch(query,pool,cutoff,n=>$('#semantic-status').textContent='模型下載 '+n+'%');$('#semantic-status').textContent='已完成裝置端語意比對；相似不等於支持或反駁。';return found;}catch(e){$('#semantic-status').textContent='語意模式未完成：'+e.message+'；可取消勾選改用關鍵詞模式。';throw e;}});}
  try{current = await api('/api/cases','POST',{text:$('#message').value,subject:$('#subject').value,cutoff:$('#cutoff').value,ai,semantic:useSemantic,online:$('#online').checked,include_demo:demoMode}); if(useSemantic&&!current.semantic_executed)$('#semantic-status').textContent='這句話缺少明確對象，尚未載入或執行語意模型。';await refresh();renderCase(); $('#results').scrollIntoView({behavior:'smooth',block:'start'});}finally{$('#cancel-semantic').hidden=true;}
}); });
function option(values, selected) { return values.map(x => `<option${x === selected ? ' selected' : ''}>${esc(x)}</option>`).join(''); }
function evidenceHTML(e, cl) {
  const passage=sourcePassage(e),quote=validEvidenceQuote(e)?e.quote:'';
  const needsReview=e.reviewed&&!quote;
  const passageForm=`<details class="evidence-review"><summary>從原文補充必要段落 <span>＋</span></summary><form class="passage-form" data-claim="${cl.id}" data-evidence="${e.id}"><p class="meta">先開啟上方原始報告，再貼上與主張有關的必要段落。這是你的研究紀錄，平台不會宣稱已自動核實。</p><label>原文段落<textarea name="passage" required minlength="20" maxlength="8000" rows="5"></textarea></label><label class="check-line"><input type="checkbox" name="confirmed" value="true" required> 我已開啟原文並核對這段文字</label><button class="secondary wide" type="submit">保存段落並重新覆核</button></form></details>`;

  return `<article class="evidence"><h4>${esc(e.title)} ${e.demo ? '<span class="badge amber">虛構展示</span>' : ''}${e.source_kind==='official_statement'?'<span class="badge amber">官方說明</span>':e.automatic?'<span class="badge">獨立查核報告</span>':'<span class="badge">手動補充</span>'}${e.retrieval_method==='semantic'?'<span class="badge">AI 語意候選</span>':''}</h4><div class="meta">${e.provider_name?esc(e.provider_name)+' · ':''}發布 ${esc(e.published || '未知')} · 取得 ${esc(e.retrieved.slice(0,10))} · ${esc(e.language)}${e.matched_terms?.length?' · 比對詞：'+esc(e.matched_terms.join('、')):''}<br><a href="${esc(e.url)}" target="_blank" rel="noreferrer">${esc(e.url)} ↗</a>${e.content_kind?'<br>'+esc(e.content_kind)+'；摘要可能重述傳言，請開原文核對結論。':''}</div>${quote?'<blockquote>'+esc(quote)+'</blockquote>':'<p class="notice">'+(passage?'目前沒有有效內文引文，請選取摘要段落再覆核。':'目前只有報告標題，無可引用內文。請先開原文並補充必要段落。')+'</p>'}${needsReview?'<p class="notice">舊引文未通過內文檢查，請重新核對。</p>':''}${e.manual_excerpt?'<p class="notice">此段落由使用者手動補充，平台未自動核實原文。</p>':''}
  ${e.ai_suggestion ? `<div class="suggestion"><b>AI 建議・待覆核：${esc(e.ai_suggestion.relation)}</b><p>${esc(e.ai_suggestion.quote)}</p><p>${esc(e.ai_suggestion.note)}</p><button class="quiet use-suggestion" data-claim="${cl.id}" data-evidence="${e.id}">填入建議供人工確認</button></div>` : ''}
  <details><summary>檢視收錄段落與使用依據</summary><p>${esc(e.content)}</p><p>使用依據：${esc(e.license)}</p></details>
  ${passageForm}${passage?`<details class="evidence-review"><summary>核對引文與證據關係 <span>＋</span></summary><form class="evidence-form" data-claim="${cl.id}" data-evidence="${e.id}"><label>證據關係 <select name="relation">${option(['待確認','支持','反駁','無關'],e.relation)}</select></label><label>逐字引文（至少 4 字）<textarea name="quote" maxlength="800" required rows="2">${esc(quote)}</textarea></label><label>核對註記<input name="note" maxlength="1000" value="${esc(e.note)}"></label><div class="actions"><button class="secondary" type="submit">${e.reviewed ? '更新證據註記' : '儲存人工確認'}</button><span class="badge">${e.reviewed ? '已人工確認' : '候選證據・未確認'}</span></div></form></details>`:''}</article>`;
}
function renderCase() {
  const c = current;
  if(c.retrieval_version!==4){$('#results').innerHTML='<div class="notice"><b>這是舊版檢索紀錄。</b><p>舊版可能只因共同片段推薦無關報告。原始紀錄保留，請重新查核以套用新版篩選。</p><button class="primary rerun-case">重新查核這則訊息</button></div>';return;}
  const withCandidates=c.claims.filter(cl=>cl.evidence.length).length;
  const reviewed=c.claims.filter(cl=>cl.reviewed).length;
  const summary=`<section class="case-summary"><div><span>查核進度</span><h2>${reviewed===c.claims.length?'已完成你的人工覆核':'需要繼續查證'}</h2><p>${withCandidates===0?'目前沒有通過篩選的候選報告。請補充對象或條件，避免以不相干資料下結論。':'已找到候選報告，請核對原始報告的對象、條件與內文；找到報告不代表主張已被證實。'}</p></div><div class="case-metrics"><span><b>${withCandidates}/${c.claims.length}</b>主張有候選資料</span><span><b>${reviewed}/${c.claims.length}</b>主張完成人工覆核</span></div></section>`;
  $('#results').innerHTML = `<div class="result-top"><h2>查核工作區 <span class="badge">${c.claims.length} 個主張</span></h2><div class="actions"><button class="secondary" type="button" data-report="md">下載 Markdown</button><button class="secondary" type="button" data-report="json">下載 JSON</button></div></div>${summary}<p class="meta">${esc(c.mode)} · ${esc(new Date(c.created).toLocaleString('zh-TW'))} · 證據截止 ${esc(c.cutoff || '未限制')}</p>${c.warning ? `<p class="notice">${esc(c.warning)}</p>` : ''}
  ${c.collection?`<div class="collection"><b>公開報告檢索範圍</b><br>${esc(c.collection.provider)} · ${c.semantic?'載入 '+c.collection.found+' 份資料供模型比對':'找到 '+c.collection.found+' 份通過檢索篩選的候選'}（不代表證明此主張） · 新增 ${c.collection.added} 筆 · 更新 ${c.collection.updated} 筆<br>搜尋關鍵詞：${esc(c.collection.queries.join('／') || '未取得有效關鍵詞')}<br>${esc(c.collection.scope)}${c.collection.errors.length?`<ul>${c.collection.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`:'<p class="meta">本次未連線搜尋，使用本機已保存來源。</p>'}
  ${c.checklist?`<section class="five-checks" aria-label="五大查核要素"><h2>先看這五件事</h2><p class="meta">${esc(c.checklist.method)}</p><div class="check-grid">${c.checklist.items.map((item,i)=>`<article class="check-card"><span class="step">0${i+1}</span><h3>${esc(item.title)}</h3><span class="badge ${item.key==='sharing'?'amber':''}">${esc(item.status)}</span><ul>${item.details.map(d=>`<li>${esc(d)}</li>`).join('')}</ul></article>`).join('')}</div></section>`:''}
  ${c.claims.map((cl,i) => `<article class="panel"><div class="claim-title"><span class="step">${String(i+1).padStart(2,'0')}</span><h3>${esc(cl.text)}</h3><span class="badge${!cl.reviewed ? ' amber' : ''}">${esc(cl.verdict)} · ${cl.reviewed ? '人工覆核' : '待覆核'}</span></div><p class="anchor">輸入原文：${esc(cl.anchor)}</p><div class="actions"><button class="quiet edit-claim" data-claim="${cl.id}">編輯主張</button></div><form class="edit-form" data-claim="${cl.id}" hidden><label>修改主張後會重新搜尋，並重設此主張的覆核紀錄<textarea name="text" required maxlength="2000">${esc(cl.text)}</textarea></label><button class="secondary" type="submit">儲存並重新搜尋</button></form>
  ${cl.evidence.length ? '<p class="meta">以下是檢索候選，請核對對象與條件，並確認支持／反駁關係。</p>'+cl.evidence.map(e => evidenceHTML(e,cl)).join('') : '<p class="empty">'+(cl.retrieval?.needs_context?esc(cl.retrieval.reason):'目前範圍找不到足夠相關的候選證據。請補充明確對象、事件或條件；找不到資料不代表主張為假。')+'</p>'}
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
  const link=e.target.closest('[data-report]');if(link){e.preventDefault();try{const response=await localResponse('/api/cases/'+current.id+'/report'+(link.dataset.report==='md'?'?format=md':''));if(!response.ok)throw new Error((await response.json()).error);const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tracefact-'+current.id+(link.dataset.report==='md'?'.md':'.json');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){toast(err.message);}return;}
});
$('#results').addEventListener('click', e => {
  const b=e.target.closest('button'); if(!b)return;
  if(b.classList.contains('rerun-case')){$('#message').value=current.input;$('#subject').value=current.subject||'';$('#cutoff').value=current.cutoff||'';demoMode=current.include_demo===true;$('#analyze-form').requestSubmit();return;}
  if(b.classList.contains('edit-claim')) { const f=$(`.edit-form[data-claim="${b.dataset.claim}"]`);f.hidden=!f.hidden; }
  if(b.classList.contains('suggest')) action(b,async()=>{current=await api(`/api/cases/${current.id}/suggest`,'POST',{claim_id:b.dataset.claim});renderCase();toast('AI 建議已產生，請逐項核對，尚未改變結論。');});
  if(b.classList.contains('use-suggestion')) {const cl=current.claims.find(c=>c.id===b.dataset.claim),ev=cl.evidence.find(x=>x.id===b.dataset.evidence),f=$(`.evidence-form[data-claim="${cl.id}"][data-evidence="${ev.id}"]`);f.closest('details')?.setAttribute('open','');f.elements.relation.value=ev.ai_suggestion.relation;f.elements.quote.value=ev.ai_suggestion.quote;f.elements.note.value=ev.ai_suggestion.note;toast('已填入建議，請核對後按儲存人工確認。');}
});
$('#results').addEventListener('submit', e => {
  e.preventDefault();const f=e.target,data=Object.fromEntries(new FormData(f));data.claim_id=f.dataset.claim;if(f.dataset.evidence)data.evidence_id=f.dataset.evidence;if(f.classList.contains('passage-form'))data.confirmed=f.elements.confirmed.checked;
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
$('#history-list').addEventListener('click',e=>{const b=e.target.closest('.open-case');if(b)action(b,async()=>{current=await api(`/api/cases/${b.dataset.id}`);page('workspace');$('#message').value=current.input;$('#subject').value=current.subject||'';$('#cutoff').value=current.cutoff;renderCase();$('#results').scrollIntoView({behavior:'smooth'});});});
refresh().then(()=>synchronize()).catch(e=>{toast(e.message);$('#sync-status').textContent='目前無法更新來源，仍可使用本機快取。';});

async function loadQuality(){
 const r=await fetch(new URL('./quality-report.json',import.meta.url),{cache:'no-cache'});if(!r.ok)throw Error('評估報告暫時無法載入');const q=await r.json(),view=q.sentence_retrieval||q;
 $('#quality-results').innerHTML='<article class="panel"><h2>'+esc(view.experiment)+'</h2><p class="meta">產生時間：'+esc(new Date(q.created_at).toLocaleString('zh-TW'))+' · '+view.sample_count+' 個主張 · '+(view.candidate_sentence_count||q.candidate_page_count)+' 個候選資料</p><div class="quality-metrics">'+Object.entries(view.metrics).map(([mode,m])=>'<div><h3>'+esc(mode==='semantic'?'AI 語意模型':mode==='bm25'?'BM25 字詞基準':'保守完整詞篩選')+'</h3><strong>'+((m.at5||0)*100).toFixed(1)+'%</strong><p>標註資料至少一筆出現在前五名</p><p class="meta">前一名 '+((m.at1||0)*100).toFixed(1)+'% · MRR '+m.mrr+'</p></div>').join('')+'</div><p class="notice">這是受限候選池的檢索評估，不是新聞查核準確率，不代表模型能自動辨識真假。</p><ul class="muted">'+(q.sentence_retrieval ? [...view.limitations,...q.limitations.filter(s=>!s.startsWith('只測標註頁名'))] : q.limitations).map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul><p><a href="'+esc(q.source)+'" target="_blank" rel="noreferrer">原始資料集 ↗</a> · <a href="./quality-report.json" target="_blank" rel="noreferrer">完整評估與抽樣紀錄 ↗</a></p></article>';
}
