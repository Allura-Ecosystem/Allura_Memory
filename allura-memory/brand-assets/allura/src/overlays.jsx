/* overlays.jsx — Provenance drawer, Add memory modal, Undo banner, Tweaks panel */

function ProvenanceDrawer({ memory, onClose }) {
  const traces = ALLURA_TRACES.slice(0, 4);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,43,0.32)', zIndex: 80, backdropFilter: 'blur(2px)', animation: 'fadeIn 150ms ease' }}/>
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '100vw',
        background: 'var(--color-panel-subtle)', borderLeft: '1px solid var(--color-border)', zIndex: 90,
        display: 'flex', flexDirection: 'column',
        animation: 'slideIn 220ms cubic-bezier(.2,.7,.3,1)',
        boxShadow: '-12px 0 40px rgba(28,35,43,0.16)',
      }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-card-bg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Overline>Source · provenance</Overline>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-caption)', display: 'flex', padding: 4 }}><NavIcon name="close" size={16}/></button>
          </div>
          <div style={{ fontSize: 14.5, color: 'var(--color-text-primary)', lineHeight: 1.6, fontWeight: 450 }}>{memory?.content}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <ConfidenceBar value={memory?.confidence || 87} width={140}/>
            <span style={{ fontSize: 12, color: 'var(--color-text-caption)' }}>· {memory?.traces || 3} corroborating traces</span>
          </div>
        </div>

        <div style={{ padding: '14px 24px 8px', background: 'var(--color-card-bg)', borderBottom: '1px solid var(--color-border-light)' }}>
          <Overline color="var(--color-text-caption)">Origin</Overline>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, var(--color-blue), var(--color-blue))', color: 'var(--color-card-bg)', display: 'grid', placeItems: 'center', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" }}>AC</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>allura-core</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-caption)' }}>during sess_9k2x · 2 days ago</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px 8px', flex: 1, overflowY: 'auto' }}>
          <Overline>Evidence trail</Overline>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {traces.map(trace => (
              <div key={trace.id} style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-border-light)', borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-blue)', fontFamily: "'IBM Plex Mono', monospace" }}>{trace.tool}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>{trace.ts}</span>
                </div>
                <pre style={{ margin: 0, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--color-border-light)', background: 'var(--color-text-primary)', borderRadius: 6, padding: '8px 10px', overflow: 'auto', lineHeight: 1.5 }}>{trace.payload}</pre>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-caption)' }}>via {trace.agent} · confidence {trace.confidence.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-card-bg)', display: 'flex', gap: 8 }}>
          <button style={{ flex: 1, background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Promote</button>
          <button style={{ flex: 1, background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-light)', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', color: 'var(--color-status-danger-text)', border: '1px solid var(--color-status-danger-border)', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Forget</button>
        </div>
      </div>
    </>
  );
}

function AddMemoryModal({ open, onClose, onSave }) {
  const [content, setContent] = React.useState('');
  const [tier, setTier] = React.useState('L4');
  const [subject, setSubject] = React.useState('self');
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(28,35,43,0.42)', zIndex: 100, backdropFilter: 'blur(3px)', animation: 'fadeIn 120ms ease' }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 540, maxWidth: '92vw', background: 'var(--color-card-bg)', borderRadius: 18, padding: 0,
        zIndex: 110, boxShadow: '0 30px 80px rgba(28,35,43,0.28)', overflow: 'hidden',
        animation: 'modalIn 180ms cubic-bezier(.2,.7,.3,1)',
      }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid var(--color-border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Overline>Add a memory</Overline>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 6, fontFamily: "'Outfit', sans-serif" }}>Save it manually</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-caption)', marginTop: 4, lineHeight: 1.55 }}>Write something your system should remember. It will start in working memory and graduate as it's reinforced.</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-caption)', padding: 4, display: 'flex' }}><NavIcon name="close" size={16}/></button>
          </div>
        </div>
        <div style={{ padding: '18px 26px' }}>
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="e.g. Prefers bullet points over paragraphs when summarizing research." autoFocus style={{
            width: '100%', boxSizing: 'border-box', border: '1px solid var(--color-border-input)', borderRadius: 12, padding: '14px 16px',
            fontSize: 14.5, fontFamily: 'inherit', color: 'var(--color-text-primary)', resize: 'vertical', minHeight: 110, outline: 'none', lineHeight: 1.6,
          }}/>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Layer</div>
              <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--color-status-default-bg)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                {['L1', 'L2', 'L3', 'L4'].map(t => (
                  <button key={t} onClick={() => setTier(t)} style={{
                    flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: tier === t ? 'var(--color-card-bg)' : 'transparent', color: tier === t ? 'var(--color-text-primary)' : 'var(--color-text-caption)',
                    boxShadow: tier === t ? '0 1px 3px rgba(28,35,43,0.08)' : 'none',
                  }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-caption)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Subject</div>
              <select value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', padding: '0 12px', fontSize: 13, color: 'var(--color-text-primary)', outline: 'none', fontFamily: 'inherit' }}>
                <option value="self">self · Alex Chen</option>
                <option value="team">team</option>
                <option value="project">project · allura-default</option>
                <option value="sam">Sam Reyes</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--color-confidence-bg)', border: '1px solid var(--color-confidence-border)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-accent-premium)', color: 'var(--color-card-bg)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 1 }}>i</div>
            <div style={{ fontSize: 12, color: 'var(--color-confidence-text)', lineHeight: 1.55 }}>Manual additions start at <strong>100% confidence</strong> and don't decay. They appear in <em>Recently Forgotten</em> if removed.</div>
          </div>
        </div>
        <div style={{ padding: '14px 26px', borderTop: '1px solid var(--color-border-light)', background: 'var(--color-surface)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'var(--color-card-bg)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-light)', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => { onSave(content); setContent(''); }} style={{ background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Save memory</button>
        </div>
      </div>
    </>
  );
}

function UndoBanner({ memory, onUndo }) {
  if (!memory) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--color-text-primary)', color: 'var(--color-page-bg)', borderRadius: 12, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 16, zIndex: 70,
      boxShadow: '0 12px 32px rgba(28,35,43,0.28)',
      animation: 'slideUp 200ms ease',
    }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>Memory removed from view.</div>
        <div style={{ fontSize: 12, color: 'var(--color-border-light)', marginTop: 2 }}>You can restore it within 30 days.</div>
      </div>
      <button onClick={onUndo} style={{ background: 'transparent', color: 'var(--color-gold)', border: '1px solid rgba(212,168,75,0.4)', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Undo</button>
    </div>
  );
}

Object.assign(window, { ProvenanceDrawer, AddMemoryModal, UndoBanner });
