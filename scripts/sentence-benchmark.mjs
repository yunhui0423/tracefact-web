import {readFileSync,writeFileSync,existsSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {embed,disposeModel} from './model-runtime.mjs';
import {SEMANTIC_CONFIG,cosine} from '../lib/semantic-config.mjs';
import {tokens} from '../lib/engine.mjs';
const root=new URL('../',import.meta.url),cache=new URL('benchmark-cache/',root);mkdirSync(cache,{recursive:true});
const report=JSON.parse(readFileSync(new URL('site/quality-report.json',root),'utf8'));
const dev=readFileSync(new URL(`dev-${report.dataset_revision}.jsonl`,cache),'utf8').trim().split('\n').map(l=>JSON.parse(l));
const byID=new Map(dev.map(row=>[row.id,row])),cases=report.sample_ids.map(id=>byID.get(id));
const references=row=>row.evidence.flat(2).filter(e=>e?.page_title&&Number.isInteger(e.sentence_id));
const pages=[...new Set(cases.flatMap(row=>references(row).map(e=>e.page_title)))].sort(),records=new Map();
for(const name of readdirSync(cache).filter(n=>n.startsWith('wiki-'+report.dataset_revision+'-')&&n.endsWith('.json'))){const data=JSON.parse(readFileSync(new URL(name,cache),'utf8'));for(const entry of data.rows||[])if(!entry.truncated_cells?.includes('lines'))records.set(entry.row.id,entry.row);}
const missing=pages.filter(p=>!records.has(p)),batches=[];for(let i=0;i<missing.length;i+=20)batches.push(missing.slice(i,i+20));let nextBatch=0;
async function load(names){
 const key=hash(names.join('|')),file=new URL(`wiki-${report.dataset_revision}-${key}.json`,cache);
 let data;
 if(existsSync(file))data=JSON.parse(readFileSync(file,'utf8'));
 else{
  const url=new URL('https://datasets-server.huggingface.co/filter');url.search=new URLSearchParams({dataset:'IKMLab-team/cfever',config:'wiki_pages',split:'plain',where:names.map(t=>'"id"=\''+t.replaceAll("'","''")+'\'').join(' OR '),length:'100'});
  let error;for(let attempt=0;attempt<3;attempt++)try{const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Corpus filter returned ${response.status}`);data=await response.json();error=null;break;}catch(e){error=e;console.log('Retrying corpus batch',attempt+1);await new Promise(r=>setTimeout(r,2000));}if(error)throw error;writeFileSync(file,JSON.stringify(data));
 }
 for(const entry of data.rows||[])if(!entry.truncated_cells?.includes('lines'))records.set(entry.row.id,entry.row);
 console.log(`Evidence pages ${records.size}/${pages.length}`);
}
await Promise.all(Array.from({length:3},async()=>{while(nextBatch<batches.length){const index=nextBatch++;await load(batches[index]);}}));
const goldKeys=row=>[...new Set(references(row).map(e=>e.page_title+':'+e.sentence_id))];
const desired=new Set(cases.flatMap(goldKeys)),corpus=new Map();
for(const [title,page] of records){
 const lines=page.lines.split('\n').map(line=>{const index=line.indexOf('\t');return {number:Number(line.slice(0,index)),body:line.slice(index+1).split('\t')[0].trim()};}).filter(l=>Number.isInteger(l.number)&&l.body);
 for(const line of lines.filter((line,i)=>desired.has(title+':'+line.number)||i<2)){const id=title+':'+line.number;corpus.set(id,{id,title,content:line.body});}
}
const docs=[...corpus.values()],eligible=cases.filter(row=>goldKeys(row).some(id=>corpus.has(id)));
if(eligible.length<900)throw Error(`Only ${eligible.length}/1000 claims have resolved gold evidence; report not complete`);
async function vectors(texts){const result=[];for(let i=0;i<texts.length;i+=16){result.push(...await embed(texts.slice(i,i+16)));if(i%320===0)console.log(`Evidence vectors ${i}/${texts.length}`);}return result;}
const docVectors=await vectors(docs.map(d=>d.title+'。'+d.content)),queryVectors=await vectors(eligible.map(c=>c.claim));
const tf=docs.map(d=>{const values=tokens(d.title+' '+d.content),map=new Map();for(const t of values)map.set(t,(map.get(t)||0)+1);return {map,length:values.length};});
const df=new Map();for(const d of tf)for(const term of d.map.keys())df.set(term,(df.get(term)||0)+1);const avg=tf.reduce((n,d)=>n+d.length,0)/tf.length;
const metrics={semantic:{at1:0,at5:0,mrr:0},bm25:{at1:0,at5:0,mrr:0}},failures=[];
for(let i=0;i<eligible.length;i++){
 const expected=new Set(goldKeys(eligible[i])),terms=[...new Set(tokens(eligible[i].claim))];
 const semantic=docs.map((d,j)=>({id:d.id,score:cosine(queryVectors[i],docVectors[j])})).sort((a,b)=>b.score-a.score);
 const lexical=docs.map((d,j)=>{let score=0;for(const term of terms){const n=tf[j].map.get(term)||0;score+=Math.log(1+(docs.length-(df.get(term)||0)+.5)/((df.get(term)||0)+.5))*n*2.2/(n+1.2*(.25+.75*tf[j].length/avg));}return {id:d.id,score};}).sort((a,b)=>b.score-a.score);
 for(const [kind,list] of [['semantic',semantic],['bm25',lexical]]){const at=list.findIndex(d=>expected.has(d.id));if(at===0)metrics[kind].at1++;if(at>=0&&at<5)metrics[kind].at5++;if(at>=0)metrics[kind].mrr+=1/(at+1);}
 if(!semantic.slice(0,5).some(d=>expected.has(d.id))&&failures.length<20)failures.push({id:eligible[i].id,expected:[...expected],predicted:semantic.slice(0,3).map(d=>d.id)});
}
report.sentence_retrieval={experiment:'CFEVER dev 外部標註證據句檢索（受限候選池）',sample_count:eligible.length,requested:1000,unresolved:1000-eligible.length,candidate_sentence_count:docs.length,page_count:records.size,corpus_sha256:hash(JSON.stringify(docs)),metrics:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,Object.fromEntries(Object.entries(m).map(([n,v])=>[n,Number((v/eligible.length).toFixed(4))]))])),limitations:['候選池包含樣本的標註句與每個相關頁面前兩個非空句，並非全維基百科或全網搜尋。','Hit@5 計算至少找到一個標註證據句，不是找齊完整多句證據集合，也不是真假分類。','公開dev不是盲測；未解析出標註句的樣本數另行揭露。','Wiki句子僅作離線評估，不加入新聞來源資料庫。'],failure_examples:failures};
writeFileSync(new URL('site/quality-report.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report.sentence_retrieval));
await disposeModel();
function hash(s){return createHash('sha256').update(s).digest('hex');}
