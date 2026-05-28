/* screens-overview.jsx — Dashboard, Memory list, Memory detail */

function StatTile({ label, value, sub, accent, spark, sparkColor }) {
  return (
    <Card padding={20} className="hover-lift" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <Overline>{label}</Overline>
        {accent && <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: accent.bg, color: accent.color, border: `1px solid ${accent.border}` }}>{accent.text}</span>}
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>{value}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 12, color: 'var(--color-text-caption)', lineHeight: 1.5 }}>{sub}</div>
        {spark && <Sparkline data={spark} color={sparkColor || 'var(--color-blue)'} width={70} height={22}/>}
      </div>
    </Card>
  );
}

// Layered ring chart for the dashboard hero
function MemoryRing({ size = 280 }) {
  const cx = size / 2, cy = size / 2;
  const layers = [
    { r: size * 0.42, label: 'L4 · Episodic',  pct: 0.78, color: 'var(--color-accent-premium)' },
    { r: size * 0.34, label: 'L3 · Semantic',  pct: 0.62, color: 'var(--color-blue)' },
    { r: size * 0.26, label: 'L2 · Working',   pct: 0.45, color: 'var(--color-text-secondary)' },
    { r: size * 0.18, label: 'L1 · Identity',  pct: 0.95, color: 'var(--color-text-primary)' },
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* tick marks */}
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const r1 = size * 0.46, r2 = size * 0.48;
        const major = i % 5 === 0;
        return <line key={i} x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1} x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2} stroke={major ? 'var(--color-border-light)' : 'var(--color-border-light)'} strokeWidth={major ? 1 : 0.6}/>;
      })}
      {layers.map((L, i) => {
        const C = 2 * Math.PI * L.r;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={L.r} fill="none" stroke="var(--color-border-light)" strokeWidth="6"/>
            <circle cx={cx} cy={cy} r={L.r} fill="none" stroke={L.color} strokeWidth="6" strokeDasharray={`${C * L.pct} ${C}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}/>
          </g>
        );
      })}
      {/* center */}
      <circle cx={cx} cy={cy} r={size * 0.10} fill="#fff" stroke="var(--color-border-light)"/>
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--color-text-primary)" fontFamily="Outfit, sans-serif">12,348</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--color-accent-premium)" letterSpacing="2.5">MEMORIES</text>
    </svg>
  );
}

function ScreenDashboard({ go, onAddMemory }) {
  const recent = ALLURA_AGENT_ACTIVITY.slice(0, 4);
  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <Overline>Allura memory · system overview</Overline>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text-primary)', margin: '8px 0 6px', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>What your system remembers, in plain view.</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', maxWidth: 640, lineHeight: 1.65, margin: 0 }}>A live read of the four memory layers, recent extractions, and the four agents keeping it honest.</p>
      </div>

      {/* Hero: ring chart — single focal point */}
      <Card padding={32} className="hover-lift" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <Overline>Layer distribution</Overline>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 8 }}>Memory across 4 layers</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-caption)', marginTop: 2 }}>Identity → Working → Semantic → Episodic</div>
          </div>
          <button onClick={() => go('graph')} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            Open graph <NavIcon name="arrow" size={11}/>
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40, justifyContent: 'center', flexWrap: 'wrap' }}>
          <MemoryRing size={280}/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 200 }}>
            {[
              { label: 'L4 · Episodic',  count: '8,214', pct: 78, color: 'var(--color-accent-premium)' },
              { label: 'L3 · Semantic',  count: '2,901', pct: 62, color: 'var(--color-blue)' },
              { label: 'L2 · Working',   count: '1,108', pct: 45, color: 'var(--color-text-secondary)' },
              { label: 'L1 · Identity',  count: '125',   pct: 95, color: 'var(--color-text-primary)' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: l.color, flexShrink: 0 }}/>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-primary)' }}>{l.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-caption)', fontVariantNumeric: 'tabular-nums' }}>{l.count}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--color-page-bg)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: 4, width: `${l.pct}%`, background: l.color, borderRadius: 2 }}/>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Stats row: 4 clean tiles */}
      <div className="stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <StatTile label="Total memories" value="12,348" sub="this month · 96.6% extracted" accent={{ text: '+8.4%', bg: 'var(--color-status-success-bg)', color: 'var(--color-green)', border: 'var(--color-status-success-border)' }} spark={ALLURA_SPARKS.capture} sparkColor="var(--color-blue)"/>
        <StatTile label="Recall hit-rate" value="96.6%" sub="last 7 days" accent={{ text: 'Healthy', bg: 'var(--color-status-success-bg)', color: 'var(--color-green)', border: 'var(--color-status-success-border)' }} spark={ALLURA_SPARKS.recall} sparkColor="var(--color-green)"/>
        <StatTile label="Curator queue" value="95" sub="proposals awaiting review" accent={{ text: '24 today', bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)' }} spark={ALLURA_SPARKS.curate} sparkColor="var(--color-accent-premium)"/>
        <StatTile label="Graph density" value="0.41" sub="edges / node · stable" spark={ALLURA_SPARKS.graph} sparkColor="var(--color-blue)"/>
      </div>

      {/* Recent extractions + agent state */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card padding={0}>
          <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Overline>Recent extractions</Overline>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 6 }}>Captured in the last 24 hours</div>
            </div>
            <button onClick={() => go('extracted')} style={{ background: 'none', border: 'none', color: 'var(--color-blue)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>View all <NavIcon name="arrow" size={11}/></button>
          </div>
          <div>
            {ALLURA_EXTRACTIONS.slice(0, 4).map((e, i) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 80px 80px', gap: 16, padding: '14px 22px', borderBottom: i === 3 ? 'none' : '1px solid var(--color-page-bg)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{e.subject}</div>
                  <Tag tone={e.type === 'preference' ? 'amber' : e.type === 'identity' ? 'navy' : 'neutral'}>{e.type}</Tag>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{e.value}</div>
                <ConfidenceBar value={e.confidence} width={70} showLabel={true}/>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)', textAlign: 'right' }}>{e.date.replace(', 2026', '')}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card padding={0}>
          <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <Overline>Agents</Overline>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 6 }}>4 agents online</div>
            </div>
            <button onClick={() => go('agents')} style={{ background: 'none', border: 'none', color: 'var(--color-blue)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>Manage <NavIcon name="arrow" size={11}/></button>
          </div>
          <div style={{ padding: '8px 12px 14px' }}>
            {ALLURA_AGENTS.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: a.status === 'paused' ? 'var(--color-page-bg)' : 'linear-gradient(135deg, var(--color-blue), var(--color-blue))', color: a.status === 'paused' ? 'var(--color-text-caption)' : '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{a.avatar}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{a.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>{a.role} · {a.success}% · {a.latency}</div>
                </div>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.status === 'paused' ? 'var(--color-border-light)' : 'var(--color-green)', boxShadow: a.status === 'paused' ? 'none' : '0 0 0 3px rgba(44,106,65,0.15)' }}/>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// MEMORY LIST
function ScreenMemory({ go, onOpenMemory, onAddMemory, density = 'comfortable' }) {
  const [tab, setTab] = React.useState('memories');
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const all = ALLURA_MEMORIES;
  const filtered = all.filter(m => (filter === 'all' || m.status === filter) && (!search || m.content.toLowerCase().includes(search.toLowerCase())));
  const pad = density === 'compact' ? 14 : density === 'spacious' ? 22 : 18;

  return (
    <div style={{ padding: '28px 32px 60px', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <Overline>Allura memory</Overline>
        <h2 style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text-primary)', margin: '8px 0 6px', letterSpacing: '-0.02em', fontFamily: "'Outfit', sans-serif" }}>Search what your system remembers.</h2>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>Start with a question, then inspect the memories behind it in plain English.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: 'var(--color-status-default-bg)', border: '1px solid var(--color-border-light)', borderRadius: 12, padding: 3 }}>
          {[['memories', 'Memories', '8'], ['forgotten', 'Recently forgotten', '3']].map(([id, label, count]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 500,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
              background: tab === id ? '#fff' : 'transparent',
              color: tab === id ? 'var(--color-blue)' : 'var(--color-text-muted)',
              boxShadow: tab === id ? '0 1px 4px rgba(28,35,43,0.08)' : 'none',
            }}>
              {id === 'forgotten' && <NavIcon name="clock" size={12}/>}
              {label}
              <span style={{ fontSize: 10.5, color: tab === id ? 'var(--color-text-caption)' : 'var(--color-text-caption)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }}/>
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')}/>
        <FilterChip label="Active" active={filter === 'active'} onClick={() => setFilter('active')}/>
        <FilterChip label="Proposed" active={filter === 'proposed'} onClick={() => setFilter('proposed')}/>
        <FilterChip label="Low conf" active={filter === 'low_conf'} onClick={() => setFilter('low_conf')}/>
      </div>

      {/* Search */}
      {tab === 'memories' && (
        <Card padding={0} style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', padding: 14 }}>
            <div style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-blue)', display: 'flex' }}>
              <NavIcon name="search" size={16}/>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by person, preference, decision, or phrase…" style={{
              width: '100%', height: 42, borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              padding: '0 16px 0 38px', fontSize: 14, color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit',
            }}/>
          </div>
          <div style={{ padding: '0 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
              {search ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${search}"` : `${filtered.length} memor${filtered.length !== 1 ? 'ies' : 'y'} ready to review`}
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>Sorted by recency · All users</span>
          </div>
        </Card>
      )}

      {/* List */}
      {tab === 'memories' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(m => <MemoryRow key={m.id} m={m} pad={pad} onClick={() => onOpenMemory(m)}/>)}
          {filtered.length === 0 && (
            <Card padding={48} style={{ textAlign: 'center', borderStyle: 'dashed', borderColor: 'var(--color-border-light)', background: 'rgba(255,255,255,0.5)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-status-default-bg)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-blue)', marginBottom: 10 }}>
                <NavIcon name="search" size={22}/>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>No memories matched "{search}".</div>
              <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', marginBottom: 14 }}>Nothing in view answers that yet. You can save it manually.</div>
              <button onClick={onAddMemory} style={{ background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Save this manually</button>
            </Card>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ALLURA_FORGOTTEN.map(m => (
            <Card key={m.id} padding={18} style={{ background: '#fff', borderColor: 'var(--color-status-danger-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <StatusBadge status="forgotten"/>
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>{m.savedAt}</span>
                </div>
                <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 4px' }}>{m.content}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-caption)', margin: 0 }}><span style={{ color: 'var(--color-status-danger-text)' }}>Reason:</span> {m.reason}</p>
              </div>
              <button style={{ background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-blue)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}><NavIcon name="rotate" size={12}/> Restore</button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 8,
      border: `1px solid ${active ? 'var(--color-text-primary)' : 'var(--color-border)'}`,
      background: active ? 'var(--color-text-primary)' : '#fff',
      color: active ? 'var(--color-page-bg)' : 'var(--color-text-secondary)',
      cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  );
}

function MemoryRow({ m, pad, onClick }) {
  return (
    <div onClick={onClick} className="hover-lift" style={{
      background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 14,
      padding: pad, cursor: 'pointer', transition: 'all 140ms',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <StatusBadge status={m.status}/>
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: 'var(--color-status-default-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', letterSpacing: '0.04em' }}>{m.tier}</span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>{m.savedAt}</span>
          </div>
          <p style={{ fontSize: 15, color: 'var(--color-text-primary)', lineHeight: 1.65, margin: '0 0 10px', fontWeight: 450 }}>{m.content}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <ConfidenceBar value={m.confidence} width={120}/>
            <span style={{ width: 1, height: 12, background: 'var(--color-border-light)' }}/>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-caption)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <NavIcon name="file" size={11}/> {m.traces} trace{m.traces !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>· via {m.source}</span>
            <div style={{ flex: 1 }}/>
            {m.tags.slice(0, 2).map(t => <Tag key={t}>#{t}</Tag>)}
          </div>
        </div>
        <NavIcon name="right" size={14}/>
      </div>
    </div>
  );
}

// MEMORY DETAIL — list + right detail panel
function ScreenMemoryDetail({ memory, onClose, onForget, onOpenProvenance }) {
  const [panelTab, setPanelTab] = React.useState('details');
  if (!memory) return null;
  const related = ALLURA_MEMORIES.filter(m => m.id !== memory.id && m.tags.some(t => memory.tags.includes(t))).slice(0, 3);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 440px', height: 'calc(100vh - 64px)' }}>
      <div style={{ overflowY: 'auto', padding: '24px 32px 60px', borderRight: '1px solid var(--color-border-light)' }}>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', marginBottom: 18 }}>
          <NavIcon name="arrow" size={12} style={{ transform: 'rotate(180deg)' }}/> Back to memory
        </button>
        <div style={{ marginBottom: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={memory.status}/>
          <Tag tone="navy">{memory.tier}</Tag>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.4, margin: '12px 0 16px', letterSpacing: '-0.005em' }}>{memory.content}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <ConfidenceBar value={memory.confidence} width={160}/>
          <span style={{ width: 1, height: 14, background: 'var(--color-border-light)' }}/>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-caption)' }}>Saved {memory.savedAt} · {memory.provenance}</span>
        </div>

        {/* Origin / context */}
        <div style={{ marginBottom: 22 }}>
          <Overline>Origin</Overline>
          <Card padding={18} style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg, var(--color-blue), var(--color-blue))', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace" }}>AC</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>allura-core captured this</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>during sess_9k2x · {memory.savedAt}</div>
                </div>
              </div>
              <button onClick={onOpenProvenance} style={{ background: 'none', border: 'none', fontSize: 12.5, fontWeight: 500, color: 'var(--color-blue)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>View source <NavIcon name="arrow" size={11}/></button>
            </div>
            <div style={{ background: 'var(--color-panel-subtle)', border: '1px solid var(--color-border-light)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-caption)', marginBottom: 4, fontFamily: "'IBM Plex Mono', monospace" }}>conversation excerpt</div>
              <div style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, fontStyle: 'italic' }}>
                "Honestly, just send it as a doc — I read way faster than I listen. I'll come back with comments by tomorrow."
              </div>
            </div>
          </Card>
        </div>

        <div style={{ marginBottom: 22 }}>
          <Overline>Evidence trace</Overline>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALLURA_TRACES.slice(0, 3).map(t => (
              <Card key={t.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-blue)', fontFamily: "'IBM Plex Mono', monospace" }}>{t.tool}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{t.ts}</span>
                </div>
                <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-border-light)', background: 'var(--color-text-primary)', borderRadius: 8, padding: '10px 12px', overflow: 'auto', lineHeight: 1.5 }}>{t.payload}</pre>
                <div style={{ fontSize: 11, color: 'var(--color-text-caption)', marginTop: 6 }}>via {t.agent} · confidence {t.confidence.toFixed(2)}</div>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Overline>Related memories</Overline>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {related.length === 0 && <div style={{ fontSize: 13, color: 'var(--color-text-caption)' }}>No related memories yet.</div>}
            {related.map(r => <MemoryRow key={r.id} m={r} pad={14} onClick={() => {}}/>)}
          </div>
        </div>
      </div>

      {/* Right detail panel */}
      <aside style={{ background: 'var(--color-panel-subtle)', overflowY: 'auto', padding: '20px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <Overline>Memory details</Overline>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-caption)', display: 'flex' }}><NavIcon name="close" size={14}/></button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-border-light)', borderRadius: 8, marginBottom: 14 }}>
          {[['details', 'Details'], ['provenance', 'Provenance'], ['graph', 'Graph']].map(([id, label]) => (
            <button key={id} onClick={() => setPanelTab(id)} style={{
              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: panelTab === id ? '#fff' : 'transparent',
              color: panelTab === id ? 'var(--color-blue)' : 'var(--color-text-muted)',
              boxShadow: panelTab === id ? '0 1px 3px rgba(28,35,43,0.08)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {panelTab === 'details' && (
          <div>
            <div style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.65, marginBottom: 16, padding: '10px 12px', background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 10 }}>
              <strong style={{ fontWeight: 600 }}>Summary.</strong> Captured during a Q3 review session. Reinforced by 3 traces over 8 days.
            </div>
            <DetailRow label="Type" value="Preference"/>
            <DetailRow label="Subject" value="self · Alex Chen"/>
            <DetailRow label="Layer" value={memory.tier}/>
            <DetailRow label="Source" value={memory.source}/>
            <DetailRow label="Captured" value="May 21, 2026"/>
            <DetailRow label="Last reinforced" value="May 21, 2026"/>
            <DetailRow label="Project" value="allura-default"/>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Tags</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{memory.tags.map(t => <Tag key={t}>#{t}</Tag>)}</div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 6 }}>
              <button onClick={onOpenProvenance} style={{ flex: 1, background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>View source</button>
              <button style={{ background: '#fff', border: '1px solid var(--color-border-light)', color: 'var(--color-blue)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}><NavIcon name="pencil" size={12}/> Edit</button>
              <button onClick={() => { onForget(memory); onClose(); }} style={{ background: 'transparent', border: '1px solid var(--color-status-danger-border)', color: 'var(--color-status-danger-text)', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}><NavIcon name="trash" size={12}/> Forget</button>
            </div>
          </div>
        )}
        {panelTab === 'provenance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ALLURA_TRACES.slice(0, 4).map(t => (
              <div key={t.id} style={{ background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-blue)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: 4 }}>{t.tool}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{t.ts}</div>
              </div>
            ))}
          </div>
        )}
        {panelTab === 'graph' && (
          <div style={{ background: '#fff', border: '1px solid var(--color-border-light)', borderRadius: 10, padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <MiniGraph centerLabel={memory.subject} size={300}/>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-caption)' }}>{related.length} connected memor{related.length !== 1 ? 'ies' : 'y'}</div>
          </div>
        )}
      </aside>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed var(--color-border-light)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function MiniGraph({ centerLabel = 'self', size = 220 }) {
  const cx = size / 2, cy = size / 2;
  const orbits = [{ r: size * 0.32, n: 4 }, { r: size * 0.46, n: 6 }];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {orbits.map((o, oi) => <circle key={oi} cx={cx} cy={cy} r={o.r} fill="none" stroke="var(--color-border-light)" strokeDasharray="3 3"/>)}
      {orbits.flatMap((o, oi) => Array.from({ length: o.n }).map((_, i) => {
        const a = (i / o.n) * Math.PI * 2 + (oi * 0.3);
        const x = cx + Math.cos(a) * o.r;
        const y = cy + Math.sin(a) * o.r;
        return <g key={`${oi}-${i}`}>
          <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-border)" strokeWidth="1"/>
          <circle cx={x} cy={y} r="6" fill="#fff" stroke="var(--color-blue)" strokeWidth="1.5"/>
        </g>;
      }))}
      <circle cx={cx} cy={cy} r="14" fill="var(--color-text-primary)"/>
      <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="600">{centerLabel}</text>
    </svg>
  );
}

Object.assign(window, { ScreenDashboard, ScreenMemory, ScreenMemoryDetail });
