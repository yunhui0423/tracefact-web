import test from 'node:test';
import assert from 'node:assert/strict';
import {rank,retrievalProfile,sourcePassage,validEvidenceQuote} from './lib/engine.mjs';
import {searchTerms,publicSourceClient} from './lib/public-sources.mjs';
import {rank as browserRank} from './site/backend.mjs';
const wrong=[
 {id:'theft',title:'【錯誤】網傳「美國舊金山市政府在路邊立牌，提醒偷東西每回不能超過美金950元」？',content:'網傳偷東西不能超過950美元，相關說法錯誤。'},
 {id:'heart',title:'網傳「心肌梗塞發作時不能平躺、可服用速效救心丸」說法，部分急救觀念有誤',content:'心肌梗塞發作時不能平躺的網傳說法。'}
];
test('使用者案例：沒電就不能活不得推薦竊盜或心肌梗塞報告',()=>{
 assert.deepEqual(rank('沒電就不能活',wrong),[]);
 assert.deepEqual(browserRank('沒電就不能活',wrong),[]);
 assert.equal(retrievalProfile('沒電就不能活').needs_context,true);
 assert.deepEqual(searchTerms('沒電就不能活'),[]);
});
test('只有不能、可以、是否等語法片段時不發送搜尋',async()=>{
 let requests=0;const client=publicSourceClient({fetcher:async()=>{requests++;throw Error('unexpected');}});
 for(const query of ['不能','就不能','是不是真的','這樣可以嗎']){
  assert.equal(rank(query,wrong).length,0);
 }
 await client.collect('沒電就不能活');assert.equal(requests,0);
});
test('共享一個泛用詞不足以連結不同主題',()=>{
 assert.deepEqual(rank('雞蛋顏色與營養價值',[
  {id:'a',title:'手機螢幕顏色異常',content:'手機螢幕的顏色設定'},
  {id:'b',title:'雞蛋殼顏色與營養價值無關',content:'雞蛋顏色與營養沒有必然關係'}
 ]).map(x=>x.id),['b']);
});
test('相反說法仍保留為候選，相關性不取代真假判定',()=>{
 const sources=[{id:'a',title:'雞蛋顏色不能代表營養價值',content:'雞蛋顏色與營養價值無關。'}];
 const result=rank('雞蛋顏色代表營養價值',sources);
 assert.equal(result.length,1);assert.equal(result[0].relation,'待確認');
 assert.ok(result[0].matched_terms.includes('雞蛋'));
});
test('同一原站回應中的無關報告仍須經過完整詞篩選',async()=>{
 const client=publicSourceClient({fetcher:async()=>new Response(JSON.stringify(wrong.map((s,i)=>({id:i+1,title:{rendered:s.title},excerpt:{rendered:s.content},date:'2026-11-01T10:00:00',link:'https://tfc-taiwan.org.tw/fact-check-reports/test-'+i}))),{headers:{'content-type':'application/json'}})});
 assert.deepEqual((await client.collect('雞蛋顏色與營養價值')).sources,[]);
});
test('自動報告只引用摘要內文，不重複把標題當證據',()=>{
 const source={id:'a',automatic:true,title:'雞蛋顏色不能代表營養價值',content:'雞蛋顏色不能代表營養價值\n\n蛋殼顏色取決於品種，營養價值並不取決於殼色。'};
 const [found]=rank('雞蛋顏色與營養價值',[source]);
 assert.equal(found.quote,'蛋殼顏色取決於品種，營養價值並不取決於殼色。');
 assert.equal(validEvidenceQuote({...source,quote:source.title}),false);
 assert.equal(validEvidenceQuote({...source,quote:found.quote}),true);
});
test('只有標題的報告可作線索，不能產生內文引文',()=>{
 const source={id:'a',automatic:true,title:'雞蛋顏色與營養價值',content:'雞蛋顏色與營養價值'};
 const [found]=rank('雞蛋顏色',[source]);assert.equal(found.quote,'');assert.equal(found.excerpt_available,false);
 assert.equal(sourcePassage(source),'');
});
test('非自動匯入的段落仍可作逐字引文',()=>{
 const source={title:'圖書館',content:'圖書館平日九點關門。'};
 assert.equal(sourcePassage(source),source.content);assert.equal(validEvidenceQuote({...source,quote:source.content}),true);
});
