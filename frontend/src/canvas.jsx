/* 研构 · React Flow 画布（DEC-006 P1：分组 + 折叠骨架）
 * 接管全局 renderGraph：读取 app.js 的 state/project，渲染当前层级。
 * 折叠状态与位置保存在 project.visual_layout（展示层，不进语义哈希）。
 * 注意：app.js 的 state/$ /categories 是脚本级 const，不挂 window，只能裸名引用。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap,
  useReactFlow, Handle, Position, applyNodeChanges, applyEdgeChanges,
  NodeResizer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import ELK from 'elkjs/lib/elk.bundled.js';

/* global state, $, categories, dirty, renderInspector, action */

const PALETTE = {
  data: { bg: '#E6F1FB', border: '#185FA5' },
  encoder: { bg: '#E1F5EE', border: '#0F6E56' },
  fusion: { bg: '#EEEDFE', border: '#534AB7' },
  head: { bg: '#E1F5EE', border: '#1D9E75' },
  loss: { bg: '#FAEEDA', border: '#854F0B' },
  training: { bg: '#FAECE7', border: '#993C1D' },
  evaluation: { bg: '#F1EFE8', border: '#5F5E5A' },
  custom: { bg: '#FBEAF0', border: '#993556' },
};
const pal = cat => PALETTE[cat] || PALETTE.custom;

const BADGE = {
  checked: { mark: '✓', text: '已核验', cls: 'rw-badge-ok' },
  candidate: { mark: '?', text: '候选结构', cls: 'rw-badge-pending' },
  custom: { mark: '✎', text: '自定义', cls: 'rw-badge-custom' },
};
const CARD_W = 210, CARD_H = 96;

let rfApi = null; // 当前 React Flow 实例（供工具栏缩放/复位）

function kidsOf(nodes, id) { return nodes.filter(n => (n.parent || null) === id); }

function collapsedSet(project) {
  const vl = project.visual_layout;
  if (vl && Array.isArray(vl.collapsed)) return new Set(vl.collapsed);
  return new Set(project.nodes.filter(n => kidsOf(project.nodes, n.id).length).map(n => n.id));
}
const collapsedKeyOf = project => [...collapsedSet(project)].sort().join('|');

function writeVisual(project, { collapsed, positions }, markDirty) {
  const vl = project.visual_layout || {};
  project.visual_layout = {
    engine: 'elk-layered',
    direction: 'DOWN',
    positions: positions || vl.positions || {},
    routes: {}, // React Flow 自绘连线，旧正交路由失效即弃
    collapsed: [...collapsed],
    sizes: vl.sizes || {}, // 用户手调的分组尺寸（覆盖 ELK 计算值）
  };
  if (markDirty) dirty();
}

