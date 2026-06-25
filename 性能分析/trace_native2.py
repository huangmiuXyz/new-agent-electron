#!/usr/bin/env python3
"""Find the largest native objects in the heap snapshot."""
import json

SNAPSHOT_PATH = "/Users/Zhuanz/obj/private/agent-qi-electron/性能分析/Heap-20260625T105438.heapsnapshot"

with open(SNAPSHOT_PATH, 'rb') as f:
    data = json.loads(f.read())

strings = data['strings']
meta = data['snapshot']['meta']
node_fields = meta['node_fields']
node_types_list = meta['node_types']
type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
nodes_flat = data['nodes']
node_size = len(node_fields)

# Find largest native nodes
native_nodes = []
for i in range(0, len(nodes_flat), node_size):
    t = nodes_flat[i]
    tname = type_name_map.get(t, 'unknown')
    if tname == 'native':
        sz = nodes_flat[i+3]
        name_idx = nodes_flat[i+1]
        name = strings[name_idx][:80] if name_idx < len(strings) else f'<{name_idx}>'
        native_nodes.append((name, sz, nodes_flat[i+2]))

native_nodes.sort(key=lambda x: -x[1])

print(f"{'='*60}")
print("  最大的 Native 对象 Top 40")
print(f"{'='*60}")
print(f"  {'名称':<55} {'大小':>10}")
print(f"  {'-'*55} {'-'*10}")

total_native = 0
for name, sz, nid in native_nodes[:40]:
    total_native += sz
    sz_str = f"{sz/1024/1024:.1f}MB" if sz > 1024*1024 else f"{sz/1024:.1f}KB"
    print(f"  {name:<55} {sz_str:>10}")

remaining = sum(sz for _, sz, _ in native_nodes[40:])
print(f"  ...")
print(f"  其他 ({len(native_nodes)-40} 个):              {remaining/1024/1024:.1f} MB")
print(f"  总计:                                        {total_native/1024/1024:.1f} MB")

# Group by name
from collections import Counter, defaultdict
name_counts = Counter()
name_sizes = defaultdict(int)
for name, sz, nid in native_nodes:
    name_counts[name] += 1
    name_sizes[name] += sz

print(f"\n{'='*60}")
print("  Native 对象按名称分组 (Top 30)")
print(f"{'='*60}")
print(f"  {'名称':<55} {'数量':>8} {'总大小':>10}")
print(f"  {'-'*55} {'-'*8} {'-'*10}")
for name, count in name_counts.most_common(30):
    total = name_sizes[name]
    sz_str = f"{total/1024/1024:.1f}MB" if total > 1024*1024 else f"{total/1024:.1f}KB"
    print(f"  {name:<55} {count:>8,} {sz_str:>10}")
