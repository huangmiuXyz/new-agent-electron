#!/usr/bin/env python3
"""Analyze JSWorker retention in heap snapshots."""
import json, sys, os
from collections import defaultdict

SNAPSHOT1 = "Heap-20260625T232251.heapsnapshot"
SNAPSHOT2 = "Heap-20260625T232659.heapsnapshot"
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

def find_workers(data, label):
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

    # Find JSWorker / worker-related nodes
    worker_nodes = []
    for i in range(0, len(nodes), node_size):
        ni = i // node_size
        name_idx = nodes[i+1]
        name = strings[name_idx] if name_idx < len(strings) else ''
        t = nodes[i]
        tname = type_name_map.get(t, 'unknown')
        if 'worker' in name.lower() or 'Worker' in name:
            sz = nodes[i+3]
            worker_nodes.append((ni, name, tname, sz, nodes[i+2]))

    print(f"\n{'='*70}")
    print(f"  [{label}] Worker 相关节点 (共 {len(worker_nodes)} 个)")
    print(f"{'='*70}")
    for ni, name, tname, sz, nid in sorted(worker_nodes, key=lambda x: -x[3])[:30]:
        sz_str = f"{sz/1024/1024:.1f}MB" if sz > 1024*1024 else f"{sz/1024:.1f}KB"
        print(f"  [{ni:>8}] {name:<55} {tname:<15} {sz_str:>10} id={nid}")

    if not worker_nodes:
        print("  (无 Worker 相关节点)")
        return []

    # Build reverse edges to find retainers
    print(f"\n  Building reverse edge map...", file=sys.stderr)
    reverse_edges = defaultdict(list)
    edge_start = 0
    total_nodes = len(nodes) // node_size
    for ni in range(total_nodes):
        ec = nodes[ni * node_size + 4]
        for ei in range(edge_start, edge_start + ec):
            to_node = edges[ei * edge_size + 2] // node_size
            reverse_edges[to_node].append((ni, edges[ei * edge_size], edges[ei * edge_size + 1]))
        edge_start += ec

    # Show retainers for each worker node
    print(f"\n  Retainers (引用链):")
    for ni, name, tname, sz, nid in sorted(worker_nodes, key=lambda x: -x[3])[:10]:
        print(f"\n  ── [{ni}] {name} ({sz/1024/1024:.1f} MB) ──")
        refs = reverse_edges.get(ni, [])
        if not refs:
            print("      (根节点 / 无引用者)")
            continue
        for src_ni, etype, ename_idx in refs[:8]:
            src_type = type_name_map.get(nodes[src_ni * node_size], '?')
            src_name_idx = nodes[src_ni * node_size + 1]
            src_name = strings[src_name_idx][:60] if src_name_idx < len(strings) else f'<{src_name_idx}>'
            src_sz = nodes[src_ni * node_size + 3]
            ename = strings[ename_idx][:40] if isinstance(ename_idx, int) and ename_idx < len(strings) else str(ename_idx)
            en = edge_type_names[etype] if etype < len(edge_type_names) else '?'
            print(f"      ← [{src_ni:>8}] {en:<12} {ename:<30} {src_name:<50} ({src_type}) [{src_sz/1024/1024:.1f}MB]")

    return worker_nodes

d1 = load(SNAPSHOT1)
d2 = load(SNAPSHOT2)

w1 = find_workers(d1, "23:22:51 (前)")
w2 = find_workers(d2, "23:26:59 (后)")

# Also look for any "postTask" or "messageport" or "port" patterns
def find_port_nodes(data, label):
    meta = data['snapshot']['meta']
    node_fields = meta['node_fields']
    node_types_list = meta['node_types']
    type_name_map = {i: name for i, name in enumerate(node_types_list[0])}
    nodes = data['nodes']
    strings = data['strings']
    node_size = len(node_fields)

    matches = []
    for i in range(0, len(nodes), node_size):
        ni = i // node_size
        name_idx = nodes[i+1]
        name = strings[name_idx] if name_idx < len(strings) else ''
        t = nodes[i]
        tname = type_name_map.get(t, 'unknown')
        kw = ['messageport', 'port', 'message channel', 'broadcastchannel', 'messageport']
        if any(k in name.lower() for k in kw):
            sz = nodes[i+3]
            matches.append((ni, name, tname, sz, nodes[i+2]))

    print(f"\n{'='*70}")
    print(f"  [{label}] MessagePort/Channel 相关节点 (共 {len(matches)} 个)")
    print(f"{'='*70}")
    for ni, name, tname, sz, nid in sorted(matches, key=lambda x: -x[3])[:20]:
        sz_str = f"{sz/1024/1024:.1f}MB" if sz > 1024*1024 else f"{sz/1024:.1f}KB"
        print(f"  [{ni:>8}] {name:<55} {tname:<15} {sz_str:>10}")

find_port_nodes(d1, "23:22:51 (前)")
find_port_nodes(d2, "23:26:59 (后)")