/* ---------- 自定义节点（P3 瘦身：只留名称 + 徽标 + 展开钮，详情进检查器） ---------- */
function ModuleCard({ data, selected }) {
  const p = pal(data.category);
  const badge = BADGE[data.status] || BADGE.candidate;
  return (
    <div className={'rw-card' + ((selected || data.forceSelected) ? ' selected' : '')}
      onPointerDown={e => { e.stopPropagation(); data.onSelect && data.onSelect(); }}
      style={{ borderColor: p.border, width: CARD_W, minHeight: CARD_H }}>
      <Handle type="target" position={Position.Top} className="rw-handle" />
      <div className="rw-card-name" title={data.name}>{data.name}</div>
      <div className="rw-card-foot">
        <span className={'rw-badge ' + badge.cls} title={badge.text}>{badge.mark}</span>
        {data.childCount > 0 && (
          <button type="button" className="rw-toggle nodrag" style={{ color: p.border }}
            onPointerDown={e => { e.stopPropagation(); data.onToggle(); }}
            onClick={e => e.stopPropagation()}>
            {data.expanded ? '▾ 收起' : `▸ 展开 ${data.childCount}`}
          </button>
        )}
        {data.grandCount > 0 && (
          <button type="button" className="rw-toggle nodrag" style={{ color: p.border }}
            onPointerDown={e => { e.stopPropagation(); data.onDrill(); }}
            onClick={e => e.stopPropagation()}>
            ↗ 深入 {data.grandCount}
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="rw-handle" />
    </div>
  );
}

function ModuleGroup({ data, selected }) {
  const p = pal(data.category);
  return (
    <div className={'rw-group' + ((selected || data.forceSelected) ? ' selected' : '')}
      onPointerDown={() => data.onSelect && data.onSelect()}
      style={{ background: p.bg, borderColor: p.border, width: '100%', height: '100%' }}>
      <NodeResizer isVisible={!!(selected || data.forceSelected)} minWidth={300} minHeight={200}
        lineStyle={{ borderColor: p.border, borderWidth: 1 }}
        handleStyle={{ background: p.border, width: 8, height: 8 }}
        onResizeEnd={(e, params) => data.onResizeEnd && data.onResizeEnd(params)} />
      <Handle type="target" position={Position.Top} className="rw-handle" />
      <div className="rw-group-head">
        <span className="rw-group-name" style={{ color: p.border }}>{data.name}</span>
        <button type="button" className="rw-toggle nodrag" style={{ color: p.border }}
          onPointerDown={e => { e.stopPropagation(); data.onToggle(); }}
          onClick={e => e.stopPropagation()}>▾ 收起</button>
      </div>
      <Handle type="source" position={Position.Bottom} className="rw-handle" />
    </div>
  );
}
const nodeTypes = { module: ModuleCard, moduleGroup: ModuleGroup };

/* ---------- P4：hover 整链高亮 ---------- */
const HOT = { stroke: '#B45309', strokeWidth: 2.4 }; // 整链高亮色（琥珀，区别于选中蓝与功能色）

// 沿可见聚合边向上/向下追溯，返回 {nodes:Set, edges:Set(aggEdges 下标)}
function traceChain(aggEdges, seedNodes, seedEdgeIdx) {
  const up = new Map(), down = new Map();
  aggEdges.forEach((e, i) => {
    if (!down.has(e.source)) down.set(e.source, []);
    if (!up.has(e.target)) up.set(e.target, []);
    down.get(e.source).push({ id: e.target, idx: i });
    up.get(e.target).push({ id: e.source, idx: i });
  });
  const nodes = new Set(seedNodes), edges = new Set(seedEdgeIdx == null ? [] : [seedEdgeIdx]);
  const walk = (start, adj) => {
    const q = [...start];
    while (q.length) {
      const cur = q.pop();
      (adj.get(cur) || []).forEach(({ id, idx }) => {
        edges.add(idx);
        if (!nodes.has(id)) { nodes.add(id); q.push(id); }
      });
    }
  };
  walk(seedNodes, up);
  walk(seedNodes, down);
  return { nodes, edges };
}

/* ---------- 画布主体 ---------- */
function CanvasInner() {
  const rf = useReactFlow();
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [hoverChain, setHoverChain] = useState(null); // P4：hover 整链 {nodes, edges} 或 null
  const [layoutEpoch, setLayoutEpoch] = useState(0); // P3：智能排版/搜索定位强制重排
  const layoutSeq = useRef(0);
  const normalized = useRef(new Set());
  const pendingFocus = useRef(null); // 布局完成后要 fitView 聚焦的节点 id
  const project = state.project;
  const level = state.parent || null;
  const collapsedKey = project ? collapsedKeyOf(project) : '';
  rfApi = rf;

  function applySelection(id) {
    setSelectedId(id);
    setRfNodes(ns => ns.map(n => ({ ...n, selected: n.id === id, data: { ...n.data, forceSelected: n.id === id } })));
  }
  // 供 rwRevealNodes 在折叠集未变化（无重排）时也能刷新选中态
  window.rwApplySelection = applySelection;
  window.rwRf = rf; // 测试钩子：视口控制
  // P3：工具栏「智能排版」→ 重新 ELK 布局；搜索定位 → 重排后聚焦节点
  window.rwRelayout = () => setLayoutEpoch(e => e + 1);
  window.rwFocusNode = id => { pendingFocus.current = id; setLayoutEpoch(e => e + 1); };

  const model = useMemo(() => {
    if (!project) return null;
    const collapsed = collapsedSet(project);
    const base = kidsOf(project.nodes, level);
    const visible = new Set();
    const groups = new Map();
    base.forEach(n => {
      const kids = kidsOf(project.nodes, n.id);
      if (kids.length && !collapsed.has(n.id)) { groups.set(n.id, kids); kids.forEach(k => visible.add(k.id)); }
      visible.add(n.id);
    });
    const repOf = id => {
      let cur = project.nodes.find(n => n.id === id);
      let guard = 0;
      while (cur && guard++ < 32) {
        if (visible.has(cur.id)) return cur.id;
        cur = project.nodes.find(n => n.id === (cur.parent || null));
      }
      return null;
    };
    const edgeMap = new Map();
    project.edges.forEach(e => {
      const s = repOf(e.source), t = repOf(e.target);
      if (!s || !t || s === t) return;
      const key = s + '>' + t;
      const prev = edgeMap.get(key);
      if (prev) { prev.count += 1; if (e.label && !prev.labels.includes(e.label)) prev.labels.push(e.label); }
      else edgeMap.set(key, { source: s, target: t, count: 1, labels: e.label ? [e.label] : [] });
    });
    return { collapsed, base, groups, aggEdges: [...edgeMap.values()] };
  }, [project, level, collapsedKey]);

  function cardData(n) {
    const kids = kidsOf(project.nodes, n.id);
    const atLevel = (n.parent || null) === level;
    return {
      name: n.name, category: n.category, status: n.status,
      childCount: atLevel ? kids.length : 0,
      expanded: model.groups.has(n.id),
      grandCount: atLevel ? 0 : kids.length,
      onToggle: () => toggle(n.id),
      onSelect: () => { state.selected = n.id; applySelection(n.id); renderInspector(); if (window.notePanelNode) window.notePanelNode(n.id); },
      onDrill: () => { state.parent = n.id; state.selected = null; window.renderGraph(); renderInspector(); },
    };
  }

  function toggle(id) {
    const next = collapsedSet(project);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeVisual(project, { collapsed: next }, true);
    window.renderGraph();
  }

  // ELK 分层布局（含嵌套分组）；仅当层级/折叠集变化时重算，拖动不触发
  useEffect(() => {
    if (!model || !project) return;
    const seq = ++layoutSeq.current;
    const normKey = project.id + '|' + (level || 'root');
    const isFirst = !normalized.current.has(normKey);
    // P5：FLIP 动画准备——记录重排前各节点绝对坐标（与 DOM 中最后渲染一致）
    const absOf = (list, n) => {
      if (!n.parentId) return n.position;
      const p = list.find(x => x.id === n.parentId);
      const pp = p ? absOf(list, p) : { x: 0, y: 0 };
      return { x: pp.x + n.position.x, y: pp.y + n.position.y };
    };
    const prevAbs = new Map();
    rfNodes.forEach(n => prevAbs.set(n.id, absOf(rfNodes, n)));
    const children = model.base.map(n => {
      const kids = model.groups.get(n.id);
      if (!kids) return { id: n.id, width: CARD_W, height: CARD_H };
      const ids = new Set(kids.map(k => k.id));
      return {
        id: n.id,
        layoutOptions: {
          // P5：小分组（≤5 子节点）横向排布，告别单列长链
          'elk.direction': kids.length <= 5 ? 'RIGHT' : 'DOWN',
          'elk.padding': '[top=56,left=24,bottom=26,right=24]',
          'elk.spacing.nodeNode': '36',
          'elk.layered.spacing.nodeNodeBetweenLayers': '60',
        },
        children: kids.map(k => ({ id: k.id, width: CARD_W, height: CARD_H })),
        edges: project.edges
          .filter(e => ids.has(e.source) && ids.has(e.target))
          .map(e => ({ id: 'in-' + e.id, sources: [e.source], targets: [e.target] })),
      };
    });
    const baseIds = new Set(model.base.map(n => n.id));
    // P5：本层若近似链（边数 ≤ 节点数，至多一条跨层捷径）且规模小，整体横向排布
    const baseEdgeCount = model.aggEdges.filter(e => baseIds.has(e.source) && baseIds.has(e.target)).length;
    const isChain = model.base.length > 1 && model.base.length <= 6 && baseEdgeCount <= model.base.length;
    const dir = isChain ? 'RIGHT' : 'DOWN';
    new ELK().layout({
      id: 'rw-root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': dir,
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': '56',
        'elk.layered.spacing.nodeNodeBetweenLayers': '88',
        'elk.spacing.componentComponent': '70',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      },
      children,
      edges: model.aggEdges
        .filter(e => baseIds.has(e.source) && baseIds.has(e.target))
        .map((e, i) => ({ id: 'agg-' + i, sources: [e.source], targets: [e.target] })),
    }).then(out => {
      if (seq !== layoutSeq.current) return;
      const laid = new Map((out.children || []).map(c => [c.id, c]));
      const positions = Object.assign({}, (project.visual_layout || {}).positions || {});
      const savedSizes = (project.visual_layout || {}).sizes || {};
      const next = [];
      model.base.forEach(n => {
        const box = laid.get(n.id) || { x: 0, y: 0 };
        const kids = model.groups.get(n.id);
        if (kids) {
          const childPos = new Map((box.children || []).map(c => [c.id, c]));
          const gw = Math.round((savedSizes[n.id] && savedSizes[n.id].width) || box.width || 340);
          const gh = Math.round((savedSizes[n.id] && savedSizes[n.id].height) || box.height || 260);
          next.push({
            id: n.id, type: 'moduleGroup',
            position: { x: Math.round(box.x), y: Math.round(box.y) },
            style: { width: gw, height: gh },
            data: {
              name: n.name, category: n.category, onToggle: () => toggle(n.id),
              onSelect: () => { state.selected = n.id; applySelection(n.id); renderInspector(); if (window.notePanelNode) window.notePanelNode(n.id); },
              onResizeEnd: params => {
                const childRf = rfNodes.filter(x => x.parentId === n.id);
                const minW = Math.max(300, ...childRf.map(c => c.position.x + CARD_W + 26));
                const minH = Math.max(200, ...childRf.map(c => c.position.y + CARD_H + 26));
                const vl = project.visual_layout = project.visual_layout || {};
                vl.sizes = Object.assign({}, vl.sizes || {});
                vl.sizes[n.id] = {
                  width: Math.round(Math.max(params.width, minW)),
                  height: Math.round(Math.max(params.height, minH)),
                };
                writeVisual(project, { collapsed: collapsedSet(project) }, true);
                setRfNodes(ns => ns.map(x => x.id === n.id
                  ? { ...x, style: { ...x.style, width: vl.sizes[n.id].width, height: vl.sizes[n.id].height } }
                  : x));
              },
            },
          });
          kids.forEach(k => {
            const kp = childPos.get(k.id) || { x: 20, y: 60 };
            next.push({
              id: k.id, type: 'module', parentId: n.id, extent: 'parent',
              position: { x: Math.round(kp.x), y: Math.round(kp.y) },
              data: cardData(k),
            });
            positions[k.id] = { x: Math.round(box.x + kp.x), y: Math.round(box.y + kp.y) };
          });
        } else {
          next.push({ id: n.id, type: 'module', position: { x: Math.round(box.x), y: Math.round(box.y) }, data: cardData(n) });
        }
        positions[n.id] = { x: Math.round(box.x), y: Math.round(box.y) };
      });
      // 首次进入该项目该层：静默归一化（不标脏）；用户操作触发的重排：标脏待保存
      if (isFirst) normalized.current.add(normKey);
      writeVisual(project, { collapsed: model.collapsed, positions }, !isFirst);
      if (project.visual_layout) project.visual_layout.direction = dir;
      const sel = state.selected;
      setSelectedId(sel || null);
      setRfNodes(next.map(n => ({ ...n, selected: n.id === sel, data: { ...n.data, forceSelected: n.id === sel } })));
      setRfEdges(model.aggEdges.map((e, i) => {
        const label = e.labels.length ? (e.count > 1 ? `${e.labels[0]} 等 ${e.count} 条` : e.labels[0]) : undefined;
        const inferred = !!label && label.startsWith('推断'); // P4：推断边虚线 + 斜体弱色，不冒充已核验事实
        return {
          id: 'e' + i, source: e.source, target: e.target, type: 'smoothstep',
          label,
          labelStyle: { fontSize: 11, fill: inferred ? '#888780' : '#5F5E5A', fontStyle: inferred ? 'italic' : 'normal' },
          labelBgStyle: { fill: '#fffdf7', fillOpacity: 0.9 },
          style: { stroke: '#888780', strokeWidth: 1.2, ...(inferred ? { strokeDasharray: '5 4' } : {}) },
        };
      }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        // P5：FLIP——旧位置节点平移过渡、新出现节点淡入；reduced-motion 时跳过
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduceMotion && container) {
          const newAbs = new Map();
          next.forEach(n => newAbs.set(n.id, absOf(next, n)));
          next.forEach(n => {
            const el = container.querySelector('.react-flow__node[data-id="' + n.id + '"]');
            if (!el) return;
            const prev = prevAbs.get(n.id);
            if (prev && el.firstElementChild) {
              const cur = newAbs.get(n.id);
              const dx = prev.x - cur.x, dy = prev.y - cur.y;
              if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                el.firstElementChild.animate(
                  [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
                  { duration: 240, easing: 'cubic-bezier(.2,.7,.3,1)' });
              }
            } else if (!prev) {
              el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
            }
          });
        }
        setTimeout(() => {
          const focusId = pendingFocus.current;
          if (focusId) {
            pendingFocus.current = null;
            rf.fitView({ nodes: [{ id: focusId }], padding: 0.6, duration: 300 });
          } else {
            rf.fitView({ padding: 0.14, duration: 250 });
          }
        }, 60);
      }));
    }).catch(() => {
      const next = model.base.map((n, i) => ({
        id: n.id, type: model.groups.has(n.id) ? 'moduleGroup' : 'module',
        position: { x: (i % 3) * 280, y: Math.floor(i / 3) * 200 },
        style: model.groups.has(n.id) ? { width: 320, height: 260 } : undefined,
        data: model.groups.has(n.id) ? { name: n.name, category: n.category, onToggle: () => toggle(n.id) } : cardData(n),
      }));
      setRfNodes(next); setRfEdges([]);
    });
  }, [model, project, layoutEpoch]);

  // 面包屑/计数等旧 UI 同步
  useEffect(() => {
    const count = $('graph-count');
    if (count && project) count.textContent = `本层 ${model ? model.base.length : 0} 个模块 · 全部 ${project.nodes.length} 个模块`;
    const empty = $('canvas-empty');
    if (empty) empty.hidden = !model || !!model.base.length;
  });

  // P4：hover 时的派生渲染——链内高亮、链外淡出；rfNodes/rfEdges 仍是受控真源
  const dispNodes = useMemo(() => {
    if (!hoverChain) return rfNodes;
    return rfNodes.map(n => ({ ...n, className: hoverChain.nodes.has(n.id) ? 'rw-hot' : 'rw-dim' }));
  }, [rfNodes, hoverChain]);
  const dispEdges = useMemo(() => {
    if (!hoverChain) return rfEdges;
    return rfEdges.map(e => {
      const idx = parseInt(String(e.id).slice(1), 10);
      if (hoverChain.edges.has(idx)) {
        return {
          ...e, zIndex: 1000,
          style: { ...e.style, stroke: HOT.stroke, strokeWidth: HOT.strokeWidth },
          labelStyle: { ...e.labelStyle, fill: HOT.stroke, fontWeight: 600 },
        };
      }
      return {
        ...e,
        style: { ...e.style, opacity: 0.12 },
        labelStyle: { ...e.labelStyle, fillOpacity: 0 },
        labelBgStyle: { ...e.labelBgStyle, fillOpacity: 0 },
      };
    });
  }, [rfEdges, hoverChain]);

  return (
    <ReactFlow
      nodes={dispNodes} edges={dispEdges} nodeTypes={nodeTypes}
      onNodesChange={changes => setRfNodes(ns => applyNodeChanges(changes, ns))}
      onEdgesChange={changes => setRfEdges(es => applyEdgeChanges(changes, es))}
      onNodeClick={(e, node) => {
        state.selected = node.id;
        applySelection(node.id);
        renderInspector();
        if (window.notePanelNode) window.notePanelNode(node.id);
      }}
      onPaneClick={() => { state.selected = null; applySelection(null); renderInspector(); }}
      onNodeMouseEnter={(e, node) => { if (model) setHoverChain(traceChain(model.aggEdges, [node.id])); }}
      onNodeMouseLeave={() => setHoverChain(null)}
      onEdgeMouseEnter={(e, edge) => {
        if (!model) return;
        const idx = parseInt(String(edge.id).slice(1), 10);
        setHoverChain(traceChain(model.aggEdges, [edge.source, edge.target], idx));
      }}
      onEdgeMouseLeave={() => setHoverChain(null)}
      onNodeDragStop={(e, node) => {
        const target = project.nodes.find(n => n.id === node.id);
        if (!target) return;
        let abs = node.position;
        let parentOffset = { x: 0, y: 0 };
        if (node.parentId) {
          const parentRf = rfNodes.find(n => n.id === node.parentId);
          if (parentRf) parentOffset = parentRf.position;
        }
        abs = { x: parentOffset.x + node.position.x, y: parentOffset.y + node.position.y };
        target.x = Math.round(abs.x); target.y = Math.round(abs.y);
        const positions = Object.assign({}, (project.visual_layout || {}).positions || {});
        positions[node.id] = { x: target.x, y: target.y };
        // 拖动分组时同步子节点绝对坐标
        if (!node.parentId) {
          const groupRf = rfNodes.find(n => n.id === node.id);
          rfNodes.filter(n => n.parentId === node.id).forEach(childRf => {
            const childTarget = project.nodes.find(n => n.id === childRf.id);
            const ax = Math.round(groupRf.position.x + childRf.position.x);
            const ay = Math.round(groupRf.position.y + childRf.position.y);
            if (childTarget) { childTarget.x = ax; childTarget.y = ay; }
            positions[childRf.id] = { x: ax, y: ay };
          });
        }
        writeVisual(project, { collapsed: collapsedSet(project), positions }, true);
      }}
      nodesConnectable={false}
      deleteKeyCode={null}
      minZoom={0.25} maxZoom={1.8}
      onMove={(e, vp) => { const z = $('zoom'); if (z) z.textContent = Math.round(vp.zoom * 100) + '%'; }}
    >
      <Background gap={22} size={1.5} color="#E4E2D9" />
      <MiniMap pannable zoomable className="rw-minimap"
        nodeColor={n => pal((n.data || {}).category).border}
        nodeStrokeColor={n => pal((n.data || {}).category).border} />
    </ReactFlow>
  );
}

