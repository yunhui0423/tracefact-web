import {pipeline,env} from './vendor/transformers.web.js';
import {SEMANTIC_CONFIG} from './semantic-config.mjs';
env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
let extractor;
self.onmessage=async({data})=>{
 try{
  if(data.type!=='embed'||typeof data.text!=='string'||data.text.length>12000)throw Error('語意查詢格式無效');
  if(!extractor)extractor=await pipeline('feature-extraction',SEMANTIC_CONFIG.model,{revision:SEMANTIC_CONFIG.revision,dtype:SEMANTIC_CONFIG.dtype,device:'wasm',progress_callback:event=>{
   if(event.status==='progress_total')self.postMessage({type:'progress',id:data.id,percent:Math.round(event.progress)});
  }});
  const output=await extractor([data.text],{pooling:'mean',normalize:true,truncation:true,max_length:SEMANTIC_CONFIG.max_length});
  self.postMessage({id:data.id,type:'result',vector:output.tolist()[0]});
 }catch(e){extractor=null;self.postMessage({id:data.id,type:'error',message:e.message});}
};
