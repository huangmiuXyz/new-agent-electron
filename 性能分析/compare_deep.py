#!/usr/bin/env python3
"""Deep compare - find what disappeared between snapshots."""
import json, sys, os
from collections import defaultdict

SNAPSHOT1 = "Heap-20260705T135151.heapsnapshot"
SNAPSHOT2 = "Heap-20260705T135421.heapsnapshot"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load(path):
    full = os.path.join(BASE_DIR, path)
    print(f"Loading {path}...", file=sys.stderr)
    try:
        import orjson
        with open(full, 'rb') as f:
            return orjson.loads(f.read())
    except ImportError:
        with open(full, 'r', encoding='utf-8') as f:
            return json.load(f)

def get_type_breakdown(data):
    meta = data['snapshot']['meta']
    node_fields = meta['node_fields']
    node_types_list = meta['node_types']
    type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
    nodes = data['nodes']
    strings = data['strings']
    node_size = len(node_fields)

    breakdown = defaultdict(lambda: {'count': 0, 'self_size': 0, 'names': defaultdict(int)})
    for i in range(0, len(nodes), node_size):
        t = nodes[i]
        tname = type_name_map.get(t, 'unknown')
        sz = nodes[i+3]
        name_idx = nodes[i+1]
        name = strings[name_idx][:100] if name_idx < len(strings) else f'<{name_idx}>'
        breakdown[tname]['count'] += 1
        breakdown[tname]['self_size'] += sz
        breakdown[tname]['names'][name] += sz
    return breakdown

d1 = load(SNAPSHOT1)
d2 = load(SNAPSHOT2)

b1 = get_type_breakdown(d1)
b2 = get_type_breakdown(d2)

# closure: 前 469k → 后 20k → 释放了约 449k closures → 12 MB
# 看看 closures 都是啥
print("=" * 70)
print("  Closures 对比（前 20 个 name）")
print("=" * 70)
print(f"  {'Name':<65} {'前 size (KB)':>15} {'后 size (KB)':>15}")
for name in sorted(set(list(b1['closure']['names'].keys())[:50] + list(b2['closure']['names'].keys())[:50]),
                   key=lambda n: -b1['closure']['names'].get(n,0))[:20]:
    sz1 = b1['closure']['names'].get(name,0)/1024
    sz2 = b2['closure']['names'].get(name,0)/1024
    if max(sz1, sz2) < 10:
        continue
    print(f"  {name:<65} {sz1:>15.1f} {sz2:>15.1f}")

# code: 前 35MB → 后 6MB → 释放了 29MB
print(f"\n{'='*70}")
print(f"  Code 对比（前 20 个 name）")
print(f"{'='*70}")
print(f"  {'Name':<65} {'前 size (KB)':>15} {'后 size (KB)':>15}")
for name in sorted(set(list(b1['code']['names'].keys())[:50] + list(b2['code']['names'].keys())[:50]),
                   key=lambda n: -b1['code']['names'].get(n,0))[:20]:
    sz1 = b1['code']['names'].get(name,0)/1024
    sz2 = b2['code']['names'].get(name,0)/1024
    if max(sz1, sz2) < 50:
        continue
    print(f"  {name:<65} {sz1:>15.1f} {sz2:>15.1f}")

# object: 前 36MB → 后 13MB
print(f"\n{'='*70}")
print(f"  Object 对比（前 20 个 name）")
print(f"{'='*70}")
print(f"  {'Name':<65} {'前 size (KB)':>15} {'后 size (KB)':>15}")
for name in sorted(set(list(b1['object']['names'].keys())[:50] + list(b2['object']['names'].keys())[:50]),
                   key=lambda n: -b1['object']['names'].get(n,0))[:20]:
    sz1 = b1['object']['names'].get(name,0)/1024
    sz2 = b2['object']['names'].get(name,0)/1024
    if max(sz1, sz2) < 50:
        continue
    print(f"  {name:<65} {sz1:>15.1f} {sz2:>15.1f}")

# array
print(f"\n{'='*70}")
print(f"  Array 对比（前 20 个 name）")
print(f"{'='*70}")
print(f"  {'Name':<65} {'前 size (KB)':>15} {'后 size (KB)':>15}")
for name in sorted(set(list(b1['array']['names'].keys())[:50] + list(b2['array']['names'].keys())[:50]),
                   key=lambda n: -b1['array']['names'].get(n,0))[:20]:
    sz1 = b1['array']['names'].get(name,0)/1024
    sz2 = b2['array']['names'].get(name,0)/1024
    if max(sz1, sz2) < 100:
        continue
    print(f"  {name:<65} {sz1:>15.1f} {sz2:>15.1f}")
