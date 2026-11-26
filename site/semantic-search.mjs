import {SEMANTIC_CONFIG,cosine} from './semantic-config.mjs';
export function selectSemantic(vector,index,sources,cutoff='',limit=SEMANTIC_CONFIG.limit){
 if(index.model!==SEMANTIC_CONFIG.model||index.revision!==SEMANTIC_CONFIG.revision||index.dimensions!==SEMANTIC_CONFIG.dimensions||vector.length!==SEMANTIC_CONFIG.dimensions)throw Error('語意索引版本不符，請更新網站');
 const allowed=new Map(sources.filter(s=>!cutoff||(s.published&&s.published<=cutoff)).map(s=>[s.url,s]));
 const ranked=index.items.flatMap(row=>{
  const source=allowed.get(row.url);if(!source||source.hash!==row.hash)return [];
  const score=cosine(vector,row.vector);
  return score>=SEMANTIC_CONFIG.threshold?[{source,similarity:score}]:[];
 }).sort((a,b)=>b.similarity-a.similarity);
 const minimum=Math.max(SEMANTIC_CONFIG.threshold,(ranked[0]?.similarity||0)-SEMANTIC_CONFIG.relative_margin);
 return ranked.filter(item=>item.similarity>=minimum).slice(0,limit);
}