function CanvasApp() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

/* ---------- 笔记面板 → 画布反向定位 ---------- */
window.rwRevealNodes = ids => {
  const project = state.project;
  if (!project || !ids || !ids.length) return;
  const node = project.nodes.find(n => n.id === ids[0]);
  if (!node) return;
  const collapsed = collapsedSet(project);
  const depthOf = id => {
    let d = 0, cur = project.nodes.find(n => n.id === id);
    while (cur && cur.parent) { d++; cur = project.nodes.find(n => n.id === cur.parent); }
    return d;
  };
  if (depthOf(node.id) <= 1) {
    // 根层或组内一层：留在整体视图，展开祖先分组
    state.parent = null;
    let cur = node;
    while (cur && cur.parent) { collapsed.delete(cur.parent); cur = project.nodes.find(n => n.id === cur.parent); }
    if (kidsOf(project.nodes, node.id).length) collapsed.delete(node.id);
  } else {
    // 更深的节点：深入到其父级视图
    state.parent = node.parent || null;
    if (kidsOf(project.nodes, node.id).length) collapsed.delete(node.id);
  }
  writeVisual(project, { collapsed }, true);
  state.selected = node.id;
  if (window.rwApplySelection) window.rwApplySelection(node.id);
  window.renderGraph();
  renderInspector();
  if (window.notePanelNode) window.notePanelNode(node.id); // P3：反向定位也保持笔记高亮同步
};

