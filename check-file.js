const fs = require('fs');
const c = fs.readFileSync('templates/prompt-templates.ts', 'utf8');
const lines = c.split('\n');

// For each entry, count systemPrompt backticks and userPromptTemplate backticks
let currentEntry = '';
let currentEntryLine = 0;
let spBt = 0;
let uptBt = 0;
let inSP = false;
let inUPT = false;
let problems = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Entry start
  const entryMatch = line.match(/^'([a-z][a-z0-9-]*)':\s*\{/);
  if (entryMatch) {
    if (currentEntry && (spBt !== 2 || uptBt !== 2)) {
      problems.push(`Entry '${currentEntry}' (line ${currentEntryLine}): SP backticks=${spBt}, UPT backticks=${uptBt}`);
    }
    currentEntry = entryMatch[1];
    currentEntryLine = i + 1;
    spBt = 0;
    uptBt = 0;
    inSP = false;
    inUPT = false;
  }
  
  if (line.startsWith('systemPrompt:')) {
    inSP = true;
    inUPT = false;
    spBt += (line.match(/\x60/g) || []).length;
  } else if (line.startsWith('userPromptTemplate:')) {
    inUPT = true;
    inSP = false;
    uptBt += (line.match(/\x60/g) || []).length;
  } else if (inSP && !line.startsWith('validationRules:') && !line.startsWith('toolPermissions:') && !line.startsWith('retryPolicy:') && !line.startsWith('expectedOutput:')) {
    spBt += (line.match(/\x60/g) || []).length;
  } else if (inUPT && !line.startsWith('validationRules:') && !line.startsWith('toolPermissions:') && !line.startsWith('retryPolicy:') && !line.startsWith('expectedOutput:')) {
    uptBt += (line.match(/\x60/g) || []).length;
  } else if (line.startsWith('validationRules:') || line.startsWith('toolPermissions:') || line.startsWith('retryPolicy:') || line.startsWith('expectedOutput:')) {
    inSP = false;
    inUPT = false;
  }
}

// Check last entry
if (currentEntry && (spBt !== 2 || uptBt !== 2)) {
  problems.push(`Entry '${currentEntry}' (line ${currentEntryLine}): SP backticks=${spBt}, UPT backticks=${uptBt}`);
}

console.log('Problems found:', problems.length);
problems.forEach(p => console.log(' ', p));
