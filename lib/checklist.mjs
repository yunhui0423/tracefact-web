import { domainToUnicode } from 'node:url';

const CUES=['震驚','驚爆','快轉傳','趕快轉','不轉','百分之百','保證有效','立刻分享','被隱瞞','救命','緊急通知'];
const KNOWN=['tfc-taiwan.org.tw','mygopen.com','cna.com.tw','sinica.edu.tw'];
export function inspectLinks(value) {
  return [...new Set(value.match(/https?:\/\/[^\s<>"'，。！？）)]+/g)||[])].slice(0,20).map(raw=>{
    try {
      const u=new URL(raw),host=u.hostname.toLowerCase(),unicode=domainToUnicode(host),flags=[];
      if(u.protocol==='http:')flags.push('非 HTTPS；不代表內容必定不實');
      if(u.username||u.password)flags.push('網址含使用者資訊，實際主機請看 @ 之後');
      if(host.includes('xn--'))flags.push(`國際化網域：${unicode}；請核對字形`);
      for(const known of KNOWN)if(host.includes(known)&&host!==known&&!host.endsWith('.'+known))flags.push(`網址含 ${known}，但實際主機並非該機構網域`);
      return {url:raw,host,flags};
    }catch{return {url:raw,host:'無法解析',flags:['網址格式無法解析']};}
  });
}
export function buildChecklist(c) {
  const claims=c.claims||[], cues=CUES.filter(x=>c.input.includes(x));
  if(/[!！?？]{3,}/.test(c.input))cues.push('連續驚嘆號／問號');
  const links=inspectLinks(c.input), warnings=links.flatMap(x=>x.flags.map(f=>`${x.host}：${f}`));
  const evidence=[...new Map(claims.flatMap(cl=>cl.evidence.map(e=>[e.id,e]))).values()];
  const orgs=[...new Set(evidence.filter(e=>!e.demo).map(e=>e.provider_name||new URL(e.url).hostname))];
  const pending=claims.filter(cl=>!cl.reviewed || ['證據不足','證據衝突'].includes(cl.verdict)).length;
  const refuted=claims.some(cl=>cl.reviewed&&cl.verdict==='反駁');
  const numeric=/\d|百分之|[一二三四五六七八九十]+[年月日成倍]/.test(c.input);
  const authority=/研究|專家|醫師|教授|科學|數據/.test(c.input);
  const pause=pending>0||orgs.length<3;
  return {
    method:'五項查核提示；不計算真假百分比，所有自動提示均非真偽認定。',
    items:[
      {key:'skepticism',title:'保持懷疑態度',status:cues.length?'發現需留意用語':'未見明顯語氣線索',details:[cues.length?`偵測到：${cues.join('、')}。`:'未偵測到預設的聳動／催促轉傳詞彙。','情緒或聳動語氣只是一項線索，不能據此判定訊息為假。']},
      {key:'source',title:'調查消息來源',status:warnings.length?'網址需要仔細核對':links.length?'已辨識網址，仍需核對作者':'原始發布來源待補',details:[links.length?`輸入網址主機：${links.map(x=>x.host).join('、')}。`:'輸入未附原始發布網址；平台找到的查核報告不等於訊息原始出處。',...warnings,'具名機構、作者身分與過往紀錄仍需查證；網域名稱本身不保證公信力。']},
      {key:'reasoning',title:'檢視內容合理性',status:pending?'數據與脈絡待核對':'已記錄人工判讀',details:[`已拆成 ${claims.length} 個主張，${pending} 個仍待確認或證據不足／衝突。`,numeric?'包含數字或時間資訊，請比對年份、母體、單位及適用範圍。':'請確認人物、時間、地點、對象與限制條件，避免只憑常理判斷。',authority?'提及研究／專家／數據，請追查具名者、研究原文與是否符合主張。':'若涉及科學或醫療說法，仍需原始研究或具資格的專業依據。']},
      {key:'crosscheck',title:'多方交叉比對',status:orgs.length<3?'尚待跨機構比對':'尚待確認來源獨立性',details:[`目前候選有 ${evidence.length} 份報告，來自 ${orgs.length} 個機構／網站：${orgs.join('、')||'尚無真實來源'}。`,'可把 3～4 個可靠且獨立來源當作查核目標；相同機構的多篇報告、轉載及互相引用不能直接當成獨立證據。','來源數量不是判真門檻；仍須確認每個來源是否直接支持主張。'],organizations:orgs,independence_confirmed:false},
      {key:'sharing',title:'先查證，不亂傳',status:refuted?'避免原樣轉傳':pause?'先查證，暫緩轉傳':'分享時附查核依據',details:[refuted?'已有人工作成反駁結論，如需澄清請分享查核依據，避免原樣擴散。':pause?'仍有待確認主張或缺乏跨機構比對，建議暫緩轉傳。':'已有人工判讀紀錄，分享前仍應附來源、日期與未解決的限制。','平台不會自動轉發訊息，也不以單一分數保證可分享。']}
    ]
  };
}
