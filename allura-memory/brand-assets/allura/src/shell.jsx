/* shell.jsx — sidebar, topbar, page chrome */

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',   icon: 'grid'    },
  { id: 'memory',      label: 'Memory',      icon: 'brain'   },
  { id: 'graph',       label: 'Graph',       icon: 'share'   },
  { id: 'search',      label: 'Logs',        icon: 'search'  },
  { id: 'provenance',  label: 'Provenance',  icon: 'file'    },
  { id: 'extracted',   label: 'Extracted',   icon: 'sparkle' },
  { id: 'agents',      label: 'Agents',      icon: 'cpu'     },
  { id: 'approvals',   label: 'Approvals',   icon: 'check'   },
  { id: 'settings',    label: 'Settings',    icon: 'cog'     },
];

const NavIcon = ({ name, size = 16 }) => {
  const s = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'grid':    return <svg {...s}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'brain':   return <svg {...s}><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>;
    case 'share':   return <svg {...s}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
    case 'search':  return <svg {...s}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
    case 'file':    return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>;
    case 'sparkle': return <svg {...s}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"/></svg>;
    case 'cpu':     return <svg {...s}><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/></svg>;
    case 'check':   return <svg {...s}><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>;
    case 'cog':     return <svg {...s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case 'plus':    return <svg {...s}><path d="M12 5v14M5 12h14"/></svg>;
    case 'arrow':   return <svg {...s}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case 'close':   return <svg {...s}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case 'clock':   return <svg {...s}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case 'rotate':  return <svg {...s}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>;
    case 'eye':     return <svg {...s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'down':    return <svg {...s}><path d="m6 9 6 6 6-6"/></svg>;
    case 'right':   return <svg {...s}><path d="m9 18 6-6-6-6"/></svg>;
    case 'pencil':  return <svg {...s}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
    case 'trash':   return <svg {...s}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
    case 'filter':  return <svg {...s}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
    case 'sort':    return <svg {...s}><path d="M3 6h18M6 12h12M10 18h4"/></svg>;
    case 'dot':     return <svg {...s} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="3"/></svg>;
    case 'play':    return <svg {...s} fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>;
    case 'pause':   return <svg {...s} fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case 'tab':     return <svg {...s}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>;
    case 'export':  return <svg {...s}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    default: return null;
  }
};

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <img
        src="../logos/wordmark.png"
        alt="Allura"
        style={{ height: 44, width: 'auto', display: 'block' }}
      />
    </div>
  );
}

function Sidebar({ current, onNav }) {
  return (
  <aside style={{
    width: 232, flexShrink: 0,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border-light)',
    display: 'flex', flexDirection: 'column',
    height: '100vh', position: 'sticky', top: 0,
  }}>
      <div style={{ padding: '20px 22px 18px' }}>
        <Wordmark />
      </div>
      <nav style={{ padding: '4px 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-caption)', padding: '12px 10px 8px' }}>Workspace</div>
        {NAV_ITEMS.slice(0, 4).map(item => (
          <NavButton key={item.id} item={item} active={current === item.id} onClick={() => onNav(item.id)} />
        ))}
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-caption)', padding: '20px 10px 8px' }}>Governance</div>
        {NAV_ITEMS.slice(4, 8).map(item => (
          <NavButton key={item.id} item={item} active={current === item.id} onClick={() => onNav(item.id)} />
        ))}
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-text-caption)', padding: '20px 10px 8px' }}>System</div>
        {NAV_ITEMS.slice(8).map(item => (
          <NavButton key={item.id} item={item} active={current === item.id} onClick={() => onNav(item.id)} />
        ))}
      </nav>
      <div style={{ padding: 14, borderTop: '1px solid var(--color-border-light)', background: 'var(--color-panel-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--color-blue), var(--color-blue))', color: 'var(--color-white)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600 }}>AC</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Alex Chen</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-caption)' }}>allura-default</div>
          </div>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-caption)', padding: 4, display: 'flex' }}><NavIcon name="cog" size={14}/></button>
        </div>
      </div>
    </aside>
  );
}

function NavButton({ item, active, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', borderRadius: 8, border: 'none',
        background: active ? 'var(--color-text-primary)' : (hover ? 'var(--color-panel-subtle)' : 'transparent'),
        color: active ? 'var(--color-white)' : 'var(--color-text-secondary)',
        fontSize: 13.5, fontWeight: active ? 500 : 450, cursor: 'pointer',
        fontFamily: 'inherit', textAlign: 'left', marginBottom: 1,
        transition: 'all 120ms',
      }}
    >
      <NavIcon name={item.icon} size={15}/>
      <span>{item.label}</span>
    </button>
  );
}

