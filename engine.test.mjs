import test from 'node:test';
import assert from 'node:assert/strict';
import { splitClaims, rank, graph, fingerprint, date, safeURL, validateSuggestions } from './lib/engine.mjs';


test('繁中主張依標點拆解、去重且保留原文', () => {
  assert.deepEqual(splitClaims('圖書館九點關門。\n週末五點關門！圖書館九點關門。').map(x => x.text), ['圖書館九點關門。','週末五點關門！']);
});
test('日期拒絕不存在的日期', () => {
  for (const s of ['2026-02-30','2026-99-01','yesterday',123]) assert.throws(() => date(s));
  assert.equal(date('2024-02-29'),'2024-02-29');
});
test('來源網址拒絕腳本與內嵌憑證', () => {
  assert.throws(() => safeURL('javascript:alert(1)')); assert.throws(() => safeURL('https://user:pass@example.com'));
  assert.equal(safeURL('https://example.com/test#part'),'https://example.com/test');
});
test('BM25 字詞檢索排除不相關內容與截止日後來源', () => {
  const sources=[{id:'a',title:'圖書館',content:'圖書館九點關門。',published:'2026-01-01'}, {id:'b',title:'圖書館',content:'圖書館十一點關門。',published:'2027-01-01'}, {id:'c',title:'圖書館',content:'圖書館十二點關門。',published:''}, {id:'d',title:'交通',content:'公車準時抵達。',published:'2025-01-01'}];
  assert.deepEqual(rank('圖書館',sources,'2026-12-31').map(s=>s.id),['a']);
  assert.equal(rank('不存在詞彙',sources).length,0);
});
test('引用與相似群去重，但不推定首發者', () => {
  const content='圖書館平日九點關門，週末五點關門。', hash=fingerprint(content);
  const g=graph([{id:'a',url:'https://a.example/',title:'A',content,hash,published:'2026-01-01',cites:[]},{id:'b',url:'https://b.example/',title:'B',content,hash,published:'2026-01-02',cites:['https://a.example/']}]);
  assert.equal(g.groups,1); assert.equal(g.edges.filter(e=>e.type==='明確引用').length,1); assert.deepEqual(g.earliest,['a']);assert.match(g.caveat,/不能證明/);
});
test('AI 建議必須引用已存在來源及逐字原文', () => {
  const evidence=[{id:'a',content:'圖書館平日九點關門。'}];
  const good={source_id:'a',quote:'圖書館平日九點關門。',relation:'支持'};
  const accepted=validateSuggestions([good,good,{...good,source_id:'fake'},{...good,quote:'十一點關門'},{...good,relation:'絕對正確'}],evidence);
  assert.equal(accepted.length,1);assert.equal(accepted[0].quote,good.quote);
});

