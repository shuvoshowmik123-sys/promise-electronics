const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '../client/src/pages');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // Remove import statement
    content = content.replace(/import\s*{\s*PublicLayout\s*}\s*from\s*(["'])@\/components\/layout\/PublicLayout\1;?\s*?\n/g, '');

    // Replace <PublicLayout> with <>
    content = content.replace(/<PublicLayout>/g, '<>');

    // Replace </PublicLayout> with </>
    content = content.replace(/<\/PublicLayout>/g, '</>');

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated: ${path.basename(filePath)}`);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            processFile(fullPath);
        }
    }
}

console.log('Starting PublicLayout cleanup...');
walkDir(pagesDir);
console.log('Done!');
