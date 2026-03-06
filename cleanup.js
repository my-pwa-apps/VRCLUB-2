const fs = require('fs');
const code = fs.readFileSync('js/club_hyperrealistic.js', 'utf8');

function removeMethod(str, methodName) {
    const regex = new RegExp(`(\\s*)${methodName}\\s*\\([^\\)]*\\)\\s*\\{`, '');
    const match = regex.exec(str);
    if (!match) return str;
    
    console.log('Found ' + methodName);
    const startIndex = match.index;
    let openBraces = 0;
    let i = startIndex + match[0].length;
    let inString = false;
    let stringChar = '';
    openBraces = 1;
    
    while(i < str.length && openBraces > 0) {
        let char = str[i];
        if (inString) {
            if (char === stringChar && str[i-1] !== '\\') inString = false;
        } else {
            if (char === "'" || char === '"' || char === "`") {
                inString = true;
                stringChar = char;
            } else if (char === '{') {
                openBraces++;
            } else if (char === '}') {
                openBraces--;
            } else if (char === '/' && str[i+1] === '*') {
                let j = str.indexOf('*/', i+2);
                if (j !== -1) {
                    i = j + 1;
                }
            } else if (char === '/' && str[i+1] === '/') {
                let j = str.indexOf('\n', i+2);
                if (j !== -1) {
                    i = j;
                } else {
                    i = str.length;
                }
            }
        }
        i++;
    }
    
    if (openBraces === 0) {
        console.log('Removed ' + methodName + ' (' + (i - startIndex) + ' chars)');
        return str.substring(0, startIndex) + str.substring(i);
    } else {
        console.log('Failed to match braces for ' + methodName);
    }
    return str;
}

let newCode = code;
['createMirrorBall'].forEach(m => {
    newCode = removeMethod(newCode, m);
});

fs.writeFileSync('js/club_hyperrealistic.js', newCode);
console.log('Done cleaning up methods.');
