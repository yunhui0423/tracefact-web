
function decodeChunks(chunks){return new TextDecoder().decode(Uint8Array.from(chunks.flatMap(chunk=>Array.from(chunk))));}





const verdicts = ['支持', '反駁', '證據衝突', '證據不足'];
const relations = ['支持', '反駁', '無關', '待確認'];
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function text(value, name, max = 20000, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${name} 必須是 1～${max} 字的文字`);
  return value.trim();
}
function date(value, name = '日期') {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${name} 格式應為有效的 YYYY-MM-DD`);
  return value;
}
function safeURL(value, required = false) {
  if (!value && !required) return '';
  let u;
  try { u = new URL(value); } catch { fail('來源網址無效'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail('來源只接受不含帳密的 HTTP(S) 網址');
  u.hash = '';
  return u.href;
}
async function fingerprint(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.normalize('NFKC').replace(/\s+/g,'').toLowerCase()));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function tokens(value) {
  const s = value.normalize('NFKC').toLowerCase();
  const words = s.match(/[\p{Script=Latin}\d]+/gu) || [];
  for (const run of s.match(/[\p{Script=Han}]+/gu) || []) {
    if (run.length === 1) words.push(run);
    for (let i = 0; i < run.length - 1; i++) words.push(run.slice(i, i + 2));
  }
  return words;
}
function similarity(a, b) {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  const common = [...x].filter(t => y.has(t)).length;
  return x.size && y.size ? common / (x.size + y.size - common) : 0;
}
function splitClaims(value) {
  const parts = value.match(/[^。！？!?\n]+[。！？!?]?/gu) || [value];
  return [...new Set(parts.map(x => x.trim()).filter(Boolean))].slice(0, 12).map(t => ({ text: t, anchor: t }));
}
const RETRIEVAL_STOP = new Set(['不能','就不能','能不能','不會','就會','可以','不可以','能夠','不能夠','沒有','不是','就是','是否','是不是','真的','假的','真假','一定','只要','就能','都會','還會','也會','應該','可能','需要','必須','不用','不必','不要','不應該','無法','有人','大家','我們','你們','這個','那個','這些','那些','一個','所有','全部','每天','今天','明天','最近','平日','週末','晚上','開放','影響','通過','越高','越深','表示','指出','聲稱','宣稱','消息','網路','網傳','流傳','傳言','查核','查證','分享','轉傳','因為','所以','如果','但是','而且','一直','非常','比較','更多','越來越','怎麼','如何','什麼','這樣','那樣']);
function retrievalProfile(value) {
  const clean=String(value).normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi,' ');
  const words=[...new Intl.Segmenter('zh-Hant',{granularity:'word'}).segment(clean)].filter(x=>x.isWordLike).map(x=>x.segment);
  const terms=[...new Set(words.filter(w=>w.length>=2&&w.length<=40&&!RETRIEVAL_STOP.has(w)&&!/^\d+$/.test(w)&&!(/^[一二三四五六七八九十百零兩]+(?:點|時|日|月|年)?$/.test(w))&&!/^(?:就|都|也|還)?(?:不|沒)?(?:能|會|可以|一定|可能|必須|需要|應該|不能|不會)$/.test(w)))].slice(0,12);
  return {terms,minimum:terms.length<=3?terms.length:Math.ceil(terms.length*.75),needs_context:terms.length===0,reason:terms.length?'短句須符合全部檢索詞，較長句須符合至少四分之三；仍需人工確認語意與上下文。':'這句話缺少可明確檢索的對象或主題，暫不推薦證據。請補充在說誰、什麼設備或事件，以及具體條件。'};
}
function relevance(query,source) {
  const p=retrievalProfile(query),body=`${source.title||''}\n${source.content||''}`.normalize('NFKC').toLowerCase();
  const matched=p.terms.filter(term=>body.includes(term));
  return {accepted:!p.needs_context&&matched.length>=p.minimum,matched,required:p.minimum,terms:p.terms};
}
function sourcePassage(source){
  let body=String(source.content||'').trim();
  const title=String(source.title||'').trim();
  if(source.automatic&&title&&body.startsWith(title))body=body.slice(title.length).trim();
  if(source.automatic&&body.normalize('NFKC').replace(/\s+/g,'')===title.normalize('NFKC').replace(/\s+/g,''))return '';
  return body;
}
function validEvidenceQuote(e){return typeof e.quote==='string'&&e.quote.trim().length>=4&&sourcePassage(e).includes(e.quote);}
function rank(query, sources, cutoff = '', limit = 6) {
  const eligible = sources.filter(s => (!cutoff || (s.published && s.published <= cutoff))&&relevance(query,s).accepted);
  const docs = eligible.map(s => tokens(`${s.title} ${s.content}`));
  const terms = [...new Set(tokens(query))], avg = docs.reduce((n, d) => n + d.length, 0) / (docs.length || 1);
  return eligible.map((s, i) => {
    let score = 0;
    for (const term of terms) {
      const tf = docs[i].filter(w => w === term).length;
      const df = docs.filter(d => d.includes(term)).length;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * docs[i].length / (avg || 1)));
    }
    const passage=sourcePassage(s);
    const chunks = passage.match(/[^。！？!?\n]+[。！？!?]?/gu) || [''];
    const quote = chunks.map(t => t.trim()).sort((a, b) => similarity(query, b) - similarity(query, a))[0].slice(0, 800);
    return { ...s, excerpt_available:!!passage, matched_terms:relevance(query,s).matched, score: Number(score.toFixed(4)), quote, relation: '待確認', note: '通過完整關鍵詞篩選；尚未確認語意、對象或支持／反駁關係，請閱讀原文覆核。' };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
function graph(sources) {
  const edges = [], groups = new Map(sources.map(s => [s.id, s.id]));
  const root = id => { while (groups.get(id) !== id) id = groups.get(id); return id; };
  const join = (a, b) => groups.set(root(a), root(b));
  for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
    const a = sources[i], b = sources[j];
    let type = '';
    if ((a.cites || []).includes(b.url)) { edges.push({ from: a.id, to: b.id, type: '明確引用' }); join(a.id, b.id); }
    if ((b.cites || []).includes(a.url)) { edges.push({ from: b.id, to: a.id, type: '明確引用' }); join(a.id, b.id); }
    if (a.hash === b.hash) type = '內容相同';
    else if (similarity(a.content, b.content) >= 0.72) type = '內容相似';
    if (type) { edges.push({ from: a.id, to: b.id, type }); join(a.id, b.id); }
  }
  const dated = sources.filter(s => s.published).sort((a, b) => a.published.localeCompare(b.published));
  return { nodes: sources.map(s => ({ id: s.id, title: s.title, url: s.url, published: s.published, demo: s.demo, group: root(s.id) })), edges,
    groups: new Set(sources.map(s => root(s.id))).size,
    earliest: dated.filter(s => s.published === dated[0]?.published).map(s => s.id),
    caveat: '僅為目前收錄資料的來源關聯；引用與相似群不等於獨立來源數，也不能證明最初發布者或真實傳播路徑。' };
}
function validateSuggestions(output, evidence) {
  if (!Array.isArray(output)) fail('模型未回傳有效的證據陣列', 502);
  const seen = new Set();
  return output.filter(x => {
    const s = evidence.find(e => e.id === x.source_id);
    if (!s || seen.has(s.id) || !relations.includes(x.relation) || typeof x.quote !== 'string' || x.quote.trim().length < 4 || x.quote.length > 800 || !s.content.includes(x.quote)) return false;
    seen.add(s.id); return true;
  }).map(x => ({ source_id: x.source_id, relation: x.relation, quote: x.quote, note: String(x.note || '').slice(0, 1000) }));
}

