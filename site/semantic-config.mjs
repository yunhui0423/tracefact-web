export const SEMANTIC_CONFIG=Object.freeze({
  library:'@huggingface/transformers',library_version:'4.3.2',
  model:'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
  revision:'2c4055b12046f11709e9df2c122e59ffbdc2f900',
  dimensions:384,dtype:'q8',max_length:128,threshold:0.65,relative_margin:0.08,limit:6,
  description:'多語言句向量相關性；不判定支持、反駁或真假。'
});
export function semanticText(source){return [source.title,source.content?.startsWith(source.title)?source.content.slice(source.title.length).trim():source.content].filter(Boolean).join('。').slice(0,700);}
export function cosine(a,b){if(!Array.isArray(a)&&!ArrayBuffer.isView(a))throw Error('Invalid vector');if(a.length!==b.length||!a.length)return -1;let dot=0,x=0,y=0;for(let i=0;i<a.length;i++){if(!Number.isFinite(a[i])||!Number.isFinite(b[i]))return -1;dot+=a[i]*b[i];x+=a[i]*a[i];y+=b[i]*b[i];}return x&&y?dot/Math.sqrt(x*y):-1;}
