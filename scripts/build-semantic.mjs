import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {embed,disposeModel} from './model-runtime.mjs';
import {SEMANTIC_CONFIG,semanticText} from '../lib/semantic-config.mjs';
import {fingerprint} from '../lib/engine.mjs';
const root=new URL('../',import.meta.url),feed=JSON.parse(readFileSync(new URL('site/feed.json',root),'utf8'));
const items=[];
for(let start=0;start<feed.sources.length;start+=8){
 const batch=feed.sources.slice(start,start+8),vectors=await embed(batch.map(semanticText));
 batch.forEach((source,i)=>items.push({url:source.url,hash:fingerprint(source.content),vector:vectors[i].map(x=>Math.round(x*1e6)/1e6)}));
 console.log(`Indexed ${items.length}/${feed.sources.length}`);
}
writeFileSync(new URL('site/semantic-index.json',root),JSON.stringify({...SEMANTIC_CONFIG,updated_at:feed.updated_at,items}));
const vendor=new URL('site/vendor/',root);mkdirSync(vendor,{recursive:true});
// The web.* build leaves bare npm imports; static module workers need the bundled CDN build.
copyFileSync(new URL('node_modules/@huggingface/transformers/dist/transformers.min.js',root),new URL('transformers.web.js',vendor));
for(const name of readdirSync(new URL('node_modules/onnxruntime-web/dist/',root)))if(/\.wasm$|^ort-wasm.*\.mjs$/.test(name))copyFileSync(new URL('node_modules/onnxruntime-web/dist/'+name,root),new URL(name,vendor));
for(const name of ['semantic-config.mjs','semantic-search.mjs'])copyFileSync(new URL('lib/'+name,root),new URL('site/'+name,root));
const runtimePackage=JSON.parse(readFileSync(new URL('node_modules/onnxruntime-web/package.json',root),'utf8'));if(runtimePackage.license!=='MIT')throw Error('Runtime license changed; review required');
writeFileSync(new URL('site/vendor/THIRD-PARTY-LICENSES.txt',root),readFileSync(new URL('node_modules/@huggingface/transformers/LICENSE',root),'utf8')+'\n\n'+readFileSync(new URL('licenses/ONNXRuntime-MIT.txt',root),'utf8'));
await disposeModel();
