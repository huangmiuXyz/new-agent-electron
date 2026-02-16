
import { common } from 'lowlight';

console.log('Keys in common:', Object.keys(common).sort());
console.log('Is html in common?', 'html' in common);
console.log('Is xml in common?', 'xml' in common);
