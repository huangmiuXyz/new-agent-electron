#!/usr/bin/env python3
"""Compare two heap snapshots side-by-side."""
import json, sys, os
from collections import Counter, defaultdict

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

def analyze(data, label):
    meta = data['snapshot']['meta']
    node_fields = meta['node_fields']
    node_types_list = meta['node_types']
    edge_types_list = meta['edge_types']
    type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
    edge_type_names = edge_types_list[0]
    nodes = data['nodes']
    edges = data['edges']
    strings = data['strings']
    node_size = len(node_fields)
    edge_size = len(meta['edge_fields'])
    total_nodes = len(nodes) // node_size
    total_edges = len(edges) // edge_size

    # Type stats
    type_stats = defaultdict(lambda: {'count': 0, 'self_size': 0})
    for i in range(0, len(nodes), node_size):
        t = nodes[i]
        tname = type_name_map.get(t, 'unknown')
        sz = nodes[i + 3]
        type_stats[tname]['count'] += 1
        type_stats[tname]['self_size'] += sz

    # Native top
    native_by_name = defaultdict(int)
    for i in range(0, len(nodes), node_size):
        t = nodes[i]
        tname = type_name_map.get(t, 'unknown')
        if tname == 'native':
            sz = nodes[i + 3]
            name_idx = nodes[i + 1]
            name = strings[name_idx][:80] if name_idx < len(strings) else f'<{name_idx}>'
            native_by_name[name] += sz

    total_self = sum(s['self_size'] for s in type_stats.values())
    return {
        'label': label,
        'total_nodes': total_nodes,
        'total_edges': total_edges,
        'total_self_mb': total_self / 1024 / 1024,
        'type_stats': dict(type_stats),
        'native_by_name': dict(native_by_name),
        'strings': strings,
        'nodes': nodes,
        'node_size': node_size,
        'type_name_map': type_name_map,
    }

d1 = analyze(load(SNAPSHOT1), "23:22:51 (前)")
d2 = analyze(load(SNAPSHOT2), "23:26:59 (后)")

print(f"\n{'='*80}")
print(f"  Heap Snapshot 对比分析")
print(f"  {'='*34}  {'='*38}")
print(f"  {d1['label']:<34} {d2['label']:<38}")
print(f"  {'='*34}  {'='*38}")
print(f"  总节点数:      {d1['total_nodes']:>12,}          {d2['total_nodes']:>12,}")
print(f"  总边数:        {d1['total_edges']:>12,}          {d2['total_edges']:>12,}")
print(f"  总 Self Size:  {d1['total_self_mb']:>10.1f} MB          {d2['total_self_mb']:>10.1f} MB")
print(f"  Δ 变化:        {d2['total_self_mb'] - d1['total_self_mb']:+>10.1f} MB ({(d2['total_self_mb']/d1['total_self_mb']-1)*100:+.1f}%)")

# Compare by type
all_types = set(d1['type_stats'].keys()) | set(d2['type_stats'].keys())
sorted_types = sorted(all_types, key=lambda t: -max(
    d1['type_stats'].get(t, {}).get('self_size', 0),
    d2['type_stats'].get(t, {}).get('self_size', 0)
))

print(f"\n{'='*80}")
print(f"  按类型 Self Size 对比（按总大小排序，>1MB 或有显著变化）")
print(f"{'='*80}")
print(f"  {'类型':<25} {'前 (MB)':>10} {'后 (MB)':>10} {'Δ (MB)':>10} {'Δ%':>8}")
print(f"  {'-'*25} {'-'*10} {'-'*10} {'-'*10} {'-'*8}")
for t in sorted_types:
    s1 = d1['type_stats'].get(t, {}).get('self_size', 0) / 1024/1024
    s2 = d2['type_stats'].get(t, {}).get('self_size', 0) / 1024/1024
    delta = s2 - s1
    if abs(delta) < 0.5 and max(s1, s2) < 1:
        continue
    pct = (s2/s1 - 1) * 100 if s1 > 0 else (100 if s2 > 0 else 0)
    print(f"  {t:<25} {s1:>10.2f} {s2:>10.2f} {delta:+>10.2f} {pct:+>7.1f}%")

# Native comparison
print(f"\n{'='*80}")
print(f"  Native 对象对比（Top 20，按后快照大小排序）")
print(f"{'='*80}")
print(f"  {'名称':<55} {'前 (MB)':>8} {'后 (MB)':>8}")
print(f"  {'-'*55} {'-'*8} {'-'*8}")
all_native = set(list(d1['native_by_name'].keys())[:30] + list(d2['native_by_name'].keys())[:30])
for name in sorted(all_native, key=lambda n: -max(d2['native_by_name'].get(n,0), d1['native_by_name'].get(n,0)))[:20]:
    n1 = d1['native_by_name'].get(name, 0) / 1024/1024
    n2 = d2['native_by_name'].get(name, 0) / 1024/1024
    if max(n1, n2) < 0.5:
        continue
    print(f"  {name:<55} {n1:>8.2f} {n2:>8.2f}")

# Count specific types
print(f"\n{'='*80}")
print(f"  关键对象数量对比")
print(f"{'='*80}")
for key in ['closure', 'array', 'string', 'object', 'native', 'code', 'regexp']:
    c1 = d1['type_stats'].get(key, {}).get('count', 0)
    c2 = d2['type_stats'].get(key, {}).get('count', 0)
    s1 = d1['type_stats'].get(key, {}).get('self_size', 0) / 1024/1024
    s2 = d2['type_stats'].get(key, {}).get('self_size', 0) / 1024/1024
    print(f"  {key:<20} 数量: {c1:>10,} → {c2:>10,} ({c2-c1:+>10,})  大小: {s1:>8.2f} → {s2:>8.2f} MB ({s2-s1:+>8.2f} MB)")

print()
