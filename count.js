const fs = require('fs');
const code = fs.readFileSync('js/club_hyperrealistic.js', 'utf8');

const regex = new RegExp(`(\\s*)updateAnimations\\s*\\([^\\)]*\\)\\s*\\{`, '');
const match = regex.exec(code);
if (match) {
    const startIndex = match.index;
    let openBraces = 0;
    let i = startIndex + match[0].length;
    let inString = false;
    let stringChar = '';
    openBraces = 1;

    while(i < code.length && openBraces > 0) {
        let char = code[i];
        if (inString) {
            if (char === stringChar && code[i-1] !== '\\') inString = false;
        } else {
            if (char === "'" || char === '"' || char === "`") {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                openBraces++;
            } else if (char === '}') {
                openBraces--;
            } else if (char === '/' && code[i+1] === '*') {
                let j = code.indexOf('*/', i+2);
                if (j !== -1) {
                    i = j + 1;
                }
            } else if (char === '/' && code[i+1] === '/') {
                let j = code.indexOf('\n', i+2);
                if (j !== -1) {
                    i = j;
                } else {
                    i = code.length;
                }
            }
        }
        i++;
    }
    
    console.log('updateAnimations start index:', startIndex, 'end index:', i);
    console.log('updateAnimations lines: ', code.substring(startIndex, i).split('\n').length);
}