function Topbar({ title, breadcrumbs, actions, onAddMemory }) {
  return (
    <header style={{
      height: 64, padding: '0 32px',
      borderBottom: '1px solid var(--color-border-light)',
      background: 'var(--color-card-bg)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div>
        {breadcrumbs && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: 'var(--color-border-light)', fontSize: 11 }}>/</span>}
                <span style={{ fontSize: 11, fontWeight: 500, color: i === breadcrumbs.length - 1 ? 'var(--color-text-secondary)' : 'var(--color-text-caption)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{b}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {actions}
        <div style={{ width: 1, height: 24, background: 'var(--color-border-light)' }}/>
        <button onClick={onAddMemory} style={{ background: 'var(--color-orange)', color: 'var(--color-text-primary)', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(15,17,21,0.08)' }}>
          <NavIcon name="plus" size={13}/>
          <span>Add memory</span>
        </button>
        <button style={{ background: 'var(--color-card-bg)', border: '1px solid var(--color-orange)', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', color: 'var(--color-orange)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
          <NavIcon name="search" size={14}/>
          <span>Search</span>
          <span style={{ fontSize: 10, padding: '2px 5px', background: 'var(--color-status-warning-bg)', borderRadius: 4, color: 'var(--color-orange)', fontFamily: "'IBM Plex Mono', monospace" }}>⌘K</span>
        </button>
      </div>
    </header>
  );
}

// Reusable bits
function Overline({ children, color = 'var(--color-accent-premium)', style }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color, ...style }}>
      {children}
    </span>
  );
}

function StatusBadge({ status, size = 'md' }) {
  const map = {
    active:    { label: 'Active',         bg: 'var(--color-status-success-bg)',   color: 'var(--color-status-success-text)',   border: 'var(--color-status-success-border)',   dot: 'var(--color-status-success-text)' },
    proposed:  { label: 'Proposed',       bg: 'var(--color-status-default-bg)',   color: 'var(--color-status-default-text)',   border: 'var(--color-status-default-border)',   dot: 'var(--color-status-default-text)' },
    forgotten: { label: 'Forgotten',      bg: 'var(--color-status-danger-bg)',    color: 'var(--color-status-danger-text)',    border: 'var(--color-status-danger-border)',    dot: 'var(--color-status-danger-text)' },
    low_conf:  { label: 'Low confidence', bg: 'var(--color-confidence-bg)',       color: 'var(--color-confidence-text)',       border: 'var(--color-confidence-border)',       dot: 'var(--color-gold)' },
    paused:    { label: 'Paused',         bg: 'var(--color-status-default-bg)',   color: 'var(--color-status-default-text)',   border: 'var(--color-status-default-border)',   dot: 'var(--color-text-caption)' }
  };
  const s = map[status] || map.active;
  const padding = size === 'sm' ? '2px 7px' : '3px 8px';
  const fontSize = size === 'sm' ? 10.5 : 11;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize, fontWeight: 600, padding, borderRadius: 4, border: `1px solid ${s.border}`, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot }}/>
      {s.label}
    </span>
  );
}

function ConfidencePill({ value }) {
  const color = value >= 80 ? 'var(--color-status-success-text)' : value >= 65 ? 'var(--color-confidence-text)' : value >= 50 ? 'var(--color-status-warning-text)' : 'var(--color-status-danger-text)';
  const bg    = value >= 80 ? 'var(--color-status-success-bg)'   : value >= 65 ? 'var(--color-confidence-bg)'       : value >= 50 ? 'var(--color-status-warning-bg)'   : 'var(--color-status-danger-bg)';
  const border= value >= 80 ? 'var(--color-status-success-border)': value >= 65 ? 'var(--color-confidence-border)'   : value >= 50 ? 'var(--color-status-warning-border)': 'var(--color-status-danger-border)';
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: bg, color, border: `1px solid ${border}`, fontVariantNumeric: 'tabular-nums' }}>{value}%</span>;
}

function ConfidenceBar({ value, width = 100, showLabel = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ background: 'var(--color-border-light)', borderRadius: 999, height: 5, width, overflow: 'hidden' }}>
        <div style={{ background: 'var(--gradient-ink)', height: 5, borderRadius: 999, width: `${value}%` }}/>
      </div>
      {showLabel && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-status-default-text)', fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'right' }}>{value}%</span>}
    </div>
  );
}

function Tag({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--color-panel-subtle)',  color: 'var(--color-text-secondary)', border: 'var(--color-border)' },
    amber:   { bg: 'var(--color-confidence-bg)', color: 'var(--color-confidence-text)', border: 'var(--color-confidence-border)' },
    navy:    { bg: 'var(--color-status-default-bg)', color: 'var(--color-status-default-text)', border: 'var(--color-status-default-border)' },
  };
  const t = tones[tone] || tones.neutral;
  return <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 9999, border: `1px solid ${t.border}`, background: t.bg, color: t.color, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Sparkline({ data, color = 'var(--color-blue)', width = 88, height = 24, fill = true }) {
  const max = Math.max(...data), min = Math.min(...data);
  const r = max - min || 1;
  const step = width / (data.length - 1);
  const pts = data.map((v, i) => `${i * step},${height - ((v - min) / r) * (height - 4) - 2}`).join(' ');
  const fillPts = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {fill && <polygon points={fillPts} fill={color} opacity="0.08"/>}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function Card({ children, padding = 20, style, ...rest }) {
  return (
    <div style={{
      background: 'var(--color-card-bg)', border: '1px solid var(--color-border-light)',
      borderRadius: 16, padding,
      boxShadow: 'var(--shadow-2xs)',
      ...style,
    }} {...rest}>{children}</div>
  );
}

Object.assign(window, { Sidebar, Topbar, NavIcon, Wordmark, Overline, StatusBadge, ConfidencePill, ConfidenceBar, Tag, Sparkline, Card });
