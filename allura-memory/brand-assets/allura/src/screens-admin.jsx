/* screens-admin.jsx — Agents, Approvals, Settings */

function ScreenAgents() {
  const [selected, setSelected] = React.useState(ALLURA_AGENTS[0]);
  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <Overline>Agents</Overline>
          <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: "'Outfit', sans-serif" }}>Four roles, one memory.</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-caption)', marginTop: 2 }}>Capture · Curation · Connection · Activation</div>
        </div>
        <button style={{ background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="plus" size={13}/> New agent</button>
      </div>

      {/* Agent grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
        {ALLURA_AGENTS.map(a => {
          const isSel = selected.id === a.id;
          return (
            <Card key={a.id} padding={18} style={{ cursor: 'pointer', borderColor: isSel ? 'var(--color-text-primary)' : 'var(--color-border-light)', boxShadow: isSel ? '0 4px 18px rgba(28,35,43,0.10)' : '0 1px 2px rgba(28,35,43,0.04)', transition: 'all 140ms' }} onClick={() => setSelected(a)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: a.status === 'paused' ? 'var(--color-page-bg)' : 'linear-gradient(135deg, var(--color-blue), var(--color-blue))', color: a.status === 'paused' ? 'var(--color-text-caption)' : '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{a.avatar}</div>
                <StatusBadge status={a.status === 'paused' ? 'paused' : 'active'} size="sm"/>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{a.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-accent-premium)', textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, marginBottom: 12 }}>{a.role}</div>
              {/* Fixed: explicit role-to-sparkline key mapping */}
              <Sparkline data={({ Capture: 'capture', Curation: 'curate', Connection: 'graph', Activation: 'recall' })[a.role] ? ALLURA_SPARKS[({ Capture: 'capture', Curation: 'curate', Connection: 'graph', Activation: 'recall' })[a.role]] : ALLURA_SPARKS.capture} color="var(--color-blue)" width={200} height={28}/>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11.5 }}>
                <div><div style={{ color: 'var(--color-text-caption)' }}>Calls</div><div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{a.calls.toLocaleString()}</div></div>
                <div><div style={{ color: 'var(--color-text-caption)' }}>Success</div><div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{a.success}%</div></div>
                <div><div style={{ color: 'var(--color-text-caption)' }}>Latency</div><div style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{a.latency}</div></div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Selected detail + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card padding={22}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Overline>Agent · {selected.name}</Overline>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 6 }}>{selected.role} agent</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}><NavIcon name={selected.status === 'paused' ? 'play' : 'pause'} size={11}/>{selected.status === 'paused' ? 'Resume' : 'Pause'}</button>
              <button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}><NavIcon name="cog" size={11}/>Configure</button>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 16 }}>
            {selected.role === 'Capture' && 'Listens to conversations and proposes new memories. Confidence is calibrated against trace corroboration.'}
            {selected.role === 'Curation' && 'Reviews proposals, scores them, and decides what graduates from working memory to long-term.'}
            {selected.role === 'Connection' && 'Maintains the memory graph: edges between memories, refinements, and contradictions.'}
            {selected.role === 'Activation' && 'Surfaces the right memory at the right moment — recall during conversation, summary on demand.'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <DetailRow label="Model" value="claude-haiku-4.5"/>
            <DetailRow label="Region" value="us-east-1"/>
            <DetailRow label="Started" value="May 1, 2026"/>
            <DetailRow label="Tools" value="14 enabled"/>
          </div>
        </Card>

        <Card padding={0}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border-light)' }}>
            <Overline>Recent activity</Overline>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>Last 6 actions</div>
          </div>
          <div>
            {ALLURA_AGENT_ACTIVITY.map((l, i) => (
              <div key={l.id} style={{ padding: '12px 20px', borderBottom: i === ALLURA_AGENT_ACTIVITY.length - 1 ? 'none' : '1px solid var(--color-page-bg)', display: 'flex', gap: 12 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)', marginTop: 7, flexShrink: 0 }}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5 }}>{l.action}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)', marginTop: 2, fontFamily: "'IBM Plex Mono', monospace" }}>{l.agent} · {l.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScreenApprovals() {
  const [proposals, setProposals] = React.useState(ALLURA_PROPOSALS);
  const [selected, setSelected] = React.useState(ALLURA_PROPOSALS[0]);
  const [search, setSearch] = React.useState('');
  const [rationale, setRationale] = React.useState('');

  const filtered = proposals.filter(p => !search || p.content.toLowerCase().includes(search.toLowerCase()));

  const handleAct = (action) => {
    const remaining = proposals.filter(p => p.id !== selected.id);
    setProposals(remaining);
    setSelected(remaining[0] || null);
    setRationale('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', height: 'calc(100vh - 64px)' }}>
      {/* Left list */}
      <div style={{ borderRight: '1px solid var(--color-border-light)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Overline>Curator queue</Overline>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: '1px solid var(--color-status-warning-border)' }}>{proposals.length} pending</span>
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-caption)' }}><NavIcon name="search" size={14}/></div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search proposals…" style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid var(--color-border)', background: '#fff', padding: '0 12px 0 34px', fontSize: 12.5, color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit' }}/>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {filtered.map(p => (
            <div key={p.id} onClick={() => setSelected(p)} style={{
              padding: 14, borderRadius: 12, marginBottom: 8, cursor: 'pointer', transition: 'all 120ms',
              border: `1px solid ${selected?.id === p.id ? 'var(--color-text-primary)' : 'var(--color-border-light)'}`,
              background: selected?.id === p.id ? '#fff' : 'rgba(255,255,255,0.6)',
              boxShadow: selected?.id === p.id ? '0 4px 12px rgba(28,35,43,0.08)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <ConfidencePill value={p.confidence}/>
                <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{p.proposed}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.55, margin: '0 0 8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.content}</p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Tag tone={p.tier === 'established' ? 'navy' : p.tier === 'adoption' ? 'amber' : 'neutral'}>{p.tier}</Tag>
                <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{p.traces} traces</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-status-success-bg)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-green)', marginBottom: 10 }}>
                <NavIcon name="check" size={22}/>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>All caught up.</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-caption)' }}>No insights waiting for review.</div>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {selected ? (
          <>
            <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid var(--color-border-light)', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Overline>Proposal · {selected.id}</Overline>
                <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>· proposed {selected.proposed} by {selected.from}</span>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 500, color: 'var(--color-text-primary)', lineHeight: 1.45, margin: '0 0 16px', letterSpacing: '-0.005em' }}>{selected.content}</h3>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 14 }}>
                <ConfidenceBar value={selected.confidence} width={180}/>
                <span style={{ width: 1, height: 14, background: 'var(--color-border-light)' }}/>
                <Tag tone={selected.tier === 'established' ? 'navy' : selected.tier === 'adoption' ? 'amber' : 'neutral'}>{selected.tier} tier</Tag>
                <span style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>{selected.traces} corroborating traces</span>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, margin: 0, padding: '12px 14px', background: 'var(--color-panel-subtle)', borderRadius: 10, border: '1px solid var(--color-border-light)' }}>
                <span style={{ color: 'var(--color-accent-premium)', fontWeight: 600, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', marginRight: 8 }}>Reasoning</span>
                {selected.reasoning}
              </p>
            </div>

            <div style={{ padding: '20px 32px', flex: 1 }}>
              <Overline>Evidence ({selected.traces})</Overline>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.from({ length: selected.traces }).map((_, i) => (
                  <Card key={i} padding={14}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-blue)', fontFamily: "'IBM Plex Mono', monospace" }}>conversation.parse</span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{i + 1} day{i ? 's' : ''} ago · sess_{['9k2x', '8c1n', '7m4l'][i] || 'xxx'}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, fontStyle: 'italic', padding: '8px 12px', background: 'var(--color-panel-subtle)', borderRadius: 6, marginBottom: 6 }}>
                      "{['Honestly, just send it as a doc — I read way faster than I listen.', 'Let me read through that first, I prefer to digest it written out.', 'Could you summarize in writing? I follow better that way.'][i] || ''}"
                    </div>
                    <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-border-light)', background: 'var(--color-text-primary)', borderRadius: 6, padding: '8px 10px', overflow: 'auto', lineHeight: 1.5 }}>{`{ "session_id": "sess_${['9k2x', '8c1n', '7m4l'][i] || 'xxx'}", "confidence": ${(selected.confidence / 100 - i * 0.04).toFixed(2)} }`}</pre>
                  </Card>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Decision rationale (optional)</div>
                <textarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Why are you approving or rejecting this?" style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border-input)', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--color-text-primary)', background: 'var(--color-card-bg)', resize: 'vertical', minHeight: 70, outline: 'none' }}/>
              </div>
            </div>

            <div style={{ padding: '14px 32px', borderTop: '1px solid var(--color-border-light)', background: '#fff', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => handleAct('reject')} style={{ background: 'transparent', color: 'var(--color-orange)', border: '1px solid var(--color-status-danger-border)', borderRadius: 8, padding: '9px 18px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="close" size={12}/> Reject</button>
              <button style={{ background: '#fff', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '9px 18px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="pencil" size={12}/> Edit</button>
              <button onClick={() => handleAct('approve')} style={{ background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><NavIcon name="check" size={12}/> Approve</button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--color-status-success-bg)', display: 'inline-grid', placeItems: 'center', color: 'var(--color-green)', marginBottom: 16 }}><NavIcon name="check" size={28}/></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>All caught up.</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>No insights waiting for review.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScreenSettings() {
  return (
    <div style={{ padding: '24px 32px 60px', maxWidth: 880 }}>
      <div style={{ marginBottom: 22 }}>
        <Overline>Settings</Overline>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.01em' }}>Workspace settings</div>
      </div>

      <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Memory governance</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-caption)', marginTop: 2 }}>How proposed memories graduate to active.</div>
        </div>
        <SettingRow label="Auto-approve threshold" sub="Confidence above which proposals graduate without review." control={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>92%</span>}/>
        <SettingRow label="Decay window" sub="Memories without reinforcement decay after this many days." control={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>180 days</span>}/>
        <SettingRow label="Recovery window" sub="How long forgotten memories can be restored." control={<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>30 days</span>}/>
      </Card>

      <Card padding={0} style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Privacy</div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-caption)', marginTop: 2 }}>What Allura is allowed to remember.</div>
        </div>
        <SettingRow label="Capture from conversations" sub="Allura can listen and propose memories during chats." control={<Toggle on/>}/>
        <SettingRow label="Capture from documents" sub="Extract facts from shared docs and meeting notes." control={<Toggle on/>}/>
        <SettingRow label="Share with collaborators" sub="Other workspace members can see governance signals only." control={<Toggle/>}/>
        <SettingRow label="Export on request" sub="Download every memory and trace anytime." control={<button style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>Request export</button>}/>
      </Card>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-orange)' }}>Danger zone</div>
        </div>
        <SettingRow label="Forget everything" sub="Permanently remove all memories from this workspace." control={<button style={{ background: '#fff', border: '1px solid var(--color-status-danger-border)', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-orange)', cursor: 'pointer', fontFamily: 'inherit' }}>Forget all</button>}/>
      </Card>
    </div>
  );
}

function SettingRow({ label, sub, control }) {
  return (
    <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-page-bg)', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--color-text-caption)', lineHeight: 1.5 }}>{sub}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function Toggle({ on: initial }) {
  const [on, setOn] = React.useState(!!initial);
  return (
    <button onClick={() => setOn(!on)} style={{
      width: 36, height: 20, borderRadius: 10, border: 'none',
      background: on ? 'var(--color-text-primary)' : 'var(--color-border)', cursor: 'pointer', position: 'relative', transition: 'all 120ms', padding: 0,
    }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 120ms', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}/>
    </button>
  );
}

Object.assign(window, { ScreenAgents, ScreenApprovals, ScreenSettings });
