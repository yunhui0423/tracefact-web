import {readFileSync} from 'node:fs';
import {rank} from '../lib/engine.mjs';
const fixture=JSON.parse(readFileSync(new URL('../fixtures/relevance-evaluation.json',import.meta.url),'utf8'));
const results=fixture.cases.map(c=>{const actual=rank(c.query,fixture.sources).map(s=>s.id);return {...c,actual,pass:JSON.stringify([...actual].sort())===JSON.stringify([...c.expected].sort())};});
console.log(JSON.stringify({scope:fixture.description,snapshot_at:fixture.snapshot_at,passed:results.filter(r=>r.pass).length,total:results.length,results},null,2));
if(results.some(r=>!r.pass))process.exitCode=1;
