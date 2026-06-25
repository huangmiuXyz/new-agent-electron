#!/usr/bin/env python3
"""Analyze a Chrome V8 heap snapshot file (*.heapsnapshot)."""

import json
import sys
from collections import Counter, defaultdict

SNAPSHOT_PATH = "/Users/Zhuanz/obj/private/agent-qi-electron/性能分析/Heap-20260625T114205.heapsnapshot"


def parse_heapsnapshot(path):
    # Try orjson first (fast), fall back to json
    print("Parsing heap snapshot (this may take a moment)...")
    try:
        import orjson
        with open(path, 'rb') as f:
            data = orjson.loads(f.read())
    except ImportError:
        print("  (orjson not available, using standard json module — may be slow)")
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    print("  Done parsing.\n")
    return data


def analyze(data):
    meta = data['snapshot']['meta']
    node_fields = meta['node_fields']
    node_types_list = meta['node_types']
    edge_fields = meta['edge_fields']
    edge_types_list = meta['edge_types']

    type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
    edge_type_names = edge_types_list[0]

    nodes_flat = data['nodes']
    edges_flat = data['edges']
    strings = data['strings']

    node_size = len(node_fields)
    edge_size = len(edge_fields)

    total_nodes = len(nodes_flat) // node_size
    total_edges = len(edges_flat) // edge_size

    print(f"=" * 70)
    print(f"  V8 Heap Snapshot Analysis")
    print(f"  File: Heap-20260625T102632.heapsnapshot")
    print(f"=" * 70)
    print(f"\n{'='*70}")
    print(f"  📊 基本信息")
    print(f"{'='*70}")
    print(f"  总节点数:      {total_nodes:,}")
    print(f"  总边数:        {total_edges:,}")
    print(f"  字符串数:      {len(strings):,}")

    # --- Count by node type ---
    type_stats = defaultdict(lambda: {'count': 0, 'self_size': 0})
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        self_size = nodes_flat[i + 3]
        type_stats[tname]['count'] += 1
        type_stats[tname]['self_size'] += self_size

    sorted_types = sorted(type_stats.items(), key=lambda x: -x[1]['self_size'])

    print(f"\n{'='*70}")
    print(f"  📦 按类型统计 Self Size（全部）")
    print(f"{'='*70}")
    print(f"  {'类型':<30} {'数量':>10} {'Self Size':>15} {'平均 Size':>10}")
    print(f"  {'-'*30} {'-'*10} {'-'*15} {'-'*10}")
    for t, stats in sorted_types:
        avg = stats['self_size'] / stats['count'] if stats['count'] > 0 else 0
        size_str = f"{stats['self_size']/1024/1024:.1f} MB" if stats['self_size'] > 1024*1024 else f"{stats['self_size']:,} B"
        print(f"  {t:<30} {stats['count']:>10,} {size_str:>15} {avg:>10.1f}")

    total_self = sum(s['self_size'] for s in type_stats.values())
    print(f"\n  总 Self Size: {total_self:,} bytes ({total_self/1024/1024:.1f} MB)")

    # --- Top objects by self_size (non-system) ---
    system_types = {'hidden', 'code', 'native', 'synthetic', 'object shape'}
    top_objects = []
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        if tname in system_types:
            continue
        self_size = nodes_flat[i + 3]
        if self_size > 0:
            name_idx = nodes_flat[i + 1]
            name = strings[name_idx] if name_idx < len(strings) else f'<idx:{name_idx}>'
            top_objects.append((name, tname, self_size))

    top_objects.sort(key=lambda x: -x[2])

    print(f"\n{'='*70}")
    print(f"  🏆 Top 30 大对象（排除 system 类型）")
    print(f"{'='*70}")
    print(f"  {'名称':<60} {'类型':<20} {'Self Size':>12}")
    print(f"  {'-'*60} {'-'*20} {'-'*12}")
    for name, tname, sz in top_objects[:30]:
        name_display = name[:58]
        print(f"  {name_display:<60} {tname:<20} {sz:>12,}")

    # --- Edge type distribution ---
    edge_type_counts = Counter()
    for i in range(0, len(edges_flat), edge_size):
        edge_type_counts[edges_flat[i]] += 1

    print(f"\n{'='*70}")
    print(f"  🔗 边类型分布")
    print(f"{'='*70}")
    for etype, count in sorted(edge_type_counts.items(), key=lambda x: -x[1]):
        ename = edge_type_names[etype] if etype < len(edge_type_names) else f'type_{etype}'
        print(f"  {ename:<20} {count:>12,}")

    # --- Top node names ---
    name_counter = Counter()
    for i in range(0, len(nodes_flat), node_size):
        name_idx = nodes_flat[i + 1]
        if name_idx < len(strings):
            name = strings[name_idx]
            if name and not name.startswith('<dummy>') and not name.startswith('system /'):
                name_counter[name] += 1

    print(f"\n{'='*70}")
    print(f"  🏷️ Top 30 常用节点名")
    print(f"{'='*70}")
    for name, count in name_counter.most_common(30):
        print(f"  {name:<60} {count:>10,}")

    # --- Detached nodes ---
    detached_count = 0
    detached_by_type = Counter()
    for i in range(0, len(nodes_flat), node_size):
        if nodes_flat[i + 5] > 0:  # detachedness
            detached_count += 1
            t = nodes_flat[i]
            tname = type_name_map.get(t, 'unknown')
            detached_by_type[tname] += 1

    print(f"\n{'='*70}")
    print(f"  🔌 分离节点（Detachedness > 0）")
    print(f"{'='*70}")
    print(f"  总数: {detached_count:,}")
    for t, c in detached_by_type.most_common(10):
        print(f"  {t:<30} {c:>10,}")

    # --- Arrays ---
    array_count = 0
    array_size = 0
    large_arrays = []
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        if tname == 'array':
            array_count += 1
            sz = nodes_flat[i + 3]
            array_size += sz
            if sz > 100000:  # > 100KB
                name_idx = nodes_flat[i + 1]
                name = strings[name_idx] if name_idx < len(strings) else f'<idx:{name_idx}>'
                large_arrays.append((name, sz))

    large_arrays.sort(key=lambda x: -x[1])

    print(f"\n{'='*70}")
    print(f"  📋 数组分析")
    print(f"{'='*70}")
    print(f"  数组总数: {array_count:,}")
    print(f"  总 Self Size: {array_size:,} bytes ({array_size/1024/1024:.1f} MB)")
    print(f"  大数组（>100KB, Top 30）:")
    for name, sz in large_arrays[:30]:
        print(f"    {name:<60} {sz:>12,} ({sz/1024/1024:.1f} MB)")

    # --- Strings ---
    string_count = 0
    string_size = 0
    large_strings = []
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        if tname in ('string', 'concatenated string', 'sliced string'):
            string_count += 1
            sz = nodes_flat[i + 3]
            string_size += sz
            if sz > 50000:  # > 50KB
                name_idx = nodes_flat[i + 1]
                name = strings[name_idx] if name_idx < len(strings) else f'<idx:{name_idx}>'
                large_strings.append((name, sz))

    large_strings.sort(key=lambda x: -x[1])

    print(f"\n{'='*70}")
    print(f"  📝 字符串分析")
    print(f"{'='*70}")
    print(f"  字符串总数: {string_count:,}")
    print(f"  总 Self Size: {string_size:,} bytes ({string_size/1024/1024:.1f} MB)")
    print(f"  大字符串（>50KB, Top 30）:")
    for name, sz in large_strings[:30]:
        print(f"    {name:<60} {sz:>12,} ({sz/1024:.1f} KB)")

    # --- Objects ---
    object_count = 0
    object_size = 0
    large_objects = []
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        if tname == 'object':
            object_count += 1
            sz = nodes_flat[i + 3]
            object_size += sz
            if sz > 50000:  # > 50KB
                name_idx = nodes_flat[i + 1]
                name = strings[name_idx] if name_idx < len(strings) else f'<idx:{name_idx}>'
                large_objects.append((name, sz))

    large_objects.sort(key=lambda x: -x[1])

    print(f"\n{'='*70}")
    print(f"  🧩 普通对象分析")
    print(f"{'='*70}")
    print(f"  对象总数: {object_count:,}")
    print(f"  总 Self Size: {object_size:,} bytes ({object_size/1024/1024:.1f} MB)")
    print(f"  大对象（>50KB, Top 30）:")
    for name, sz in large_objects[:30]:
        print(f"    {name:<60} {sz:>12,} ({sz/1024:.1f} KB)")

    # --- Closure analysis ---
    closure_count = 0
    closure_size = 0
    for i in range(0, len(nodes_flat), node_size):
        t = nodes_flat[i]
        tname = type_name_map.get(t, 'unknown')
        if tname == 'closure':
            closure_count += 1
            closure_size += nodes_flat[i + 3]

    print(f"\n{'='*70}")
    print(f"  🔒 闭包分析")
    print(f"{'='*70}")
    print(f"  闭包总数: {closure_count:,}")
    print(f"  总 Self Size: {closure_size:,} bytes ({closure_size/1024/1024:.1f} MB)")


if __name__ == '__main__':
    data = parse_heapsnapshot(SNAPSHOT_PATH)
    analyze(data)
