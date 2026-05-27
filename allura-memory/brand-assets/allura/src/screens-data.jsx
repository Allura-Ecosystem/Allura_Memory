/* screens-data.jsx — Logs (Search), Provenance trail, Extracted, Graph */

function TableHeader({ children }) {
  return <th style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-panel-subtle)', whiteSpace: 'nowrap' }}>{children}</th>;
}
function TableCell({ children, mono, style }) {
  return <td style={{ fontSize: 13, color: 'var(--color-text-primary)', padding: '12px 14px', borderBottom: '1px solid var(--color-page-bg)', fontFamily: mono ? "'IBM Plex Mono', monospace" : 'inherit', ...style }}>{children}</td>;
}

// SCREEN: Logs (search) — table view of all retrieve/recall calls
function ScreenLogs() {
  const [q, setQ] = React.useState('');
  const rows = ALLURA_TRACES.filter(r => !q || r.tool.includes(q.toLowerCase()) || r.agent.includes(q.toLowerCase()));
  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-blue)' }}><NavIcon name="search" size={15}/></div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search trace logs by tool, agent, session…" style={{ width: '100%', height: 40, borderRadius: 10, border: '1px solid var(--color-border)', background: '#fff', padding: '0 16px 0 38px', fontSize: 13.5, color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit' }}/>
        </div>
        <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="filter" size={12}/> Filter</button>
        <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="sort" size={12}/> Sort</button>
        <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="export" size={12}/> Export</button>
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <TableHeader>Tool</TableHeader>
            <TableHeader>Agent</TableHeader>
            <TableHeader>Confidence</TableHeader>
            <TableHeader>Payload</TableHeader>
            <TableHeader>Timestamp</TableHeader>
            <TableHeader></TableHeader>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover-row" style={{ cursor: 'pointer' }}>
                <TableCell mono><span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{r.tool}</span></TableCell>
                <TableCell><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)' }}/>{r.agent}</span></TableCell>
                <TableCell><ConfidencePill value={Math.round(r.confidence * 100)}/></TableCell>
                <TableCell mono style={{ color: 'var(--color-text-secondary)', fontSize: 11.5, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.payload}</TableCell>
                <TableCell style={{ color: 'var(--color-text-caption)', fontSize: 12 }}>{r.ts}</TableCell>
                <TableCell><NavIcon name="right" size={13}/></TableCell>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border-light)' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>{rows.length} of 12,348 trace events</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Previous</button>
            <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Next</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// SCREEN: Provenance trail — chronological evidence trail with detail
