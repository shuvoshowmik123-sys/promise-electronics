import { storage } from './server/storage.js';
import * as repos from './server/repositories/index.js';

console.log("Keys in posRepo:");
console.log(Object.keys(repos.posRepo));
console.log("Does it have getActiveDrawer?", 'getActiveDrawer' in repos.posRepo);
console.log("Type of getActiveDrawer:", typeof (repos.posRepo as any).getActiveDrawer);
console.log("Keys in storage:", Object.keys(storage));
console.log("Is it a function in storage?", typeof storage.getActiveDrawer === 'function');