const domainToUnicode=value=>value;

const CUES=['震驚','驚爆','快轉傳','趕快轉','不轉','百分之百','保證有效','立刻分享','被隱瞞','救命','緊急通知'];
const KNOWN=['tfc-taiwan.org.tw','mygopen.com','cna.com.tw','sinica.edu.tw'];
function inspectLinks(value) {
  return [...new Set(value.match(/https?:\/\/[^\s<>"'，。！？）)]+/g)||[])].slice(0,20).map(raw=>{
    try {
      const u=new URL(raw),host=u.hostname.toLowerCase(),unicode=domainToUnicode(host),flags=[];
      if(u.protocol==='http:')flags.push('非 HTTPS；不代表內容必定不實');
      if(u.username||u.password)flags.push('網址含使用者資訊，實際主機請看 @ 之後');
      if(host.includes('xn--'))flags.push(`國際化網域：${unicode}；請核對字形`);
      for(const known of KNOWN)if(host.includes(known)&&host!==known&&!host.endsWith('.'+known))flags.push(`網址含 ${known}，但實際主機並非該機構網域`);
      return {url:raw,host,flags};
    }catch{return {url:raw,host:'無法解析',flags:['網址格式無法解析']};}
  });
}
function buildChecklist(c) {
  const claims=c.claims||[], cues=CUES.filter(x=>c.input.includes(x));
  if(/[!！?？]{3,}/.test(c.input))cues.push('連續驚嘆號／問號');
  const links=inspectLinks(c.input), warnings=links.flatMap(x=>x.flags.map(f=>`${x.host}：${f}`));
  const evidence=[...new Map(claims.flatMap(cl=>cl.evidence.map(e=>[e.id,e]))).values()];
  const orgs=[...new Set(evidence.filter(e=>!e.demo).map(e=>e.provider_name||new URL(e.url).hostname))];
  const pending=claims.filter(cl=>!cl.reviewed || ['證據不足','證據衝突'].includes(cl.verdict)).length;
  const refuted=claims.some(cl=>cl.reviewed&&cl.verdict==='反駁');
  const numeric=/\d|百分之|[一二三四五六七八九十]+[年月日成倍]/.test(c.input);
  const authority=/研究|專家|醫師|教授|科學|數據/.test(c.input);
  const pause=pending>0||orgs.length<3;
  return {
    method:'五項查核提示；不計算真假百分比，所有自動提示均非真偽認定。',
    items:[
      {key:'skepticism',title:'保持懷疑態度',status:cues.length?'發現需留意用語':'未見明顯語氣線索',details:[cues.length?`偵測到：${cues.join('、')}。`:'未偵測到預設的聳動／催促轉傳詞彙。','情緒或聳動語氣只是一項線索，不能據此判定訊息為假。']},
      {key:'source',title:'調查消息來源',status:warnings.length?'網址需要仔細核對':links.length?'已辨識網址，仍需核對作者':'原始發布來源待補',details:[links.length?`輸入網址主機：${links.map(x=>x.host).join('、')}。`:'輸入未附原始發布網址；平台找到的查核報告不等於訊息原始出處。',...warnings,'具名機構、作者身分與過往紀錄仍需查證；網域名稱本身不保證公信力。']},
      {key:'reasoning',title:'檢視內容合理性',status:pending?'數據與脈絡待核對':'已記錄人工判讀',details:[`已拆成 ${claims.length} 個主張，${pending} 個仍待確認或證據不足／衝突。`,numeric?'包含數字或時間資訊，請比對年份、母體、單位及適用範圍。':'請確認人物、時間、地點、對象與限制條件，避免只憑常理判斷。',authority?'提及研究／專家／數據，請追查具名者、研究原文與是否符合主張。':'若涉及科學或醫療說法，仍需原始研究或具資格的專業依據。']},
      {key:'crosscheck',title:'多方交叉比對',status:orgs.length<3?'尚待跨機構比對':'尚待確認來源獨立性',details:[`目前候選有 ${evidence.length} 份報告，來自 ${orgs.length} 個機構／網站：${orgs.join('、')||'尚無真實來源'}。`,'可把 3～4 個可靠且獨立來源當作查核目標；相同機構的多篇報告、轉載及互相引用不能直接當成獨立證據。','來源數量不是判真門檻；仍須確認每個來源是否直接支持主張。'],organizations:orgs,independence_confirmed:false},
      {key:'sharing',title:'先查證，不亂傳',status:refuted?'避免原樣轉傳':pause?'先查證，暫緩轉傳':'分享時附查核依據',details:[refuted?'已有人工作成反駁結論，如需澄清請分享查核依據，避免原樣擴散。':pause?'仍有待確認主張或缺乏跨機構比對，建議暫緩轉傳。':'已有人工判讀紀錄，分享前仍應附來源、日期與未解決的限制。','平台不會自動轉發訊息，也不以單一分數保證可分享。']}
    ]
  };
}

const ORIGIN = 'https://tfc-taiwan.org.tw';
const ENDPOINT = '/wp-json/wp/v2/fact-check-reports';
const COPYRIGHT = `${ORIGIN}/copyright-notice/`;
const STOP = new Set(['網路','網傳','流傳','消息','有人','表示','指出','聲稱','宣稱','請問','查核','查證','真假','是否','是不是','真的','假的','可以','能夠','可能','應該','一定','只要','就會','不會','全部','大家','今天','明天','最近','看到','分享','這個','那個','這些','一個','我們','你們','因為','所以','越深','越高']);

// Only keywords are sent to the public service, never the whole original message.
function searchTerms(value) {
  const distinct = retrievalProfile(value).terms.filter(s=>!STOP.has(s)&&!/^\d{7,}$/.test(s)).slice(0,8);
  if (!distinct.length) return [];
  const first = distinct.slice(0, 3).join(' ').slice(0, 100);
  const longest = [...distinct].sort((a,b) => b.length-a.length).slice(0, 2);
  return [...new Set([first, ...longest])].slice(0, 3);
}
function plainHTML(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_,n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : parseInt(n,10); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g, (_,n) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'}[n]))
    .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
function fromPost(post) {
  if (!post || !Number.isInteger(post.id) || !post.title?.rendered || !post.link) throw new Error('查核來源欄位不完整');
  const link = new URL(post.link);
  if (link.origin !== ORIGIN || !link.pathname.startsWith('/fact-check-reports/')) throw new Error('查核報告網址不在允許範圍');
  const title = plainHTML(post.title.rendered).slice(0,250), excerpt = plainHTML(post.excerpt?.rendered);
  // Excerpts are kept intact when short; do not fetch or redistribute complete articles.
  const content = `${title}${excerpt ? '\n\n'+excerpt.slice(0,2500) : ''}`;
  const published = /^\d{4}-\d{2}-\d{2}T/.test(post.date || '') ? post.date.slice(0,10) : '';
  return { title, url:link.href, published, content, language:'zh-TW', cites:[], demo:false,
    license:`台灣事實查核中心報告標題與原站摘要；本專題採非營利研究用途並註明出處，營利用途須另取得授權。${COPYRIGHT}`,
    provider:'tfc', provider_name:'台灣事實查核中心', automatic:true, content_kind:'報告標題與原站摘要（非全文）',
    upstream_id:post.id, upstream_modified:post.modified || '', attribution_url:link.href,
    excerpt_truncated:excerpt.length > 2500 };
}
function publicSourceClient({ fetcher = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  let active;
  async function posts(query = '') {
    const key = query || '__latest__', old = cache.get(key);
    if (old && now()-old.at < 30*60*1000) return { ...old.result, cached:true };
    const url = new URL(ENDPOINT,ORIGIN);
    url.searchParams.set('per_page', query ? '6' : '12');
    url.searchParams.set('_fields','id,title,link,date,modified,excerpt');
    if (query) url.searchParams.set('search',query);
    const response = await fetcher(url, { redirect:'manual', signal:AbortSignal.timeout(9000), headers:{Accept:'application/json'} });
    if (!response.ok) throw new Error(`來源服務回應 ${response.status}`);
    if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('來源服務未回傳 JSON');
    const reader = response.body.getReader(), chunks=[];let size=0;
    try { while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();throw new Error('來源回應過大');}chunks.push(value);} } finally { reader.releaseLock(); }
    const payload = JSON.parse(await new Blob(chunks).text());
    if (!Array.isArray(payload)) throw new Error('來源服務格式變更');
    const result = {sources:payload.slice(0,12).map(fromPost),cached:false};
    if(cache.size>=100)cache.delete(cache.keys().next().value);
    cache.set(key,{at:now(),result});return result;
  }
  async function collect(value = '') {
    const queries = value ? searchTerms(value) : [''];
    const items=new Map(),errors=[],requests=[];
    if(value && !queries.length)errors.push('訊息未包含足夠的可搜尋關鍵詞。');
    for (const query of queries) {
      try {const r=await posts(query);requests.push({query:query || '最新查核報告',cached:r.cached,count:r.sources.length});for(const s of r.sources)items.set(s.url,s);}
      catch(e){ errors.push(`${query || '最新報告'}：${e.name==='TimeoutError'?'連線逾時':e.message}`); }
    }
    return {provider:'台灣事實查核中心',provider_url:ORIGIN,sources:[...items.values()].filter(s=>!value||relevance(value,s).accepted),queries:queries.filter(Boolean),requests,errors,checked_at:new Date(now()).toISOString(),scope:'僅搜尋台灣事實查核中心公開報告；不是全網搜尋。摘要可能不足以確認主張，請開啟原文。'};
  }
  return {name:'台灣事實查核中心',async collect(value='') {
    // Serialize public requests to avoid bursts. Identical queries use the 30-minute cache.
    const previous=active;
    const task=(async()=>{if(previous)await previous.catch(()=>{});return collect(value);})();active=task;
    try{return await task;}finally{if(active===task)active=undefined;}
  }};
}

const demo=[
  {"title":"【虛構】青禾校園圖書館開放時間公告","url":"https://library.example.invalid/notices/2026-hours","published":"2026-10-01","language":"zh-TW","demo":true,"license":"專案自製虛構示例，可自由用於展示","cites":[],"content":"【虛構展示資料，並非真實學校公告】青禾校園圖書館自2026年10月起，平日開放至晚上九點。週末開放至下午五點。期末考週延長至晚上十一點，僅適用2026年12月14日至18日。"},
  {"title":"【虛構】學生報轉載圖書館公告","url":"https://student.example.invalid/library-news","published":"2026-10-02","language":"zh-TW","demo":true,"license":"專案自製虛構示例，可自由用於展示","cites":["https://library.example.invalid/notices/2026-hours"],"content":"【虛構展示資料】依青禾校園圖書館公告，平日開放至晚上九點。週末開放至下午五點。期末考週延長至晚上十一點，僅適用2026年12月14日至18日。"},
  {"title":"【虛構】去年圖書館考週公告","url":"https://library.example.invalid/notices/2025-exams","published":"2025-12-01","language":"zh-TW","demo":true,"license":"專案自製虛構示例，可自由用於展示","cites":[],"content":"【虛構展示資料】青禾校園圖書館於2025年12月15日至19日的期末考週，平日開放至午夜十二點。本公告不適用其他年份或日期。"},
  {"title":"【虛構】青禾學院法文版活動說明","url":"https://campus.example.invalid/fr/atelier","published":"2026-10-03","language":"fr","demo":true,"license":"專案自製虛構示例，可自由用於展示","cites":[],"content":"EXEMPLE FICTIF. L'atelier de vérification des informations est gratuit pour les étudiants inscrits. L'inscription préalable est obligatoire. Le nombre de places est limité à vingt. 中文關鍵詞：資訊查核工作坊、免費、在學學生、事先報名、二十名。"},
  {"title":"【虛構】青禾學院工作坊中文宣傳","url":"https://campus.example.invalid/zh/atelier","published":"2026-10-04","language":"zh-TW","demo":true,"license":"專案自製虛構示例，可自由用於展示","cites":["https://campus.example.invalid/fr/atelier"],"content":"【虛構展示資料】青禾學院資訊查核工作坊免費開放所有人參加，不必事先報名。此中文宣傳與所引用的法文說明存在範圍及報名條件差異，請人工核對。"}
]
;
const liveCollector=publicSourceClient();
let feedTime='';
const collector={name:liveCollector.name,async collect(value=''){
  if(value&&retrievalProfile(value).needs_context)return {provider:liveCollector.name,sources:[],queries:[],errors:[],found:0,needs_context:true,scope:retrievalProfile(value).reason};
  const live=await liveCollector.collect(value);
  if(live.sources.length&&!live.errors.length)return live;
  try{
    const response=await fetch(new URL('./feed.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('找不到公開摘要資料');
    const feed=await response.json();feedTime=feed.updated_at;
    if(!Array.isArray(feed.sources)||feed.sources.length>1000)throw new Error('摘要資料格式錯誤');
    const terms=searchTerms(value), selected=value?feed.sources.filter(s=>relevance(value,s).accepted):feed.sources.slice(0,30);
    return {...live,sources:selected,queries:terms,errors:[],scope:'原站即時連線不可用，改查網站最近 '+feed.sources.length+' 則公開摘要；資料更新 '+feed.updated_at+'。只含單一機構，非全網搜尋。',snapshot_at:feed.updated_at};
  }catch(e){return {...live,errors:[...live.errors,'備援摘要：'+e.message]};}
}};

const cloudAI={enabled:false,ready:false,model:'',message:'線上搜尋與查核提示；本機 AI 僅適用桌面版'};
const cloudHeaders={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' https://chatgpt.com https://*.chatgpt.com",
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
const reply=(value,status=200,headers={})=>new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:{...cloudHeaders,'Content-Type':typeof value==='string'?'text/plain; charset=utf-8':'application/json; charset=utf-8',...headers}});
const GUEST_COOKIE='__Host-tracefact-session';
function guestToken(request){
  const values=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(GUEST_COOKIE+'='));
  if(values.length!==1)return null;
  const value=values[0].slice(GUEST_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
function newGuestToken(){return [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function guestCookie(token){return `${GUEST_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`;}
async function readBody(request){
  if(!(request.headers.get('content-type')||'').startsWith('application/json'))fail('請使用 JSON 格式',415);
  const reader=request.body?.getReader();if(!reader)fail('缺少資料');
  const chunks=[];let n=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>1_000_000){await reader.cancel();fail('資料不可超過 1 MB',413);}chunks.push(value);}}finally{reader.releaseLock();}
  let x;try{x=JSON.parse(decodeChunks(chunks));}catch{fail('JSON 格式錯誤');}
  if(!x||typeof x!=='object')fail('資料必須為物件或陣列');return x;
}
// IndexedDB belongs to this origin and browser profile. No records are uploaded.
let database;
async function openDB(){
  if(!database)database=new Promise((resolve,reject)=>{
    const r=indexedDB.open('tracefact-web-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('documents',{keyPath:'id'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('無法開啟瀏覽器儲存空間，請允許網站保存資料'));
  });return database;
}
async function transaction(mode,work){
  const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('documents',mode),store=tx.objectStore('documents');let result;
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(new Error('儲存失敗，可能空間不足；請先下載報告備份'));tx.onerror=()=>{};
    work(store,value=>{result=value;});
  });
}
function browserStore(){
  const all=kind=>transaction('readonly',(s,done)=>{const r=s.getAll();r.onsuccess=()=>done(r.result.filter(x=>x.kind===kind).map(x=>x.payload));});
  return {
    sources:()=>all('source'),
    get:id=>transaction('readonly',(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result?.kind==='case'?r.result.payload:undefined);}),
    list:async()=>(await all('case')).sort((a,b)=>b.created.localeCompare(a.created)).map(c=>({id:c.id,title:c.title,created:c.created})),
    addSources(items,automatic=false){return transaction('readwrite',(s,done)=>{
      const request=s.getAll();request.onsuccess=()=>{
        const map=new Map(request.result.filter(x=>x.kind==='source').map(x=>[x.payload.url,x.payload]));
        const counts={added:0,updated:0,unchanged:0};
        for(const item of items){const source=structuredClone(item),old=map.get(source.url);
          if(old){if(!automatic||!old.automatic||old.hash===source.hash){counts.unchanged++;continue;}source.id=old.id;counts.updated++;}
          else{if(map.size>=1000){txFail();return;}counts.added++;}
          map.set(source.url,source);s.put({id:source.id,kind:'source',payload:source});
        }done(counts);
        function txFail(){s.transaction.abort();}
      };
    });},
    async save(c,action='建立案件',details={}){
      c.checklist=buildChecklist(c);
      const audit={id:crypto.randomUUID(),case_id:c.id,created:new Date().toISOString(),action,payload:details};
      await transaction('readwrite',(s,done)=>{s.put({id:c.id,kind:'case',payload:c});s.put({id:audit.id,kind:'audit',payload:audit});done(true);});
    },
    audit:async id=>(await all('audit')).filter(a=>a.case_id===id).sort((a,b)=>a.created.localeCompare(b.created))
  };
}

async function cloudSource(x,automatic=false){
  if(!x||typeof x!=='object'||Array.isArray(x))fail('來源格式無效');
  const content=text(x.content,'來源內容',40000),url=safeURL(text(x.url,'網址',2000),true);
  if(x.cites!==undefined&&(!Array.isArray(x.cites)||x.cites.length>20))fail('引用網址最多 20 個');
  return {id:crypto.randomUUID(),title:text(x.title,'來源標題',250),url,content,hash:await fingerprint(content),published:date(x.published),language:text(x.language||'zh-TW','語言',30),license:text(x.license||'待確認，僅供研究','使用依據',500),demo:x.demo===true,cites:(x.cites||[]).map(u=>safeURL(u,true)),retrieved:new Date().toISOString(),
    ...(automatic?{automatic:true,provider:x.provider,provider_name:x.provider_name,content_kind:x.content_kind,upstream_id:x.upstream_id,upstream_modified:x.upstream_modified,excerpt_truncated:x.excerpt_truncated}:{} )};
}
async function onlineCollect(store,value=''){
  const r=await collector.collect(value),items=await Promise.all(r.sources.map(s=>cloudSource(s,true)));
  const counts=await store.addSources(items,true),{sources,...info}=r;return {...info,...counts,found:sources.length};
}
function cloudReport(c){
  const literal=s=>String(s||'').replace(/[\\`*_{}\[\]<>#!|]/g,ch=>'\\'+ch);
  return `# TraceFact AI 查核紀錄\n\n${literal(c.title)}\n\n建立時間：${c.created}\n查核對象：${literal(c.subject||'未指定')}\n\n線上版：自動公開來源搜尋與規則提示；AI 語意模型尚未啟用。\n\n`+
    `## 五項查核提示\n\n`+c.checklist.items.map(i=>`### ${i.title}：${i.status}\n\n${i.details.map(d=>'- '+literal(d)).join('\n')}\n`).join('\n')+
    c.claims.map(cl=>`\n## ${literal(cl.text)}\n\n結論：${cl.verdict}（${cl.reviewed?'人工覆核':'待覆核'}）\n\n理由：${literal(cl.reason)}\n\n`+cl.evidence.map(e=>`- ${literal(e.title)}${e.demo?'【虛構示例】':''}\n  - 原文網址：${e.url}\n  - 發布：${e.published||'未知'}；取得：${e.retrieved}\n  - 關係：${e.relation}（${e.reviewed?'人工確認':'候選證據'}）\n  - 引文：${literal(e.quote)}\n  - 使用依據：${literal(e.license)}\n`).join('\n')).join('\n');
}
const handler = {
  async fetch(request,env){
    const url=new URL(request.url),path=url.pathname;
    try{
      if(!['GET','POST','PATCH'].includes(request.method))fail('不支援的方法',405);
      const store=browserStore();
      if(path==='/api/status'&&request.method==='GET'){
        const sources=await store.sources();return reply({version:'3.2.1-evidence',feed_updated_at:feedTime,sources:sources.length,automatic_sources:sources.filter(s=>s.automatic).length,cases:(await store.list()).length,ai:cloudAI,public_sources:{name:collector.name,last_collection:null},user:{signed_in:false,anonymous:true}});
      }
      if(path==='/api/sources'&&request.method==='GET')return reply(await store.sources());
      if(path==='/api/sync'&&request.method==='POST'){await readBody(request);return reply(await onlineCollect(store));}
      if(path==='/api/sources'&&request.method==='POST'){
        const x=await readBody(request),list=Array.isArray(x)?x:[x];if(!list.length||list.length>100)fail('每批匯入 1～100 筆');
        const items=await Promise.all(list.map(s=>cloudSource(s)));return reply({...await store.addSources(items),submitted:list.length},201);
      }
      if(path==='/api/demo'&&request.method==='POST'){await readBody(request);return reply(await store.addSources(await Promise.all(demo.map(s=>cloudSource(s)))),201);}
      if(path==='/api/cases'&&request.method==='GET')return reply(await store.list());
      if(path==='/api/cases'&&request.method==='POST'){
        const x=await readBody(request),value=text(x.text,'訊息',10000),cutoff=date(x.cutoff);
        if(x.ai===true)fail('線上版尚未啟用 AI 語意模型；請使用線上搜尋與規則提示',503);
        if(x.online!==undefined&&typeof x.online!=='boolean')fail('online 格式無效');
        const subject=text(x.subject||'','查核對象',80,false),query=[subject,value].filter(Boolean).join('。');
        const collection=x.online!==false?await onlineCollect(store,query):null;
        const sources=(await store.sources()).filter(s=>x.include_demo===true||!s.demo);
        const c={retrieval_version:3,id:crypto.randomUUID(),created:new Date().toISOString(),title:value.slice(0,70),input:value,subject,cutoff,collection,include_demo:x.include_demo===true,mode:'瀏覽器規則輔助（無 AI 模型）',warning:'語氣、網址及來源數只作查核提示；未執行 AI 語意真假判讀。',claims:splitClaims(value).map(cl=>({id:crypto.randomUUID(),...cl,retrieval:retrievalProfile([subject,cl.text].filter(Boolean).join('。')),verdict:'證據不足',reviewed:false,reason:'',reviewer:'',evidence:rank([subject,cl.text].filter(Boolean).join('。'),sources,cutoff).map(e=>({...e,reviewed:false}))}))};
        const used=new Set(c.claims.flatMap(cl=>cl.evidence.map(e=>e.id)));c.graph=graph(sources.filter(s=>used.has(s.id)));
        await store.save(c);return reply(c,201);
      }
      const match=path.match(/^\/api\/cases\/([\w-]+)(?:\/(report|audit|suggest))?$/);
      if(match){
        const c=await store.get(match[1]);if(!c)fail('找不到案件',404);c.checklist=buildChecklist(c);
        if(request.method==='GET'&&!match[2])return reply(c);
        if(request.method==='GET'&&match[2]==='audit')return reply(await store.audit(c.id));
        if(request.method==='GET'&&match[2]==='report'){
          const md=url.searchParams.get('format')==='md';return reply(md?cloudReport(c):{...c,audit:await store.audit(c.id)},200,{'Content-Type':md?'text/markdown; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="tracefact-${c.id}.${md?'md':'json'}"`});
        }
        if(request.method==='POST'&&match[2]==='suggest')fail('線上版尚未啟用 AI 語意模型，請先人工核對來源',503);
        if(request.method==='PATCH'&&!match[2]){
          const x=await readBody(request),cl=c.claims.find(cl=>cl.id===x.claim_id);if(!cl)fail('找不到主張',404);
          let reset=false;
          if(x.source_id){const s=(await store.sources()).find(s=>s.id===x.source_id);if(!s)fail('找不到來源',404);if(s.demo&&!c.include_demo)fail('一般查核不使用虛構來源');if(c.cutoff&&(!s.published||s.published>c.cutoff))fail('來源超過證據截止日期');if(cl.evidence.some(e=>e.id===s.id)||cl.evidence.length>=12)fail('來源已存在或超過上限');cl.evidence.push({...s,score:0,quote:sourcePassage(s).slice(0,800),relation:'待確認',reviewed:false,note:'手動選取候選證據'});reset=true;}
          else if(x.passage!==undefined){
            const e=cl.evidence.find(e=>e.id===x.evidence_id);if(!e)fail('找不到證據',404);
            if(x.confirmed!==true)fail('請先確認已開啟原文，並由原文貼上段落');
            const passage=text(x.passage,'原文必要段落',8000);if(passage.length<20)fail('必要段落至少 20 字，請包含足夠上下文');
            e.original_content=e.original_content||e.content;e.content=e.title+'\n\n'+passage;e.hash=await fingerprint(e.content);
            e.manual_excerpt=true;e.content_kind='人工補充的原文段落（平台未自動核實）';e.quote='';e.reviewed=false;e.relation='待確認';reset=true;
          }
          else if(x.evidence_id){const e=cl.evidence.find(e=>e.id===x.evidence_id);if(!e)fail('找不到證據',404);if(!relations.includes(x.relation))fail('證據關係無效');const quote=text(x.quote,'引文',800);if(quote.length<4||!sourcePassage(e).includes(quote))fail('引文必須至少四字且存在於已收錄內文，不能只引用報告標題');Object.assign(e,{relation:x.relation,quote,note:text(x.note||'人工確認','註記',1000),reviewed:true});reset=true;}
          else if(x.text!==undefined){cl.text=text(x.text,'主張',2000);cl.retrieval=retrievalProfile([c.subject,cl.text].filter(Boolean).join('。'));cl.evidence=rank([c.subject,cl.text].filter(Boolean).join('。'),(await store.sources()).filter(s=>c.include_demo||!s.demo),c.cutoff).map(e=>({...e,reviewed:false}));reset=true;}
          else{
            if(!verdicts.includes(x.verdict))fail('結論無效');const support=cl.evidence.some(e=>e.reviewed&&validEvidenceQuote(e)&&e.relation==='支持'),refute=cl.evidence.some(e=>e.reviewed&&validEvidenceQuote(e)&&e.relation==='反駁');
            if((x.verdict==='支持'&&(!support||refute))||(x.verdict==='反駁'&&(!refute||support))||(x.verdict==='證據衝突'&&(!support||!refute)))fail('結論與已確認證據不一致');
            Object.assign(cl,{verdict:x.verdict,reviewed:true,reason:text(x.reason,'理由',3000),reviewer:text(x.reviewer,'覆核人',100),reviewed_at:new Date().toISOString()});
          }
          if(reset){Object.assign(cl,{reviewed:false,verdict:'證據不足',reason:'',reviewer:''});delete cl.reviewed_at;}
          const sourceMap=new Map(c.claims.flatMap(cl=>cl.evidence.map(e=>[e.id,e])));c.graph=graph([...sourceMap.values()]);await store.save(c,'人工更新',x);return reply(c);
        }
      }
      fail('找不到此功能',404);
    }catch(e){if(!e.status)console.error('TraceFact cloud request failed:',e.message);return reply({error:e.status?e.message:'服務暫時無法處理，請稍後再試'},e.status||500);}
  }
};

export async function localResponse(path,method='GET',data){return handler.fetch(new Request('https://tracefact.invalid'+path,{method,headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)}),{});}
export {rank,retrievalProfile,sourcePassage,validEvidenceQuote};
