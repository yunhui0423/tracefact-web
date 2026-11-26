import {pipeline,env} from '@huggingface/transformers';
import {fileURLToPath} from 'node:url';
import {SEMANTIC_CONFIG} from '../lib/semantic-config.mjs';
env.cacheDir=fileURLToPath(new URL('../.cache/models/',import.meta.url));
env.allowLocalModels=false;
let model;
export async function disposeModel(){if(model){await model.dispose();model=null;}}
export async function embed(texts){
  if(!model)model=await pipeline('feature-extraction',SEMANTIC_CONFIG.model,{revision:SEMANTIC_CONFIG.revision,dtype:SEMANTIC_CONFIG.dtype,device:'cpu',progress_callback:event=>{if(['initiate','done','ready'].includes(event.status))console.log('Model:',event.status,event.file||'');}});
  const tensor=await model(texts,{pooling:'mean',normalize:true,truncation:true,max_length:SEMANTIC_CONFIG.max_length});
  return tensor.tolist();
}
