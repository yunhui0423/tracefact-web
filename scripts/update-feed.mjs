import {writeFileSync} from 'node:fs';
import {fromPost} from '../lib/public-sources.mjs';
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
writeFileSync(new URL('../site/feed.json',import.meta.url),JSON.stringify({updated_at:new Date().toISOString(),sources}));
console.log(`Prepared ${sources.length} public report titles/excerpts; no private records`);
