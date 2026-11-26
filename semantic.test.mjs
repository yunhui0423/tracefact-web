import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOfficialRSS,OFFICIAL_FEEDS} from './lib/official-sources.mjs';
import {SEMANTIC_CONFIG,cosine} from './lib/semantic-config.mjs';
import {selectSemantic} from './lib/semantic-search.mjs';
const vector=[1,...Array(383).fill(0)];
test('語意索引需符合模型、維度、內容快照與截止日期',()=>{
 const source={url:'https://example.com/',hash:'v1',published:'2026-01-01'};
 const index={...SEMANTIC_CONFIG,items:[{url:source.url,hash:'v1',vector}]};
 assert.equal(selectSemantic(vector,index,[source]).length,1);
 assert.equal(selectSemantic(vector,index,[{...source,hash:'changed'}]).length,0);
 assert.equal(selectSemantic(vector,index,[source],'2025-12-31').length,0);
 assert.throws(()=>selectSemantic(vector,{...index,revision:'other'},[source]),/版本不符/);
});
test('語意相似度不接受無效數值或反方向向量',()=>{
 assert.equal(cosine(vector,vector),1);assert.equal(cosine(vector,vector.map(x=>-x)),-1);
 assert.equal(cosine(vector,[NaN,...Array(383).fill(0)]),-1);
 const index={...SEMANTIC_CONFIG,items:[{url:'https://example.com/',hash:'v',vector:vector.map(x=>-x)}]};
 assert.equal(selectSemantic(vector,index,[{url:'https://example.com/',hash:'v'}]).length,0);
});
test('官方 RSS 保留出處並標示政府立場與共同來源群',()=>{
 const xml='<rss><channel><item><title>澄清測試</title><link>https://www.mohw.gov.tw/cp-17-test.html</link><description><![CDATA[<p>公開說明段落。</p>]]></description><pubDate>Mon, 09 Nov 2026 10:32:00 GMT</pubDate></item></channel></rss>';
 const [s]=parseOfficialRSS(xml,OFFICIAL_FEEDS[0]);assert.equal(s.source_kind,'official_statement');assert.equal(s.organization_group,'taiwan-government');assert.match(s.content,/公開說明段落/);assert.equal(s.published,'2026-11-09');
 assert.throws(()=>parseOfficialRSS(xml.replace('https://www.mohw.gov.tw/cp-17-test.html','javascript:alert(1)'),OFFICIAL_FEEDS[0]));
 assert.throws(()=>parseOfficialRSS('<!DOCTYPE rss><rss/>',OFFICIAL_FEEDS[0]));
});
