import os, re

# Collect all .ts/.tsx files
source_files = []
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.pnpm-store', '__pycache__', 'D:'] and not d.startswith('.') and d not in ['.venv']]
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            source_files.append(os.path.join(root, f))

print(f'Total source files: {len(source_files)}')

def get_module_name(path):
    name = os.path.splitext(os.path.basename(path))[0]
    return name

def import_name_matches(content, name):
    """Check if content imports a file with the given name"""
    patterns = [
        f"from '../lib/{name}'",
        f'from "../lib/{name}"',
        f"from '../../lib/{name}'",
        f'from "../../lib/{name}"',
        f"from '../../../lib/{name}'",
        f'from "../../../lib/{name}"',
        f"from './{name}'",
        f'from "./{name}"',
        f"from '../{name}'",
        f'from "../{name}"',
        f"from '@/lib/{name}'",
        f'from "@/lib/{name}"',
        f"from '@/{name}'",
        f'from "@/{name}"',
        f"import '{name}'",
        f'import "{name}"',
        f"./{name}'",
        f'./{name}"',
    ]
    for p in patterns:
        if p in content:
            return True
    return False

# Check lib files
print()
print('=== Checking lib/*.ts files for dead/UNUSED imports ===')
lib_files = sorted([f for f in source_files if '/lib/' in f.replace('\\', '/') and '/_core/' not in f.replace('\\', '/')])
for f in lib_files:
    name = get_module_name(f)
    found = False
    for other in source_files:
        if other == f:
            continue
        with open(other, 'r', encoding='utf-8', errors='ignore') as fh:
            content = fh.read()
            if import_name_matches(content, name):
                found = True
                break
    if not found:
        with open(f, 'r', encoding='utf-8', errors='ignore') as fh:
            content = fh.read()
            exports = re.findall(r'^export ', content, re.MULTILINE)
            imports_lines = re.findall(r'^(import|from) ', content, re.MULTILINE)
            print(f'  UNUSED: {os.path.relpath(f)}')
            print(f'    (has {len(exports)} exports, {len(imports_lines)} imports)')