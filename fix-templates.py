import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    result = []
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        # Check for systemPrompt without backtick
        if re.match(r'\s+systemPrompt:\s+[^`]', line) and not re.match(r'\s+systemPrompt:\s+`', line):
            # Add opening backtick after "systemPrompt: "
            new_line = re.sub(r'(systemPrompt:\s+)', r'\1`', line)
            result.append(new_line)
            i += 1
            
            # Collect lines until we find one ending with , that's followed by userPromptTemplate or validationRules
            while i < len(lines):
                next_line = lines[i]
                # Check if this line ends with , and next line starts a new property
                stripped = next_line.rstrip()
                if stripped.endswith(',') and i + 1 < len(lines):
                    next_stripped = lines[i+1].strip()
                    if (next_stripped.startswith('userPromptTemplate:') or 
                        next_stripped.startswith('validationRules:') or
                        next_stripped.startswith('toolPermissions:') or
                        next_stripped.startswith('retryPolicy:') or
                        next_stripped.startswith('expectedOutput:') or
                        next_stripped.startswith('}')):
                        # This is the last line - add closing backtick before comma
                        result.append(stripped[:-1] + '`,')
                        i += 1
                        break
                    else:
                        result.append(next_line)
                        i += 1
                elif stripped.endswith(',') and i + 1 == len(lines):
                    result.append(stripped[:-1] + '`,')
                    i += 1
                    break
                else:
                    result.append(next_line)
                    i += 1
        # Check for userPromptTemplate without backtick
        elif re.match(r'\s+userPromptTemplate:\s+[^`]', line) and not re.match(r'\s+userPromptTemplate:\s+`', line):
            # Add opening backtick after "userPromptTemplate: "
            new_line = re.sub(r'(userPromptTemplate:\s+)', r'\1`', line)
            result.append(new_line)
            i += 1
            
            # Collect lines until we find one ending with , that's followed by validationRules etc.
            while i < len(lines):
                next_line = lines[i]
                stripped = next_line.rstrip()
                if stripped.endswith(',') and i + 1 < len(lines):
                    next_stripped = lines[i+1].strip()
                    if (next_stripped.startswith('validationRules:') or
                        next_stripped.startswith('toolPermissions:') or
                        next_stripped.startswith('retryPolicy:') or
                        next_stripped.startswith('expectedOutput:') or
                        next_stripped.startswith('}')):
                        result.append(stripped[:-1] + '`,')
                        i += 1
                        break
                    else:
                        result.append(next_line)
                        i += 1
                elif stripped.endswith(',') and i + 1 == len(lines):
                    result.append(stripped[:-1] + '`,')
                    i += 1
                    break
                else:
                    result.append(next_line)
                    i += 1
        else:
            result.append(line)
            i += 1
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(result))
    
    print(f"Fixed {filepath}")

fix_file(r'templates\prompt-templates.ts')
fix_file(r'templates\templates-batch9-specialized.ts')
