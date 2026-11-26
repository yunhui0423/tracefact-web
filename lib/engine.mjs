import { createHash } from 'node:crypto';

export const verdicts = ['支持', '反駁', '證據衝突', '證據不足'];
export const relations = ['支持', '反駁', '無關', '待確認'];
export function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
export function text(value, name, max = 20000, required = true) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${name} 必須是 1～${max} 字的文字`);
  return value.trim();
}
export function date(value, name = '日期') {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString().slice(0, 10) !== value) fail(`${name} 格式應為有效的 YYYY-MM-DD`);
  return value;
}
export function safeURL(value, required = false) {
  if (!value && !required) return '';
  let u;
  try { u = new URL(value); } catch { fail('來源網址無效'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) fail('來源只接受不含帳密的 HTTP(S) 網址');
  u.hash = '';
  return u.href;
}
export function fingerprint(value) { return createHash('sha256').update(value.normalize('NFKC').replace(/\s+/g, '').toLowerCase()).digest('hex'); }
export function tokens(value) {
  const s = value.normalize('NFKC').toLowerCase();
  const words = s.match(/[\p{Script=Latin}\d]+/gu) || [];
  for (const run of s.match(/[\p{Script=Han}]+/gu) || []) {
    if (run.length === 1) words.push(run);
    for (let i = 0; i < run.length - 1; i++) words.push(run.slice(i, i + 2));
  }
  return words;
}
export function similarity(a, b) {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  const common = [...x].filter(t => y.has(t)).length;
  return x.size && y.size ? common / (x.size + y.size - common) : 0;
}
export function splitClaims(value) {
  const parts = value.match(/[^。！？!?\n]+[。！？!?]?/gu) || [value];
  return [...new Set(parts.map(x => x.trim()).filter(Boolean))].slice(0, 12).map(t => ({ text: t, anchor: t }));
}
const RETRIEVAL_STOP = new Set(['不能','就不能','能不能','不會','就會','可以','不可以','能夠','不能夠','沒有','不是','就是','是否','是不是','真的','假的','真假','一定','只要','就能','都會','還會','也會','應該','可能','需要','必須','不用','不必','不要','不應該','無法','有人','大家','我們','你們','這個','那個','這些','那些','一個','所有','全部','每天','今天','明天','最近','平日','週末','晚上','開放','影響','通過','越高','越深','表示','指出','聲稱','宣稱','消息','網路','網傳','流傳','傳言','查核','查證','分享','轉傳','因為','所以','如果','但是','而且','一直','非常','比較','更多','越來越','怎麼','如何','什麼','這樣','那樣']);
export function retrievalProfile(value) {
  const clean=String(value).normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+/gi,' ');
  const words=[...new Intl.Segmenter('zh-Hant',{granularity:'word'}).segment(clean)].filter(x=>x.isWordLike).map(x=>x.segment);
  const terms=[...new Set(words.filter(w=>w.length>=2&&w.length<=40&&!RETRIEVAL_STOP.has(w)&&!/^\d+$/.test(w)&&!(/^[一二三四五六七八九十百零兩]+(?:點|時|日|月|年)?$/.test(w))&&!/^(?:就|都|也|還)?(?:不|沒)?(?:能|會|可以|一定|可能|必須|需要|應該|不能|不會)$/.test(w)))].slice(0,12);
  return {terms,minimum:terms.length===1?1:Math.max(2,Math.ceil(terms.length*.5)),needs_context:terms.length===0,reason:terms.length?'只比對完整關鍵詞；仍需人工確認對象與上下文。':'這句話缺少可明確檢索的對象或主題，暫不推薦證據。請補充在說誰、什麼設備或事件，以及具體條件。'};
}
export function relevance(query,source) {
  const p=retrievalProfile(query),body=`${source.title||''}\n${source.content||''}`.normalize('NFKC').toLowerCase();
  const matched=p.terms.filter(term=>body.includes(term));
  return {accepted:!p.needs_context&&matched.length>=p.minimum,matched,required:p.minimum,terms:p.terms};
}
export function sourcePassage(source){
  let body=String(source.content||'').trim();
  const title=String(source.title||'').trim();
  if(source.automatic&&title&&body.startsWith(title))body=body.slice(title.length).trim();
  if(source.automatic&&body.normalize('NFKC').replace(/\s+/g,'')===title.normalize('NFKC').replace(/\s+/g,''))return '';
  return body;
}
export function validEvidenceQuote(e){return typeof e.quote==='string'&&e.quote.trim().length>=4&&sourcePassage(e).includes(e.quote);}
export function rank(query, sources, cutoff = '', limit = 6) {
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
export function graph(sources) {
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
export function validateSuggestions(output, evidence) {
  if (!Array.isArray(output)) fail('模型未回傳有效的證據陣列', 502);
  const seen = new Set();
  return output.filter(x => {
    const s = evidence.find(e => e.id === x.source_id);
    if (!s || seen.has(s.id) || !relations.includes(x.relation) || typeof x.quote !== 'string' || x.quote.trim().length < 4 || x.quote.length > 800 || !s.content.includes(x.quote)) return false;
    seen.add(s.id); return true;
  }).map(x => ({ source_id: x.source_id, relation: x.relation, quote: x.quote, note: String(x.note || '').slice(0, 1000) }));
}
