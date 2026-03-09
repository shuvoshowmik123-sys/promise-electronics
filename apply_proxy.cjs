const fs = require('fs');
const path = require('path');

const storageTsPath = path.join(__dirname, 'server', 'storage.ts');
let content = fs.readFileSync(storageTsPath, 'utf8');

const replaceRegex = /export\s+class\s+DatabaseStorage\s+implements\s+IStorage\s*\{[\s\S]*\}\s*export\s+const\s+storage\s*=\s*new\s+DatabaseStorage\(\);\s*/;

if (replaceRegex.test(content)) {
    let newContent = content.replace(replaceRegex, `
import * as repos from './repositories/index.js';

const allRepoMethods: Record<string, Function> = {};
for (const repo of Object.values(repos)) {
    for (const [key, value] of Object.entries(repo as any)) {
        if (typeof value === 'function') {
            allRepoMethods[key] = value as Function;
        }
    }
}

// Ensure the IDE proxy works transparently across all repository domains
export const storage: IStorage = new Proxy({} as IStorage, {
    get(target, prop, receiver) {
        if (typeof prop === 'string' && allRepoMethods[prop]) {
            return allRepoMethods[prop];
        }
        // Fallback or pass-through for symbols like then()
        return Reflect.get(target, prop, receiver);
    }
});
`);

    fs.writeFileSync(storageTsPath, newContent);
    console.log('Successfully applied Proxy to storage.ts');
} else {
    console.error('Could not find existing DatabaseStorage to replace.');
}
