import re

# Read the file
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove unsupported material properties
# Remove metalness
content = re.sub(r'; metalness: [0-9.]+', '', content)
content = re.sub(r'metalness: [0-9.]+; ', '', content)
content = re.sub(r'metalness: [0-9.]+', '', content)

# Remove roughness
content = re.sub(r'; roughness: [0-9.]+', '', content)
content = re.sub(r'roughness: [0-9.]+; ', '', content)
content = re.sub(r'roughness: [0-9.]+', '', content)

# Remove emissive
content = re.sub(r'; emissive: #[0-9a-fA-F]+', '', content)
content = re.sub(r'emissive: #[0-9a-fA-F]+; ', '', content)
content = re.sub(r'emissive: #[0-9a-fA-F]+', '', content)

# Remove emissiveIntensity
content = re.sub(r'; emissiveIntensity: [0-9.]+', '', content)
content = re.sub(r'emissiveIntensity: [0-9.]+; ', '', content)
content = re.sub(r'emissiveIntensity: [0-9.]+', '', content)

# Clean up any double spaces or trailing semicolons
content = re.sub(r'  +', ' ', content)
content = re.sub(r'; "', '"', content)

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Fixed all unsupported material properties!")
print("Removed: metalness, roughness, emissive, emissiveIntensity")
