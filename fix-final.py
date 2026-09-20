import re

filepath = r'templates\prompt-templates.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Find all systemPrompt and userPromptTemplate blocks and rebuild them
# Strategy: For each entry, find the systemPrompt and userPromptTemplate values
# by looking at the property markers, and wrap them in backticks

lines = content.split('\n')
result = []
i = 0

while i < len(lines):
    line = lines[i]
    
    # Detect systemPrompt without proper backtick wrapping
    # We check if the line has systemPrompt: followed by text that is NOT already in a backtick
    sp_match = re.match(r'(\s+systemPrompt:\s+)(.+)', line)
    if sp_match and '\x60' not in line:
        # This systemPrompt has no backtick - add opening backtick
        prefix = sp_match.group(1)
        rest = sp_match.group(2)
        result.append(prefix + '`' + rest)
        i += 1
        
        # Collect lines until we find the one before the next property
        while i < len(lines):
            next_line = lines[i]
            stripped = next_line.rstrip('\r\n')
            
            if i + 1 < len(lines):
                next_stripped = lines[i + 1].strip()
                is_next_property = (
                    next_stripped.startswith('validationRules:') or
                    next_stripped.startswith('toolPermissions:') or
                    next_stripped.startswith('retryPolicy:') or
                    next_stripped.startswith('expectedOutput:')
                )
            else:
                is_next_property = False
            
            if is_next_property and stripped.endswith(','):
                # This is the last line of the template - add closing backtick before comma
                result.append(stripped[:-1] + '`,')
                i += 1
                break
            else:
                result.append(next_line)
                i += 1
        continue
    
    # Detect userPromptTemplate without proper backtick wrapping
    upt_match = re.match(r'(\s+userPromptTemplate:\s+)(.+)', line)
    if upt_match and '\x60' not in line:
        prefix = upt_match.group(1)
        rest = upt_match.group(2)
        result.append(prefix + '`' + rest)
        i += 1
        
        while i < len(lines):
            next_line = lines[i]
            stripped = next_line.rstrip('\r\n')
            
            if i + 1 < len(lines):
                next_stripped = lines[i + 1].strip()
                is_next_property = (
                    next_stripped.startswith('validationRules:') or
                    next_stripped.startswith('toolPermissions:') or
                    next_stripped.startswith('retryPolicy:') or
                    next_stripped.startswith('expectedOutput:')
                )
            else:
                is_next_property = False
            
            if is_next_property and stripped.endswith(','):
                result.append(stripped[:-1] + '`,')
                i += 1
                break
            else:
                result.append(next_line)
                i += 1
        continue
    
    result.append(line)
    i += 1

final = '\n'.join(result)

# Step 2: Verify and fix backtick balance
bt_count = final.count('\x60')
print(f"After pass 1: {bt_count} backticks (even: {bt_count % 2 == 0})")

# Step 3: Make sure file ends with };
if not final.rstrip().endswith('};'):
    final_lines = final.rstrip().split('\n')
    last = final_lines[-1].rstrip()
    if last.endswith('},'):
        final_lines[-1] = last + '\n};'
    else:
        final_lines.append('};')
    final = '\n'.join(final_lines)
    print("Added closing };")

with open(filepath, 'w', encoding='utf-8', newline='\r\n') as f:
    f.write(final)

# Verify
with open(filepath, 'r', encoding='utf-8') as f:
    verify = f.read()
vt = verify.count('\x60')
print(f"Verify: {vt} backticks (even: {vt % 2 == 0})")
print(f"Ends with }};: {verify.rstrip().endswith('};')}")

# Final template state check
in_template = False
for i, line in enumerate(verify.split('\n')):
    for ch in line:
        if ch == '\x60':
            in_template = not in_template

print(f"File ends inside template: {in_template}")
