#!/usr/bin/env python3
"""Trace ArrayBuffer/Uint8Array nodes to find their retainers (optimized)."""
import json
from collections import defaultdict

SNAPSHOT_PATH = "/Users/Zhuanz/obj/private/agent-qi-electron/性能分析/Heap-20260625T105438.heapsnapshot"

print("Loading snapshot...")
with open(SNAPSHOT_PATH, 'rb') as f:
    data = json.loads(f.read())

strings = data['strings']
meta = data['snapshot']['meta']
node_fields = meta['node_fields']
node_types_list = meta['node_types']
edge_types_list = meta['edge_types']
type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
edge_type_names = edge_types_list[0]
nodes_flat = data['nodes']
edges_flat = data['edges']
node_size = len(node_fields)
edge_size = len(meta['edge_fields'])
total_nodes = len(nodes_flat) // node_size
total_edges = len(edges_flat) // edge_size

print(f"Nodes: {total_nodes:,}, Edges: {total_edges:,}")

# Build reverse edge map: to_node -> list of (from_node, edge_type, edge_name_idx)
print("Building reverse edge map...")
reverse_edges = defaultdict(list)
edge_start = 0
for ni in range(total_nodes):
    ec = nodes_flat[ni * node_size + 4]
    for ei in range(edge_start, edge_start + ec):
        to_node = edges_flat[ei * edge_size + 2] // node_size
        reverse_edges[to_node].append((
            ni,
            edges_flat[ei * edge_size],
            edges_flat[ei * edge_size + 1],
        ))
    edge_start += ec
    if ni % 200000 == 0:
        print(f"  processing node {ni}/{total_nodes}...")

print(f"Built reverse map with {len(reverse_edges)} entries")

# Find ArrayBuffer and Uint8Array nodes
target_nodes = []
for i in range(0, len(nodes_flat), node_size):
    ni = i // node_size
    name_idx = nodes_flat[i+1]
    name = strings[name_idx] if name_idx < len(strings) else ''
    if name in ('ArrayBuffer', 'Uint8Array'):
        sz = nodes_flat[i+3]
        target_nodes.append((ni, name, sz, nodes_flat[i+2]))

print(f"\n{'='*60}")
print("  ArrayBuffer / Uint8Array 引用者统计")
print(f"{'='*60}")

ab_total = sum(sz for _, name, sz, _ in target_nodes if name == 'ArrayBuffer')
u8_total = sum(sz for _, name, sz, _ in target_nodes if name == 'Uint8Array')
print(f"ArrayBuffer: {sum(1 for _ in target_nodes if _[1]=='ArrayBuffer'):,} 个, 共 {ab_total/1024/1024:.1f} MB")
print(f"Uint8Array:  {sum(1 for _ in target_nodes if _[1]=='Uint8Array'):,} 个, 共 {u8_total/1024/1024:.1f} MB")

# Show retainers for top 20 largest
print(f"\n{'='*60}")
print("  Top 20 最大的 ArrayBuffer/Uint8Array 的引用者")
print(f"{'='*60}")

largest = sorted(target_nodes, key=lambda x: -x[2])[:20]
for ni, name, sz, nid in largest:
    refs = reverse_edges.get(ni, [])
    print(f"\n  [{ni}] {name} id={nid} size={sz/1024/1024:.1f} MB")
    for src_ni, etype, ename_idx in refs[:5]:
        src_type = type_name_map.get(nodes_flat[src_ni * node_size], '?')
        src_name_idx = nodes_flat[src_ni * node_size + 1]
        src_name = strings[src_name_idx][:50] if src_name_idx < len(strings) else f'<{src_name_idx}>'
        ename = strings[ename_idx][:40] if isinstance(ename_idx, int) and ename_idx < len(strings) else str(ename_idx)
        en = edge_type_names[etype] if etype < len(edge_type_names) else '?'
        print(f"    ← {en:<10} {src_name:<50} ({src_type})")
    if not refs:
        print(f"    (无引用者)")

# Count retainers for all ArrayBuffers
print(f"\n{'='*60}")
print("  ArrayBuffer 引用者 Top 20")
print(f"{'='*60}")
ab_retainers = defaultdict(int)
for ni, name, sz, nid in target_nodes:
    if name == 'ArrayBuffer':
        for src_ni, etype, ename_idx in reverse_edges.get(ni, []):
            src_type = type_name_map.get(nodes_flat[src_ni * node_size], '?')
            src_name_idx = nodes_flat[src_ni * node_size + 1]
            src_name = strings[src_name_idx][:60] if src_name_idx < len(strings) else f'<{src_name_idx}>'
            ab_retainers[f"{src_type}:{src_name}"] += 1

for key, count in sorted(ab_retainers.items(), key=lambda x: -x[1])[:20]:
    print(f"  {key:<60} {count:>8,}")

# Also show what retains Uint8Arrays
print(f"\n{'='*60}")
print("  Uint8Array 引用者 Top 20")
print(f"{'='*60}")
u8_retainers = defaultdict(int)
for ni, name, sz, nid in target_nodes:
    if name == 'Uint8Array':
        for src_ni, etype, ename_idx in reverse_edges.get(ni, []):
            src_type = type_name_map.get(nodes_flat[src_ni * node_size], '?')
            src_name_idx = nodes_flat[src_ni * node_size + 1]
            src_name = strings[src_name_idx][:60] if src_name_idx < len(strings) else f'<{src_name_idx}>'
            u8_retainers[f"{src_type}:{src_name}"] += 1

for key, count in sorted(u8_retainers.items(), key=lambda x: -x[1])[:20]:
    print(f"  {key:<60} {count:>8,}")

# And count unique retainers (objects that own both ArrayBuffer and Uint8Array)
print(f"\n{'='*60}")
print("  ArrayBuffer+Uint8Array 合计引用者 Top 20")
print(f"{'='*60}")
combined = defaultdict(lambda: {'count': 0, 'ab': 0, 'u8': 0})
for ni, name, sz, nid in target_nodes:
    for src_ni, etype, ename_idx in reverse_edges.get(ni, []):
        src_type = type_name_map.get(nodes_flat[src_ni * node_size], '?')
        src_name_idx = nodes_flat[src_ni * node_size + 1]
        src_name = strings[src_name_idx][:60] if src_name_idx < len(strings) else f'<{src_name_idx}>'
        key = f"{src_type}:{src_name}"
        combined[key]['count'] += 1
        if name == 'ArrayBuffer':
            combined[key]['ab'] += 1
        else:
            combined[key]['u8'] += 1

for key, stats in sorted(combined.items(), key=lambda x: -x[1]['count'])[:20]:
    print(f"  {key:<60} 总计:{stats['count']:>8,}  (AB:{stats['ab']:,} U8:{stats['u8']:,})")
