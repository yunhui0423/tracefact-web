import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {embed,disposeModel} from './model-runtime.mjs';
import {SEMANTIC_CONFIG,cosine} from '../lib/semantic-config.mjs';
import {rank,tokens} from '../lib/engine.mjs';
const root=new URL('../',import.meta.url),cache=new URL('benchmark-cache/',root);mkdirSync(cache,{recursive:true});
const metadata=await(await fetch('https://huggingface.co/api/datasets/IKMLab-team/cfever')).json();
if(!/^[0-9a-f]{40}$/.test(metadata.sha))throw Error('Dataset revision missing');
const file=new URL('dev-'+metadata.sha+'.jsonl',cache);
if(!existsSync(file)){const response=await fetch(`https://huggingface.co/datasets/IKMLab-team/cfever/resolve/${metadata.sha}/dev.jsonl`);if(!response.ok)throw Error('Dataset fetch failed');writeFileSync(file,await response.text());}
const raw=readFileSync(file,'utf8'),rows=raw.trim().split('\n').map(line=>JSON.parse(line));
const gold=row=>[...new Set(row.evidence.flat(2).map(e=>e?.page_title).filter(Boolean))];
const corpus=[...new Set(rows.flatMap(gold))].sort().map((title,i)=>({id:String(i),title,content:title}));
const seen=new Set(),cases=rows.filter(row=>{const key=row.claim.replace(/\s+/g,'');if(!gold(row).length||seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>hash('TraceFact-v1:'+a.id).localeCompare(hash('TraceFact-v1:'+b.id))).slice(0,1000);
if(cases.length<1000)throw Error('Insufficient externally annotated claims');
async function batches(texts){const all=[];for(let i=0;i<texts.length;i+=16){all.push(...await embed(texts.slice(i,i+16)));if(i%160===0)console.log(`Benchmark vectors ${i}/${texts.length}`);}return all;}
const docs=await batches(corpus.map(d=>d.title)),queries=await batches(cases.map(c=>c.claim));
const metrics={semantic:{at1:0,at5:0,mrr:0,accepted5:0,covered:0},bm25:{at1:0,at5:0,mrr:0,covered:0},lexical:{at1:0,at5:0,mrr:0,covered:0}};
const docTokens=corpus.map(d=>tokens(d.title)),avgLength=docTokens.reduce((n,d)=>n+d.length,0)/corpus.length;
function bm25(query){const terms=[...new Set(tokens(query))];return corpus.map((d,j)=>{let score=0;for(const term of terms){const tf=docTokens[j].filter(w=>w===term).length,df=docTokens.filter(t=>t.includes(term)).length;score+=Math.log(1+(corpus.length-df+.5)/(df+.5))*tf*2.2/(tf+1.2*(.25+.75*docTokens[j].length/avgLength));}return {...d,score};}).filter(d=>d.score>0).sort((a,b)=>b.score-a.score);}
const failures=[];
for(let i=0;i<cases.length;i++){
 const expected=new Set(gold(cases[i]));
 const scored=corpus.map((d,j)=>({...d,score:cosine(queries[i],docs[j])})).sort((a,b)=>b.score-a.score);
 const lexical=rank(cases[i].claim,corpus,'',6);
 for(const [kind,list] of [['semantic',scored],['bm25',bm25(cases[i].claim)],['lexical',lexical]]){
  const at=list.findIndex(d=>expected.has(d.title)),m=metrics[kind];
  if(at===0)m.at1++;if(at>=0&&at<5)m.at5++;if(at>=0)m.mrr+=1/(at+1);
  if(kind!=='semantic'&&list.length)m.covered++;
 }
 const accepted=scored.filter(d=>d.score>=Math.max(SEMANTIC_CONFIG.threshold,scored[0].score-SEMANTIC_CONFIG.relative_margin)).slice(0,6);
 if(accepted.length)metrics.semantic.covered++;
 if(accepted.slice(0,5).some(d=>expected.has(d.title)))metrics.semantic.accepted5++;
 if(!scored.slice(0,5).some(d=>expected.has(d.title))&&failures.length<20)failures.push({id:cases[i].id,expected:[...expected],predicted:scored.slice(0,3).map(d=>d.title)});
}
const report={created_at:new Date().toISOString(),experiment:'CFEVER dev：固定抽樣1000個外部標註主張的頁名檢索代理評估',
 source:'https://huggingface.co/datasets/IKMLab-team/cfever',paper:'https://ikmlab.github.io/CFEVER/',dataset_revision:metadata.sha,dev_sha256:hash(raw),sample_seed:'TraceFact-v1',sample_count:cases.length,candidate_page_count:corpus.length,
 sample_ids:cases.map(c=>c.id),model:SEMANTIC_CONFIG,metrics:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,Object.fromEntries(Object.entries(m).map(([name,v])=>[name,Number((v/cases.length).toFixed(4))]))])),
 limitations:['只測標註頁名的檢索，不測句級證據、真假分類或正式網站新聞的準確率。','dev公開且不是盲測；同頁可能有多個改寫主張。','沒有標註頁面的NEI案例排除，不據此聲稱資訊不足判斷能力。','推薦門檻0.65、與最佳候選差距不超過0.08；規則曾以展示案例校正，本報告不作盲測宣稱。','外部標註來自CFEVER；不等同新聘獨立評審完成產品審查。'],failure_examples:failures};
writeFileSync(new URL('site/quality-report.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({samples:report.sample_count,pages:corpus.length,metrics:report.metrics}));
await disposeModel();
function hash(value){return createHash('sha256').update(String(value)).digest('hex');}
