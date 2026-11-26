import {writeFileSync} from 'node:fs';
import {fromPost} from '../lib/public-sources.mjs';
import {OFFICIAL_FEEDS,parseOfficialRSS} from '../lib/official-sources.mjs';
const sources=[];
for(let page=1;page<=3;page++){
  const url=new URL('https://tfc-taiwan.org.tw/wp-json/wp/v2/fact-check-reports');
  url.search=new URLSearchParams({per_page:'100',page:String(page),_fields:'id,title,link,date,modified,excerpt'});
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Public source returned ${response.status}; keeping previous published site`);
  const posts=await response.json();if(!Array.isArray(posts))throw new Error('Invalid source payload');
  sources.push(...posts.map(fromPost));if(posts.length<100)break;
}
if(!sources.length)throw new Error('Empty source feed');
const providers=[{id:'tfc',name:'台灣事實查核中心',kind:'fact_check',count:sources.length,status:'ok'}];
for(const provider of OFFICIAL_FEEDS){
 const response=await fetch(provider.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`${provider.name} returned ${response.status}; keeping previous published site`);
 const items=parseOfficialRSS(await response.text(),provider);if(!items.length)throw Error(`${provider.name} feed is empty`);
 sources.push(...items);providers.push({id:provider.id,name:provider.name,kind:'official_statement',count:items.length,status:'ok'});
}
const unique=[...new Map(sources.map(s=>[s.url,s])).values()];
writeFileSync(new URL('../site/feed.json',import.meta.url),JSON.stringify({updated_at:new Date().toISOString(),providers,sources:unique}));
console.log(`Prepared ${sources.length} public report titles/excerpts; no private records`);
