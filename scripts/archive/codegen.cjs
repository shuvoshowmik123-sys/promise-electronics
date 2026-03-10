const fs = require('fs');
const path = require('path');

const storageTsPath = path.join(__dirname, 'server', 'storage.ts');
let content = fs.readFileSync(storageTsPath, 'utf8');

// 1. Gather all methods from repositories
const repoPath = path.join(__dirname, 'server', 'repositories');
const files = fs.readdirSync(repoPath).filter(f => f.endsWith('.repository.ts'));

const methodToRepo = new Map();
const duplicates = [];

files.forEach(file => {
    const repoContent = fs.readFileSync(path.join(repoPath, file), 'utf8');
    const methodRegex = /export\s+async\s+function\s+([a-zA-Z0-9_]+)\s*\(/g;
    let match;
    while ((match = methodRegex.exec(repoContent)) !== null) {
        const method = match[1];
        const repoName = file.replace('.repository.ts', 'Repo').replace(/-([a-z])/g, g => g[1].toUpperCase());
        if (methodToRepo.has(method)) {
            duplicates.push(`${method} in ${repoName} and ${methodToRepo.get(method)}`);
        } else {
            methodToRepo.set(method, repoName);
        }
    }
});

console.log('Duplicates:', duplicates);

// Now read IStorage and extract method signatures
const iStorageRegex = /export\s+interface\s+IStorage\s*\{([\s\S]*?)\}/;
const storageMatch = iStorageRegex.exec(content);
if (!storageMatch) {
    console.error("Could not find IStorage interface.");
    process.exit(1);
}

const interfaceBody = storageMatch[1];
const methodLines = interfaceBody.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'));

let generatedClass = `export class DatabaseStorage implements IStorage {\n`;

methodLines.forEach(line => {
    const sigMatch = line.match(/^([a-zA-Z0-9_]+)\s*\((.*?)\)\s*:\s*(.*);$/);
    if (sigMatch) {
        const methodName = sigMatch[1];
        const argsStr = sigMatch[2];

        const argNames = [];
        if (argsStr.trim()) {
            let depth = 0;
            let currentArg = "";
            for (let i = 0; i < argsStr.length; i++) {
                const c = argsStr[i];
                if (c === '{' || c === '<' || c === '(' || c === '[') depth++;
                else if (c === '}' || c === '>' || c === ')' || c === ']') depth--;
                else if (c === ',' && depth === 0) {
                    argNames.push(currentArg.trim());
                    currentArg = "";
                    continue;
                }
                currentArg += c;
            }
            if (currentArg.trim()) argNames.push(currentArg.trim());
        }

        const callArgs = argNames.map(arg => {
            const nameMatch = arg.match(/^([a-zA-Z0-9_]+)\s*(\?|\:|$)/);
            return nameMatch ? nameMatch[1] : arg;
        }).join(', ');

        const expectedRepo = methodToRepo.get(methodName);
        if (expectedRepo) {
            generatedClass += `  async ${methodName}(${argsStr}) { return ${expectedRepo}.${methodName}(${callArgs}); }\n`;
        } else {
            generatedClass += `  async ${methodName}(${argsStr}) { throw new Error("Method ${methodName} not found in any repository"); }\n`;
            console.log("Missing repo method: " + methodName);
        }
    }
});

generatedClass += `}\n\nexport const storage = new DatabaseStorage();\n`;

const replaceRegex = /export\s+class\s+DatabaseStorage\s+implements\s+IStorage\s*\{[\s\S]*?\}\s*export\s+const\s+storage\s*=\s*new\s+DatabaseStorage\(\);\s*/;

if (replaceRegex.test(content)) {
    let newContent = content.replace(replaceRegex, generatedClass);
    const repoImport = `import { userRepo, customerRepo, inventoryRepo, jobRepo, serviceRequestRepo, attendanceRepo, financeRepo, settingsRepo, notificationRepo, orderRepo, posRepo, analyticsRepo, corporateRepo, hrRepo, warrantyRepo, systemRepo } from './repositories/index.js';\n`;

    if (!newContent.includes('import { userRepo')) {
        const importsEnd = newContent.lastIndexOf('import ');
        const endOfLine = newContent.indexOf('\n', importsEnd);
        newContent = newContent.slice(0, endOfLine + 1) + repoImport + newContent.slice(endOfLine + 1);
    }

    fs.writeFileSync(path.join(__dirname, 'server', 'storage.new.ts'), newContent);
    console.log('Successfully generated DatabaseStorage facade to storage.new.ts.');
} else {
    console.error('Could not find existing DatabaseStorage to replace.');
}
