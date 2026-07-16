import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { api } from "../api";
import { IssueModel } from "../models/IssueModel";
import type { Status, DependencyType } from "../types";

interface Props {
  onSelectIssue: (id: string) => void;
}

interface GraphNode {
  issue: IssueModel;
  x: number;
  y: number;
  layer: number;
}

interface GraphEdge {
  from: string;
  to: string;
  depType: DependencyType;
}

const NODE_W = 220;
const NODE_H = 56;
const LAYER_GAP = 100;
const NODE_GAP = 30;
const PAD = 60;

const statusColors: Record<Status, string> = {
  open: "var(--text-muted)",
  in_progress: "var(--yellow)",
  blocked: "var(--red)",
  deferred: "var(--accent)",
  closed: "var(--text-muted)",
};

const statusBg: Record<Status, string> = {
  open: "var(--surface2)",
  in_progress: "color-mix(in srgb, var(--yellow) 10%, var(--surface2))",
  blocked: "color-mix(in srgb, var(--red) 10%, var(--surface2))",
  deferred: "color-mix(in srgb, var(--accent) 10%, var(--surface2))",
  closed: "var(--surface2)",
};

const depTypeColors: Record<DependencyType, string> = {
  blocks: "var(--red)",
  related: "var(--text-muted)",
  "parent-child": "var(--purple)",
  "relates-to": "var(--accent)",
  duplicates: "var(--orange)",
  supersedes: "var(--yellow)",
  "replies-to": "var(--green)",
};

function computeLayout(
  issues: IssueModel[]
): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const issueMap = new Map<string, IssueModel>();
  for (const i of issues) issueMap.set(i.id, i);

  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  const edges: GraphEdge[] = [];

  for (const i of issues) {
    children.set(i.id, []);
    parents.set(i.id, []);
  }

  for (const i of issues) {
    if (!i.dependencies) continue;
    for (const dep of i.dependencies) {
      if (!issueMap.has(dep.id)) continue;
      children.get(dep.id)!.push(i.id);
      parents.get(i.id)!.push(dep.id);
      edges.push({ from: dep.id, to: i.id, depType: dep.dep_type });
    }
  }

  const layers = new Map<string, number>();
  const visited = new Set<string>();

  function assignLayer(id: string): number {
    if (layers.has(id)) return layers.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const pars = parents.get(id) ?? [];
    const layer = pars.length === 0 ? 0 : Math.max(...pars.map(assignLayer)) + 1;
    layers.set(id, layer);
    return layer;
  }

  for (const i of issues) assignLayer(i.id);

  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  const maxLayer = Math.max(...layerGroups.keys(), 0);
  for (let l = 1; l <= maxLayer; l++) {
    const group = layerGroups.get(l);
    if (!group || group.length <= 1) continue;
    group.sort((a, b) => {
      const aParents = parents.get(a) ?? [];
      const bParents = parents.get(b) ?? [];
      const aCenter =
        aParents.length > 0
          ? aParents.reduce((s, p) => s + (layers.get(p) ?? 0), 0) / aParents.length
          : 0;
      const bCenter =
        bParents.length > 0
          ? bParents.reduce((s, p) => s + (layers.get(p) ?? 0), 0) / bParents.length
          : 0;
      return aCenter - bCenter;
    });
  }

  const maxNodesInLayer = Math.max(...[...layerGroups.values()].map((g) => g.length), 1);
  const totalWidth = maxNodesInLayer * (NODE_W + NODE_GAP) - NODE_GAP + PAD * 2;
  const totalHeight = (maxLayer + 1) * (NODE_H + LAYER_GAP) - LAYER_GAP + PAD * 2;

  const nodePositions = new Map<string, GraphNode>();

  for (const [layer, ids] of layerGroups) {
    const layerWidth = ids.length * (NODE_W + NODE_GAP) - NODE_GAP;
    const startX = (totalWidth - layerWidth) / 2;
    const y = PAD + layer * (NODE_H + LAYER_GAP);

    ids.forEach((id, idx) => {
      const x = startX + idx * (NODE_W + NODE_GAP);
      const issue = issueMap.get(id)!;
      nodePositions.set(id, { issue, x, y, layer });
    });
  }

  return {
    nodes: [...nodePositions.values()],
    edges,
    width: totalWidth,
    height: totalHeight,
  };
}

export function DependencyGraphView({ onSelectIssue }: Props) {
  const [issues, setIssues] = useState<IssueModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const issuesData = await api.issues.list({});
        const issues = issuesData.map(IssueModel.from);
        
        const issuesWithDeps = await Promise.all(
          issues.map(async (issue) => {
            try {
              const deps = await api.deps.list(issue.id);
              if (deps && Array.isArray(deps) && deps.length > 0) {
                issue.dependencies = (deps as Record<string, unknown>[]).map((dep) => ({
                  id: String(dep.id || dep.issue_id || ""),
                  dep_type: (dep.dep_type || dep.type || "related") as DependencyType,
                  title: dep.title as string | undefined,
                  status: dep.status as Status | undefined,
                }));
              }
            } catch {
              // Ignore errors for individual issues
            }
            return issue;
          })
        );
        
        setIssues(issuesWithDeps);
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { nodes, edges, width, height } = useMemo(() => computeLayout(issues), [issues]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.issue.id, n);
    return m;
  }, [nodes]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => {
      const newScale = Math.min(Math.max(t.scale * delta, 0.2), 3);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newX = mx - (mx - t.x) * (newScale / t.scale);
      const newY = my - (my - t.y) * (newScale / t.scale);
      return { x: newX, y: newY, scale: newScale };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setTransform((t) => ({
      ...t,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }));
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--text-muted)] text-sm">
        Loading graph…
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-5 rounded-lg border border-[var(--red)]/30 bg-[var(--red)]/10 p-4 text-sm text-[var(--red)]">
        {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
        <span className="text-2xl">◇</span>
        <span className="text-sm">No issues to display</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="absolute top-3 left-3 z-10 flex gap-3 text-[10px] text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--red)" }} />
          blocks
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--purple)" }} />
          parent-child
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--accent)" }} />
          relates-to
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--orange)" }} />
          duplicates
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--yellow)" }} />
          supersedes
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--green)" }} />
          replies-to
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: "var(--text-muted)" }} />
          related
        </span>
      </div>

      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="var(--text-muted)" opacity="0.5" />
          </marker>
        </defs>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {edges.map((edge, i) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x + NODE_W / 2;
            const y1 = fromNode.y + NODE_H;
            const x2 = toNode.x + NODE_W / 2;
            const y2 = toNode.y;
            const cy1 = y1 + (y2 - y1) * 0.4;
            const cy2 = y2 - (y2 - y1) * 0.4;

            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                fill="none"
                stroke={depTypeColors[edge.depType]}
                strokeWidth="1.5"
                opacity="0.4"
                markerEnd="url(#arrowhead)"
              />
            );
          })}
        </g>
      </svg>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {nodes.map((node) => {
          const color = statusColors[node.issue.status];
          const bg = statusBg[node.issue.status];
          return (
            <div
              key={node.issue.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectIssue(node.issue.id);
              }}
              className="absolute rounded-lg border border-[var(--border)] px-3 py-2 cursor-pointer hover:border-[var(--accent)] transition-colors"
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${NODE_W}px`,
                height: `${NODE_H}px`,
                background: bg,
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {node.issue.id}
                </span>
              </div>
              <div
                className="text-xs text-[var(--text)] truncate"
                title={node.issue.title}
              >
                {node.issue.title}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