function ScreenProvenance() {
  const [selected, setSelected] = React.useState(ALLURA_TRACES[0]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', height: 'calc(100vh - 64px)' }}>
      <div style={{ overflowY: 'auto', padding: '24px 32px 60px' }}>
        <Card padding={0} style={{ overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)' }}>
            <div>
              <Overline>Provenance trail</Overline>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>Chronological evidence ledger</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Last 7 days</button>
              <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>All agents</button>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <TableHeader>Event</TableHeader>
              <TableHeader>Memory</TableHeader>
              <TableHeader>Agent</TableHeader>
              <TableHeader>Confidence</TableHeader>
              <TableHeader>When</TableHeader>
            </tr></thead>
            <tbody>
              {ALLURA_TRACES.map((t, i) => (
                <tr key={t.id} onClick={() => setSelected(t)} className="hover-row" style={{ cursor: 'pointer', background: selected.id === t.id ? 'var(--color-panel-subtle)' : 'transparent' }}>
                  <TableCell mono><span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{t.tool}</span></TableCell>
                  <TableCell><span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>mem_{t.id}f{i}c</span></TableCell>
                  <TableCell><span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>{t.agent}</span></TableCell>
                  <TableCell><ConfidencePill value={Math.round(t.confidence * 100)}/></TableCell>
                  <TableCell style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>{t.ts}</TableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Selected timeline */}
        <Overline>Selected · {selected.tool}</Overline>
        <div style={{ marginTop: 12, position: 'relative', paddingLeft: 22 }}>
          <div style={{ position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, background: 'var(--color-border-light)' }}/>
          {[
            { label: 'Captured', body: 'allura-core parsed conversation segment from sess_9k2x', ts: 'May 21 · 14:21' },
            { label: 'Scored', body: 'allura-curator assigned confidence 0.87 based on 3 corroborating mentions', ts: 'May 21 · 14:21' },
            { label: 'Stored', body: 'memory.store wrote to L4 episodic with provenance trace', ts: 'May 21 · 14:22' },
            { label: 'Linked', body: 'allura-graph created edge to mem_2d0a (refines)', ts: 'May 21 · 14:23' },
          ].map((step, i, arr) => (
            <div key={i} style={{ position: 'relative', paddingBottom: i === arr.length - 1 ? 0 : 18 }}>
              <div style={{ position: 'absolute', left: -22, top: 4, width: 14, height: 14, borderRadius: '50%', background: i === 0 ? 'var(--color-text-primary)' : '#fff', border: '2px solid var(--color-text-primary)' }}/>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-accent-premium)', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 3 }}>{step.label}</div>
              <div style={{ fontSize: 13.5, color: 'var(--color-text-primary)', lineHeight: 1.55, marginBottom: 3 }}>{step.body}</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>{step.ts}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Detail */}
      <aside style={{ background: 'var(--color-panel-subtle)', borderLeft: '1px solid var(--color-border-light)', overflowY: 'auto', padding: '20px 22px' }}>
        <Overline>Trace details</Overline>
        <div style={{ marginTop: 10, marginBottom: 14, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: "'IBM Plex Mono', monospace" }}>{selected.tool}</div>
        <DetailRow label="Agent" value={selected.agent}/>
        <DetailRow label="Confidence" value={`${(selected.confidence * 100).toFixed(0)}%`}/>
        <DetailRow label="Timestamp" value={selected.ts}/>
        <DetailRow label="Session" value="sess_9k2x"/>
        <DetailRow label="Cost" value="0.0008 ¢"/>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Payload</div>
          <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-border-light)', background: 'var(--color-text-primary)', borderRadius: 8, padding: '12px 14px', overflow: 'auto', lineHeight: 1.55 }}>{selected.payload}</pre>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Result</div>
          <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-text-secondary)', background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '12px 14px', overflow: 'auto', lineHeight: 1.55 }}>{`{
  "id": "mem_4f1c",
  "stored": true,
  "edges": ["mem_2d0a"]
}`}</pre>
        </div>
      </aside>
    </div>
  );
}

// SCREEN: Extracted memories — table of subject/type/value
function ScreenExtracted() {
  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div>
          <Overline>Extractions</Overline>
          <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>Structured memories pulled from conversations</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="filter" size={12}/> Subjects</button>
          <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="export" size={12}/> Export CSV</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Total extracted', value: '12,348' },
          { label: 'This week', value: '184' },
          { label: 'High confidence', value: '8,502' },
          { label: 'Pending review', value: '95' },
        ].map(s => (
          <Card key={s.label} padding={16}>
            <div style={{ fontSize: 11, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 6, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}>{s.value}</div>
          </Card>
        ))}
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <TableHeader>Subject</TableHeader>
            <TableHeader>Type</TableHeader>
            <TableHeader>Value</TableHeader>
            <TableHeader>Confidence</TableHeader>
            <TableHeader>Source</TableHeader>
            <TableHeader>Date</TableHeader>
          </tr></thead>
          <tbody>
            {ALLURA_EXTRACTIONS.map(e => (
              <tr key={e.id} className="hover-row" style={{ cursor: 'pointer' }}>
                <TableCell><span style={{ fontWeight: 500 }}>{e.subject}</span></TableCell>
                <TableCell><Tag tone={e.type === 'preference' ? 'amber' : e.type === 'identity' ? 'navy' : 'neutral'}>{e.type}</Tag></TableCell>
                <TableCell style={{ maxWidth: 480 }}><span style={{ color: 'var(--color-text-secondary)' }}>{e.value}</span></TableCell>
                <TableCell><ConfidenceBar value={e.confidence} width={80}/></TableCell>
                <TableCell mono style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>{e.source}</TableCell>
                <TableCell style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>{e.date}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// SCREEN: Graph — radial relationship visualization
function ScreenGraph() {
  const [hover, setHover] = React.useState(null);
  const [selected, setSelected] = React.useState(null);
  const W = 760, H = 600;
  const nodes = ALLURA_GRAPH_NODES.map(n => ({ ...n, px: W/2 + n.x * (W/2 - 80), py: H/2 + n.y * (H/2 - 60) }));
  const map = Object.fromEntries(nodes.map(n => [n.id, n]));
  const tierColor = { 1: 'var(--color-text-primary)', 2: 'var(--color-text-secondary)', 3: 'var(--color-blue)', 4: 'var(--color-accent-premium)' };
  const tierLabel = { 1: 'Identity', 2: 'Cluster', 3: 'Memory', 4: 'Detail' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', height: 'calc(100vh - 64px)' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at center, var(--color-surface) 0%, var(--color-page-bg) 100%)' }}>
        {/* Toolbar */}
        <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 6, zIndex: 5 }}>
          {/* View mode label — only Radial is implemented, others coming soon */}
          {['Force', 'Radial', 'Hierarchy'].map((m, i) => (
            <span key={m} style={{ background: i === 1 ? 'var(--color-text-primary)' : 'var(--color-card-bg)', color: i === 1 ? var(--color-white) : 'var(--color-text-secondary)', border: '1px solid ' + (i === 1 ? 'var(--color-text-primary)' : 'var(--color-border)'), borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}>{m}</span>
          ))}
        </div>
        <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 6, zIndex: 5 }}>
          <button disabled style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'inherit', opacity: 0.5, cursor: 'not-allowed' }}>−</button>
          <button disabled style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'inherit', opacity: 0.5, cursor: 'not-allowed' }}>+</button>
          <button onClick={() => window.location.reload()} style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>
        </div>
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'var(--color-card-bg)', backdropFilter: 'blur(6px)', border: '1px solid var(--color-border-light)', borderRadius: 10, padding: '10px 14px', fontSize: 12, zIndex: 5 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Layers</div>
          {Object.entries(tierColor).map(([t, c]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }}/>
              <span style={{ color: 'var(--color-text-secondary)' }}>L{t} · {tierLabel[t]}</span>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%' }}>
          <defs>
            <radialGradient id="ringGrad">
              <stop offset="0%" stopColor="#fff" stopOpacity="0"/>
              <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.08"/>
            </radialGradient>
          </defs>
          {/* radial guides */}
          {[0.25, 0.5, 0.75, 1].map((r, i) => <circle key={i} cx={W/2} cy={H/2} r={r * (W/2 - 80)} fill="none" stroke="var(--color-border-light)" strokeDasharray="3 4"/>)}
          <circle cx={W/2} cy={H/2} r={W/2 - 80} fill="url(#ringGrad)"/>

          {/* edges */}
          {ALLURA_GRAPH_EDGES.map(([a, b], i) => {
            const A = map[a], B = map[b];
            const dim = hover && hover !== a && hover !== b;
            return <line key={i} x1={A.px} y1={A.py} x2={B.px} y2={B.py} stroke={dim ? 'var(--color-border-light)' : 'var(--color-border)'} strokeWidth={hover && (hover === a || hover === b) ? 2 : 1}/>;
          })}

          {/* nodes */}
          {nodes.map(n => {
            const r = n.tier === 1 ? 22 : n.tier === 2 ? 16 : n.tier === 3 ? 11 : 7;
            const dim = hover && hover !== n.id && !ALLURA_GRAPH_EDGES.some(([a, b]) => (a === hover && b === n.id) || (b === hover && a === n.id));
            return (
              <g key={n.id} style={{ cursor: 'pointer', opacity: dim ? 0.35 : 1, transition: 'opacity 150ms' }} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => setSelected(n)}>
                <circle cx={n.px} cy={n.py} r={r + 4} fill="var(--color-card-bg)"/>
                <circle cx={n.px} cy={n.py} r={r} fill={tierColor[n.tier]} stroke="var(--color-card-bg)" strokeWidth="2"/>
                {n.tier <= 2 && <text x={n.px} y={n.py + r + 14} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--color-text-primary)">{n.label}</text>}
                {n.tier > 2 && <text x={n.px} y={n.py + r + 12} textAnchor="middle" fontSize="10.5" fill="var(--color-text-secondary)">{n.label}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      {/* Inspector */}
      <aside style={{ background: 'var(--color-card-bg)', borderLeft: '1px solid var(--color-border-light)', overflowY: 'auto', padding: '20px 22px' }}>
        <Overline>Graph inspector</Overline>
        {selected ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>{selected.label}</div>
            <Tag tone="navy">L{selected.tier} · {tierLabel[selected.tier]}</Tag>
            <div style={{ marginTop: 16 }}>
              <DetailRow label="Kind" value={selected.kind}/>
              <DetailRow label="Connections" value={ALLURA_GRAPH_EDGES.filter(e => e.includes(selected.id)).length}/>
              <DetailRow label="Layer" value={`L${selected.tier}`}/>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Connected to</div>
              {ALLURA_GRAPH_EDGES.filter(e => e.includes(selected.id)).map((e, i) => {
                const other = e[0] === selected.id ? e[1] : e[0];
                const o = map[other];
                return (
                  <div key={i} onClick={() => setSelected(o)} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--color-panel-subtle)', marginBottom: 6, fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: tierColor[o.tier] }}/>
                    {o.label}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 14, padding: 18, background: 'var(--color-panel-subtle)', borderRadius: 12, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Click any node to see its memories, connections, and provenance. Hover to highlight neighborhoods.
          </div>
        )}
        <div style={{ marginTop: 24 }}>
          <Overline>Stats</Overline>
          <div style={{ marginTop: 10 }}>
            <DetailRow label="Nodes" value={nodes.length}/>
            <DetailRow label="Edges" value={ALLURA_GRAPH_EDGES.length}/>
            <DetailRow label="Density" value="0.41"/>
            <DetailRow label="Clusters" value="3"/>
          </div>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { ScreenLogs, ScreenProvenance, ScreenExtracted, ScreenGraph });
