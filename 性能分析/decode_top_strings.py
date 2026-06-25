#!/usr/bin/env python3
"""Decode top base64 data URIs from the heap snapshot to identify them."""

import json
import base64
import struct

SNAPSHOT_PATH = "/Users/Zhuanz/obj/private/agent-qi-electron/性能分析/Heap-20260625T102632.heapsnapshot"

with open(SNAPSHOT_PATH, 'rb') as f:
    data = json.loads(f.read())

strings = data['strings']
meta = data['snapshot']['meta']
node_fields = meta['node_fields']
node_types_list = meta['node_types']
type_name_map = {i: name for i, name in enumerate(node_types_list[0])}

nodes_flat = data['nodes']
node_size = len(node_fields)

# Find all large strings by type
print("=" * 70)
print("  分析大字符串的来源")
print("=" * 70)

# Collect all data: URIs with size info
data_uris = []
for i in range(0, len(nodes_flat), node_size):
    t = nodes_flat[i]
    tname = type_name_map.get(t, 'unknown')
    if tname not in ('string', 'concatenated string', 'sliced string'):
        continue
    self_size = nodes_flat[i + 3]
    if self_size < 100000:
        continue
    name_idx = nodes_flat[i + 1]
    name = strings[name_idx] if name_idx < len(strings) else ''
    if name.startswith('data:'):
        data_uris.append((name, self_size))

data_uris.sort(key=lambda x: -x[1])

# Categorize
categories = {}
for name, sz in data_uris:
    # Extract mime type
    if ';base64,' in name:
        prefix = name.split(';base64,')[0]
        mime = prefix.replace('data:', '')
        # Try to decode a small portion to identify
        b64_data = name.split(';base64,')[1]
        try:
            decoded = base64.b64decode(b64_data[:200])
            if decoded.startswith(b'\x89PNG'):
                actual = 'PNG image'
            elif b'<svg' in decoded[:200]:
                actual = 'SVG'
            elif decoded.startswith(b'{\n  "version"'):
                # Check if sourcemap
                try:
                    js = json.loads(decoded)
                    if 'mappings' in js:
                        actual = f"Sourcemap: {js.get('file', '?')}"
                    else:
                        actual = 'JSON data'
                except:
                    actual = 'JSON (unparsed)'
            elif b'\x00' in decoded[:100]:
                actual = 'Binary data'
            else:
                actual = decoded[:60].decode('utf-8', errors='replace')[:60]
        except:
            actual = '? (decode failed)'
    else:
        mime = name.split('data:')[1].split(',')[0] if ',' in name else '?'
        actual = 'non-base64 data'
    categories.setdefault(mime, {'count': 0, 'total_size': 0, 'examples': []})
    categories[mime]['count'] += 1
    categories[mime]['total_size'] += sz
    if len(categories[mime]['examples']) < 3:
        categories[mime]['examples'].append((name[:120], sz, actual))

print(f"\n按 MIME 类型统计 data: URI 字符串:\n")
for mime, stats in sorted(categories.items(), key=lambda x: -x[1]['total_size']):
    print(f"  {mime:<40} {stats['count']:>6,} 个, 共 {stats['total_size']/1024/1024:>8.1f} MB")
    for ex_name, ex_sz, ex_actual in stats['examples']:
        print(f"    → {ex_actual[:80]}")
        print(f"      Size: {ex_sz/1024/1024:.1f} MB | {ex_name[:100]}...")

total_data_uri = sum(sz for _, sz in data_uris)
print(f"\n总计 data: URI 占用: {total_data_uri/1024/1024:.1f} MB")
print(f"占总字符串内存 ({sum(nodes_flat[i+3] for i in range(0, len(nodes_flat), node_size) if type_name_map.get(nodes_flat[i],'') in ('string','concatenated string','sliced string'))/1024/1024:.1f} MB) 的比例: {total_data_uri/1024/1024:.1f} / {sum(nodes_flat[i+3] for i in range(0, len(nodes_flat), node_size) if type_name_map.get(nodes_flat[i],'') in ('string','concatenated string','sliced string'))/1024/1024:.1f} = {total_data_uri/(sum(nodes_flat[i+3] for i in range(0, len(nodes_flat), node_size) if type_name_map.get(nodes_flat[i],'') in ('string','concatenated string','sliced string')) or 1)*100:.1f}%")