/* ---------- 侧栏宽度拖拽（rail / 笔记面板 / 检查器） ---------- */
let resizersBound = false;
function setupPaneResizers() {
  if (resizersBound) return; resizersBound = true;
  const storeKey = 'rw-pane-widths';
  let widths = {};
  try { widths = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { widths = {}; }
  const conf = [
    ['rail-resizer', () => document.querySelector('.rail'), 'rail', 150, 420, 1],
    ['note-resizer', () => $('note-panel'), 'note', 210, 620, 1],
    ['inspector-resizer', () => document.querySelector('.inspector'), 'inspector', 240, 620, -1],
  ];
  conf.forEach(([hid, getEl, key, min, max, dir]) => {
    const handle = $(hid); const target = getEl();
    if (!handle || !target) return;
    if (widths[key]) target.style.width = widths[key] + 'px';
    handle.onpointerdown = e => {
      e.preventDefault();
      const startX = e.clientX, startW = target.getBoundingClientRect().width;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('rw-resizing');
      handle.onpointermove = ev => {
        const w = Math.round(Math.min(max, Math.max(min, startW + dir * (ev.clientX - startX))));
        target.style.width = w + 'px';
      };
      handle.onpointerup = () => {
        handle.onpointermove = null; handle.onpointerup = null;
        document.body.classList.remove('rw-resizing');
        widths[key] = Math.round(target.getBoundingClientRect().width);
        try { localStorage.setItem(storeKey, JSON.stringify(widths)); } catch { /* 忽略存储失败 */ }
      };
    };
  });
}

/* ---------- 接管 renderGraph ---------- */
let root = null, container = null, toolbarBound = false;

function rebindToolbar() {
  if (toolbarBound) return; toolbarBound = true;
  $('zoom-in').onclick = () => rfApi && rfApi.zoomIn({ duration: 150 });
  $('zoom-out').onclick = () => rfApi && rfApi.zoomOut({ duration: 150 });
  $('reset-view').onclick = () => rfApi && rfApi.fitView({ padding: 0.14, duration: 250 });
  const fit = $('fit-view'); if (fit) fit.onclick = () => rfApi && rfApi.fitView({ padding: 0.14, duration: 250 });
  window.fitView = () => rfApi && rfApi.fitView({ padding: 0.14, duration: 250 });
  // P3：智能排版 → 强制 ELK 重排（覆盖 app.js 旧的网格堆叠处理）
  const lay = $('layout');
  if (lay) lay.onclick = () => { if (window.rwRelayout) window.rwRelayout(); };
}

/* ---------- P3：模块目录 + 搜索定位 ---------- */
let searchBound = false;
function setupSearch() {
  if (searchBound) return; searchBound = true;
  const tools = document.querySelector('#workspace .tools');
  if (!tools) return;
  const wrap = document.createElement('div');
  wrap.className = 'rw-search';
  wrap.innerHTML = '<input id="node-search" type="search" placeholder="搜索模块…" autocomplete="off">' +
    '<div id="search-pop" class="rw-search-pop" hidden></div>';
  tools.insertBefore(wrap, tools.firstChild);
  const input = wrap.querySelector('#node-search');
  const pop = wrap.querySelector('#search-pop');

  const nameOf = id => { const n = state.project && state.project.nodes.find(x => x.id === id); return n ? n.name : ''; };
  const jump = id => {
    pop.hidden = true;
    window.rwRevealNodes([id]);       // 展开祖先分组 + 选中 + 检查器 + 笔记联动
    if (window.rwFocusNode) window.rwFocusNode(id); // 重排后视口聚焦
  };
  const item = (id, depth, extra) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rw-search-item lv' + depth;
    const nm = document.createElement('span');
    nm.className = 'rw-search-name'; nm.textContent = nameOf(id);
    b.append(nm);
    if (extra) { const s = document.createElement('span'); s.className = 'rw-search-extra'; s.textContent = extra; b.append(s); }
    b.onclick = () => jump(id);
    return b;
  };

  function renderPop() {
    const p = state.project;
    pop.replaceChildren();
    if (!p) { pop.hidden = true; return; }
    const q = input.value.trim().toLowerCase();
    if (!q) {
      // 目录态：当前层级的模块树（根层为 7 大模块）
      const roots = p.nodes.filter(n => !n.parent);
      roots.forEach(r => {
        const kids = kidsOf(p.nodes, r.id);
        pop.append(item(r.id, 0, kids.length ? kids.length + ' 子模块' : ''));
        kids.forEach(k => {
          const gk = kidsOf(p.nodes, k.id);
          pop.append(item(k.id, 1, gk.length ? gk.length + '' : ''));
        });
      });
    } else {
      const hits = p.nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 20);
      if (!hits.length) {
        const d = document.createElement('div');
        d.className = 'rw-search-empty'; d.textContent = '没有名称包含「' + input.value.trim() + '」的模块';
        pop.append(d);
      }
      hits.forEach(n => {
        const par = n.parent ? nameOf(n.parent) : '';
        pop.append(item(n.id, 0, par));
      });
    }
    pop.hidden = false;
  }

  input.addEventListener('focus', renderPop);
  input.addEventListener('input', renderPop);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.blur(); pop.hidden = true; }
    if (e.key === 'Enter') {
      const first = pop.querySelector('.rw-search-item');
      if (first) first.click();
    }
  });
  document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) pop.hidden = true; });
}

