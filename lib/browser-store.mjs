// IndexedDB belongs to this origin and browser profile. No records are uploaded.
let database;
async function openDB(){
  if(!database)database=new Promise((resolve,reject)=>{
    const r=indexedDB.open('tracefact-web-v1',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('documents',{keyPath:'id'});
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('無法開啟瀏覽器儲存空間，請允許網站保存資料'));
  });return database;
}
async function transaction(mode,work){
  const db=await openDB();return new Promise((resolve,reject)=>{
    const tx=db.transaction('documents',mode),store=tx.objectStore('documents');let result;
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(new Error('儲存失敗，可能空間不足；請先下載報告備份'));tx.onerror=()=>{};
    work(store,value=>{result=value;});
  });
}
export function browserStore(){
  const all=kind=>transaction('readonly',(s,done)=>{const r=s.getAll();r.onsuccess=()=>done(r.result.filter(x=>x.kind===kind).map(x=>x.payload));});
  return {
    sources:()=>all('source'),
    get:id=>transaction('readonly',(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result?.kind==='case'?r.result.payload:undefined);}),
    list:async()=>(await all('case')).sort((a,b)=>b.created.localeCompare(a.created)).map(c=>({id:c.id,title:c.title,created:c.created})),
    addSources(items,automatic=false){return transaction('readwrite',(s,done)=>{
      const request=s.getAll();request.onsuccess=()=>{
        const map=new Map(request.result.filter(x=>x.kind==='source').map(x=>[x.payload.url,x.payload]));
        const counts={added:0,updated:0,unchanged:0};
        for(const item of items){const source=structuredClone(item),old=map.get(source.url);
          if(old){if(!automatic||!old.automatic||old.hash===source.hash){counts.unchanged++;continue;}source.id=old.id;counts.updated++;}
          else{if(map.size>=1000){txFail();return;}counts.added++;}
          map.set(source.url,source);s.put({id:source.id,kind:'source',payload:source});
        }done(counts);
        function txFail(){s.transaction.abort();}
      };
    });},
    async save(c,action='建立案件',details={}){
      c.checklist=buildChecklist(c);
      const audit={id:crypto.randomUUID(),case_id:c.id,created:new Date().toISOString(),action,payload:details};
      await transaction('readwrite',(s,done)=>{s.put({id:c.id,kind:'case',payload:c});s.put({id:audit.id,kind:'audit',payload:audit});done(true);});
    },
    audit:async id=>(await all('audit')).filter(a=>a.case_id===id).sort((a,b)=>a.created.localeCompare(b.created))
  };
}
