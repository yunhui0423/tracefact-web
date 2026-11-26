import {retrievalProfile, relevance} from './engine.mjs';
const ORIGIN = 'https://tfc-taiwan.org.tw';
const ENDPOINT = '/wp-json/wp/v2/fact-check-reports';
const COPYRIGHT = `${ORIGIN}/copyright-notice/`;
const STOP = new Set(['網路','網傳','流傳','消息','有人','表示','指出','聲稱','宣稱','請問','查核','查證','真假','是否','是不是','真的','假的','可以','能夠','可能','應該','一定','只要','就會','不會','全部','大家','今天','明天','最近','看到','分享','這個','那個','這些','一個','我們','你們','因為','所以','越深','越高']);

// Only keywords are sent to the public service, never the whole original message.
export function searchTerms(value) {
  const distinct = retrievalProfile(value).terms.filter(s=>!STOP.has(s)&&!/^\d{7,}$/.test(s)).slice(0,8);
  if (!distinct.length) return [];
  const first = distinct.slice(0, 3).join(' ').slice(0, 100);
  const longest = [...distinct].sort((a,b) => b.length-a.length).slice(0, 2);
  return [...new Set([first, ...longest])].slice(0, 3);
}
export function plainHTML(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_,n) => { const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1),16) : parseInt(n,10); return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''; })
    .replace(/&(amp|lt|gt|quot|apos|nbsp|hellip|ndash|mdash|rsquo|lsquo|rdquo|ldquo);/g, (_,n) => ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“'}[n]))
    .replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
}
export function fromPost(post) {
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
export function publicSourceClient({ fetcher = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  let active;
  async function posts(query = '') {
    const key = query || '__latest__', old = cache.get(key);
    if (old && now()-old.at < 30*60*1000) return { ...old.result, cached:true };
    const url = new URL(ENDPOINT,ORIGIN);
    url.searchParams.set('per_page', query ? '6' : '12');
    url.searchParams.set('_fields','id,title,link,date,modified,excerpt');
    if (query) url.searchParams.set('search',query);
    const response = await fetcher(url, { redirect:'manual', signal:AbortSignal.timeout(9000), headers:{Accept:'application/json','User-Agent':'TraceFact-AI/1.1 (+https://github.com/yunhui0423/tracefact-ai)'} });
    if (!response.ok) throw new Error(`來源服務回應 ${response.status}`);
    if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('來源服務未回傳 JSON');
    const reader = response.body.getReader(), chunks=[];let size=0;
    try { while(true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1_000_000){await reader.cancel();throw new Error('來源回應過大');}chunks.push(value);} } finally { reader.releaseLock(); }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
