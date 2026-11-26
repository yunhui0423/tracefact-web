import {XMLParser} from 'fast-xml-parser';
import {plainHTML} from './public-sources.mjs';
export const OFFICIAL_FEEDS=[
 {id:'mohw',name:'衛生福利部',url:'https://www.mohw.gov.tw/www/rss-17-1.html',license:'https://www.mohw.gov.tw/cp-81-155-1.html'},
 {id:'ey',name:'行政院彙整／原發布部會',url:'https://www.ey.gov.tw/RSS_Content.aspx?ModuleType=7',license:'https://www.ey.gov.tw/Page/2EADDBFEDDB6357E'}
];
export function parseOfficialRSS(xml,provider){
 if(xml.length>4_000_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('不接受含實體宣告或過大的 RSS');
 const doc=new XMLParser({ignoreAttributes:true,processEntities:false}).parse(xml),items=doc.rss?.channel?.item;
 if(!items)throw Error('RSS 格式已變更');
 return (Array.isArray(items)?items:[items]).slice(0,150).map(item=>{
  const url=new URL(String(item.link));if(!['https:','http:'].includes(url.protocol)||!(url.hostname.endsWith('.gov.tw')||url.hostname==='www.edu.tw')||url.username||url.password)throw Error('官方資料網址不在允許範圍');
  const title=plainHTML(item.title).slice(0,250),excerpt=plainHTML(item.description||item['dc:description']||'').slice(0,1800);
  if(!title)throw Error('官方報告缺少標題');
  const date=new Date(item.pubDate),published=Number.isFinite(date.getTime())?date.toISOString().slice(0,10):'';
  return {title,url:url.href,published,content:title+(excerpt?'\n\n'+excerpt:''),language:'zh-TW',cites:[],demo:false,automatic:true,
   provider:provider.id,provider_name:provider.id==='mohw'?'衛生福利部':`官方澄清（${url.hostname}）`,publisher_host:url.hostname,
   source_kind:'official_statement',organization_group:'taiwan-government',aggregation_provider:provider.name,
   content_kind:excerpt?'官方 RSS 標題與段落（非全文）':'官方 RSS 僅提供標題；需開原文',
   license:`政府資料開放授權條款第1版，出處：${provider.name}；原始發布日期：${published||'未提供'}。${provider.license}`};
 });
}
