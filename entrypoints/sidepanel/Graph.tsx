import {tutorialAction} from '../../lib/tutorial';
import { useMemo, useState } from 'react';
import type { Library } from '../../lib/library-model';
import { knowledgeGraph } from '../../lib/graph';
import { useKnowledge } from './Intelligence';
export function Graph({ library, open }: { library: Library; open: (id: string) => void }) {
  const { data } = useKnowledge(),
    [space, setSpace] = useState(''),
    [query, setQuery] = useState(''),
    [selected, select] = useState('');
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const graph = useMemo(() => knowledgeGraph(library, data.cards, space), [library, data.cards, space]);
  const matches = graph.nodes.filter((n) => n.label.toLowerCase().includes(query.toLowerCase()));
  const active = graph.nodes.find((n) => n.id === selected);
  const adjacent = graph.edges.filter((e) => e.a === selected || e.b === selected);
  const visible = (
    query
      ? matches
      : active
        ? [
            active,
            ...graph.nodes.filter(
              (n) => adjacent.some((e) => e.a === n.id || e.b === n.id) && n.id !== active.id,
            ),
          ]
        : matches
  ).slice(0, 32);
  const coords = new Map(
    visible.map((n, i) => [
      n.id,
      {
        x: 180 + 128 * Math.cos((i * 2 * Math.PI) / visible.length),
        y: 150 + 104 * Math.sin((i * 2 * Math.PI) / visible.length),
      },
    ]),
  );
  return (
    <details className="card" data-tour="graph">
      <summary>Knowledge graph</summary>
      <label>
        Graph space
        <select
          value={space}
          onChange={(e) => {
            setSpace(e.target.value);
            select('');
          }}
        >
          <option value="">All spaces</option>
          {library.spaces.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Find nodes
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <svg
        className="knowledge-graph"
        viewBox="0 0 360 300"
        aria-label="Knowledge graph. Use the node list below for keyboard navigation."
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setPan((p) => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
        }}
      >
        <g
          transform={
            'translate(' +
            pan.x +
            ' ' +
            pan.y +
            ') translate(180 150) scale(' +
            zoom +
            ') translate(-180 -150)'
          }
        >
          {graph.edges.map((e) => {
            const a = coords.get(e.a),
              b = coords.get(e.b);
            return a && b ? (
              <line
                key={e.a + e.b}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="currentColor"
                strokeDasharray={e.inferred ? '4 3' : undefined}
              />
            ) : null;
          })}
          {visible.map((n) => {
            const p = coords.get(n.id)!;
            return (
              <g
                key={n.id}
                transform={'translate(' + p.x + ' ' + p.y + ')'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {select(n.id);tutorialAction('graph');}}
              >
                <title>{n.kind + ' · ' + n.label}</title>
                <circle r="8" fill="var(--accent)" />
                <text y="20" textAnchor="middle" fill="currentColor" fontSize="9">
                  {n.label.slice(0, 15)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <button onClick={() => setZoom(Math.min(3, zoom + 0.25))}>Zoom in</button>{' '}
      <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>Zoom out</button>{' '}
      <button
        onClick={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          select('');
        }}
      >
        Reset view
      </button>
      <p>
        Solid links show saved relationships. Dashed links show AI-identified concepts. The diagram shows up
        to 32 nodes.
      </p>
      <label>
        Browse all matching nodes
        <select value={selected} onChange={(e) => {select(e.target.value);if(e.target.value)tutorialAction('graph');}}>
          <option value="">Choose a node</option>
          {matches.map((n) => (
            <option key={n.id} value={n.id}>
              {n.kind} · {n.label}
            </option>
          ))}
        </select>
      </label>
      {active && (
        <>
          <strong>{active.label}</strong>
          <p>{active.detail}</p>
          {active.articleId && <button onClick={() => open(active.articleId!)}>Open linked resource</button>}
          {adjacent.map((e) => {
            const n = graph.nodes.find((n) => n.id === (e.a === active.id ? e.b : e.a));
            return (
              n && (
                <p key={n.id}>
                  <button onClick={() => {select(n.id);tutorialAction('graph');}}>
                    {e.label} · {n.label}
                  </button>
                </p>
              )
            );
          })}
        </>
      )}
    </details>
  );
}
