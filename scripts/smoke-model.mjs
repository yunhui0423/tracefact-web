import {embed} from './model-runtime.mjs';
import {cosine} from '../lib/semantic-config.mjs';
const vectors=await embed(['雞蛋殼顏色與營養價值無關','蛋殼深淺不決定營養','La couleur de la coquille ne détermine pas la valeur nutritive des œufs.','舊金山竊盜法律']);
console.log(JSON.stringify({dimensions:vectors[0].length,paraphrase:cosine(vectors[0],vectors[1]),french:cosine(vectors[0],vectors[2]),unrelated:cosine(vectors[0],vectors[3])}));