function renderBreadcrumbs() {
  const p = state.project; if (!p) return;
  const bc = $('breadcrumbs'); if (!bc) return;
  bc.replaceChildren();
  const mkBtn = (text, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = text;
    b.onclick = () => action(fn);
    return b;
  };
  bc.append(mkBtn('整体结构', async () => { state.parent = null; state.selected = null; window.renderGraph(); renderInspector(); }));
  const chain = [];
  let cur = p.nodes.find(n => n.id === state.parent);
  while (cur) { chain.unshift(cur); cur = p.nodes.find(n => n.id === (cur.parent || null)); }
  chain.forEach(n => bc.append(mkBtn(n.name, async () => { state.parent = n.id; state.selected = null; window.renderGraph(); renderInspector(); })));
}

const oldRenderGraph = window.renderGraph;
window.renderGraph = function () {
  if (window.renderNotePanel) window.renderNotePanel();
  if (!state.project) { oldRenderGraph(); return; }
  const canvas = $('canvas');
  if (!container) {
    container = document.createElement('div');
    container.id = 'rf-root';
    canvas.insertBefore(container, canvas.querySelector('.canvas-bottom'));
    $('world').style.display = 'none';
    const caption = canvas.querySelector('.canvas-caption');
    if (caption) caption.textContent = '滚轮缩放 · 拖动平移 · 点击模块查看详情 · 悬停高亮数据链 · ▸ 展开分组 · 工具栏可搜索定位模块';
    rebindToolbar();
    setupPaneResizers();
    setupSearch();
  }
  if (!root) root = createRoot(container);
  root.render(<CanvasApp />);
  renderBreadcrumbs();
};
