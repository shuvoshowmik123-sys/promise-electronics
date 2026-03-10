const fs = require('fs');
const code = fs.readFileSync('client/src/pages/admin/bento/tabs/CorporateRepairsTab.tsx', 'utf8');
let stack = [];
let lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes('//')) line = line.substring(0, line.indexOf('//'));
    for (let j = 0; j < line.length; j++) {
        let char = line[j];
        if (char === '(' || char === '{' || char === '[') {
            stack.push({ char, line: i + 1 });
        } else if (char === ')' || char === '}' || char === ']') {
            if (stack.length === 0) {
                console.log('Extra closing bracket', char, 'at line', i + 1);
                process.exit(1);
            }
            let last = stack.pop();
            if ((char === ')' && last.char !== '(') ||
                (char === '}' && last.char !== '{') ||
                (char === ']' && last.char !== '[')) {
                console.log('Mismatched closing bracket', char, 'at line', i + 1, 'expected to close', last.char, 'from line', last.line);
                process.exit(1);
            }
        }
    }
}
if (stack.length > 0) {
    console.log('Unclosed brackets:', stack[stack.length - 1]);
} else {
    console.log('All matched!');
}
