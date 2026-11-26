import {selectSemantic} from './semantic-search.mjs';
let worker,indexPromise,next=0;const pending=new Map();
export function resetSemantic(){worker?.terminate();worker=null;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('語意工作已停止'));}pending.clear();}
export async function semanticSearch(query,sources,cutoff,onProgress=()=>{}){
 if(!('Worker' in window)||!('WebAssembly' in window))throw Error('此瀏覽器不支援裝置端模型，請改用關鍵詞模式');
 if(!worker){worker=new Worker(new URL('./semantic-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;if(data.type==='progress'){p.progress(data.percent);return;}clearTimeout(p.timer);pending.delete(data.id);data.type==='result'?p.resolve(data.vector):p.reject(Error(data.message));};
  worker.onerror=()=>{resetSemantic();};
 }
 if(!indexPromise)indexPromise=fetch(new URL('./semantic-index.json',import.meta.url),{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('語意索引未就緒');return r.json();}).catch(e=>{indexPromise=null;throw e;});
 const id=++next;
 const vector=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{resetSemantic();reject(Error('模型下載或執行逾時，請重試或切回關鍵詞模式'));},180000);pending.set(id,{resolve,reject,timer,progress:onProgress});worker.postMessage({type:'embed',id,text:query});});
 return selectSemantic(vector,await indexPromise,sources,cutoff);
}
