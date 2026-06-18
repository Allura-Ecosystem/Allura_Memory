/* @ds-bundle: {"format":3,"namespace":"AlluraDesignSystem_d83f54","components":[{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"SearchBar","sourcePath":"components/core/SearchBar.jsx"},{"name":"SearchFilterBar","sourcePath":"components/core/SearchFilterBar.jsx"},{"name":"StatusBadge","sourcePath":"components/core/StatusBadge.jsx"},{"name":"Tabs","sourcePath":"components/core/Tabs.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"LoadingState","sourcePath":"components/feedback/LoadingState.jsx"},{"name":"SkeletonLine","sourcePath":"components/feedback/LoadingState.jsx"},{"name":"Icon","sourcePath":"components/icons.jsx"},{"name":"NODE_ICON","sourcePath":"components/icons.jsx"},{"name":"EvidenceCard","sourcePath":"components/memory/EvidenceCard.jsx"},{"name":"GraphNode","sourcePath":"components/memory/GraphNode.jsx"},{"name":"InsightCard","sourcePath":"components/memory/InsightCard.jsx"},{"name":"MemoryCard","sourcePath":"components/memory/MemoryCard.jsx"},{"name":"NodeDetailPanel","sourcePath":"components/memory/NodeDetailPanel.jsx"},{"name":"NodeSection","sourcePath":"components/memory/NodeDetailPanel.jsx"},{"name":"ReviewQueueCard","sourcePath":"components/memory/ReviewQueueCard.jsx"},{"name":"SystemHealthCard","sourcePath":"components/memory/SystemHealthCard.jsx"},{"name":"SidebarNavItem","sourcePath":"components/navigation/SidebarNavItem.jsx"},{"name":"SidebarNavigation","sourcePath":"components/navigation/SidebarNavigation.jsx"},{"name":"TopNavBar","sourcePath":"components/navigation/TopNavBar.jsx"}],"sourceHashes":{"components/core/Button.jsx":"41e59f7bc4bb","components/core/SearchBar.jsx":"003fb46c1686","components/core/SearchFilterBar.jsx":"b8fb883495fe","components/core/StatusBadge.jsx":"56b7165248b1","components/core/Tabs.jsx":"dc192183c817","components/feedback/EmptyState.jsx":"6496b6abe3aa","components/feedback/LoadingState.jsx":"631962766ac4","components/icons.jsx":"6526459f006e","components/memory/EvidenceCard.jsx":"b22fb0c63a84","components/memory/GraphNode.jsx":"5743758833eb","components/memory/InsightCard.jsx":"5e1511796e83","components/memory/MemoryCard.jsx":"bdc0e500e43b","components/memory/NodeDetailPanel.jsx":"40be10e73682","components/memory/ReviewQueueCard.jsx":"7e8acb62f28f","components/memory/SystemHealthCard.jsx":"c3559fe3b05c","components/navigation/SidebarNavItem.jsx":"9db67509a10a","components/navigation/SidebarNavigation.jsx":"5697ac1263d9","components/navigation/TopNavBar.jsx":"52b6a71a0364"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.AlluraDesignSystem_d83f54 = window.AlluraDesignSystem_d83f54 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura Button — the primary action primitive.
 * Kinds: primary (blue), secondary (outline), ghost (quiet), destructive (red).
 * Sizes: sm / md / lg. Supports leading/trailing icons and full-width.
 */
function Button({
  children,
  kind = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  iconLeft = null,
  iconRight = null,
  type = 'button',
  onClick,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: {
      height: 32,
      padding: '0 12px',
      font: 'var(--text-small)',
      gap: 6,
      radius: 'var(--radius-md)'
    },
    md: {
      height: 40,
      padding: '0 16px',
      font: 'var(--text-body)',
      gap: 8,
      radius: 'var(--radius-md)'
    },
    lg: {
      height: 48,
      padding: '0 22px',
      font: 'var(--text-body-lg)',
      gap: 8,
      radius: 'var(--radius-lg)'
    }
  };
  const kinds = {
    primary: {
      background: 'var(--allura-blue)',
      color: '#fff',
      boxShadow: 'none',
      border: '1px solid transparent'
    },
    secondary: {
      background: 'var(--white)',
      color: 'var(--color-text-primary)',
      boxShadow: 'none',
      border: '1px solid var(--color-border)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-primary)',
      boxShadow: 'none',
      border: '1px solid transparent'
    },
    destructive: {
      background: '#DC2626',
      color: '#fff',
      boxShadow: 'none',
      border: '1px solid transparent'
    }
  };
  const s = sizes[size] || sizes.md;
  const k = kinds[kind] || kinds.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    onClick: onClick,
    "data-kind": kind,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: s.gap,
      height: s.height,
      padding: s.padding,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'var(--font-sans)',
      fontSize: s.font,
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 1,
      borderRadius: s.radius,
      cursor: disabled ? 'not-allowed' : 'pointer',
      whiteSpace: 'nowrap',
      transition: 'background var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard), filter var(--duration-fast) var(--ease-standard)',
      opacity: disabled ? 0.55 : 1,
      ...k,
      ...(disabled ? {
        background: kind === 'ghost' || kind === 'secondary' ? k.background : 'var(--ink-150)',
        color: 'var(--ink-500)',
        borderColor: kind === 'secondary' ? 'var(--color-border)' : 'transparent'
      } : null),
      ...style
    },
    onMouseEnter: e => {
      if (!disabled && (kind === 'ghost' || kind === 'secondary')) e.currentTarget.style.background = 'var(--ink-50)';
      if (!disabled && kind === 'primary') e.currentTarget.style.filter = 'brightness(0.93)';
      if (!disabled && kind === 'destructive') e.currentTarget.style.filter = 'brightness(0.93)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = disabled ? undefined : k.background;
      e.currentTarget.style.filter = 'none';
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'translateY(0.5px) scale(0.99)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'none';
    }
  }, rest), iconLeft ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: '1.1em',
      height: '1.1em'
    }
  }, iconLeft) : null, children, iconRight ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      width: '1.1em',
      height: '1.1em'
    }
  }, iconRight) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/SearchBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchGlyph({
  color
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: "7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "m21 21-4.3-4.3"
  }));
}

/**
 * Allura SearchBar — global memory/entity search input.
 * Default: subtle grey fill. Focused: white with blue hairline.
 * Optional ⌘K hint chip on the right.
 */
function SearchBar({
  placeholder = 'Search memories, entities, decisions, evidence…',
  value,
  defaultValue,
  onChange,
  shortcut = '⌘K',
  width = '100%',
  style = {},
  ...rest
}) {
  const [focused, setFocused] = React.useState(false);
  return /*#__PURE__*/React.createElement("label", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      width,
      height: 40,
      padding: '0 12px',
      borderRadius: 'var(--radius-md)',
      background: focused ? 'var(--white)' : 'var(--ink-50)',
      boxShadow: focused ? 'inset 0 0 0 1px var(--allura-blue), var(--focus-ring)' : 'inset 0 0 0 1px var(--color-border)',
      transition: 'background var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard)',
      cursor: 'text',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(SearchGlyph, {
    color: focused ? 'var(--allura-blue)' : 'var(--ink-400)'
  }), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: placeholder,
    value: value,
    defaultValue: defaultValue,
    onChange: onChange,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    style: {
      flex: 1,
      minWidth: 0,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      color: 'var(--color-text-primary)'
    }
  }), shortcut ? /*#__PURE__*/React.createElement("span", {
    style: {
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-micro)',
      color: 'var(--color-text-tertiary)',
      background: 'var(--white)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '2px 6px',
      lineHeight: 1.2
    }
  }, shortcut) : null);
}
Object.assign(__ds_scope, { SearchBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SearchBar.jsx", error: String((e && e.message) || e) }); }

// components/core/SearchFilterBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura Search + Filter Bar — global search paired with a row of
 * type filter chips (All / Memories / Insights / Evidence / Agents…).
 */
function SearchFilterBar({
  placeholder = 'Search memories, insights, evidence, agents, projects…',
  filters = ['All', 'Memories', 'Insights', 'Evidence', 'Agents', 'Projects'],
  active = 'All',
  onFilter,
  onChange,
  style = {},
  ...rest
}) {
  const chips = filters.map(f => typeof f === 'string' ? {
    id: f,
    label: f
  } : f);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.SearchBar, {
    placeholder: placeholder,
    onChange: onChange,
    shortcut: "\u2318K"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8
    }
  }, chips.map(c => {
    const isActive = c.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      onClick: () => onFilter && onFilter(c.id),
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        borderRadius: 'var(--radius-full)',
        border: isActive ? '1px solid transparent' : '1px solid var(--color-border)',
        background: isActive ? 'var(--allura-blue)' : 'var(--white)',
        color: isActive ? '#fff' : 'var(--color-text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-small)',
        fontWeight: 'var(--weight-medium)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-standard)'
      },
      onMouseEnter: e => {
        if (!isActive) {
          e.currentTarget.style.background = 'var(--ink-50)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
        }
      },
      onMouseLeave: e => {
        if (!isActive) {
          e.currentTarget.style.background = 'var(--white)';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }
    }, c.label, c.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-semibold)',
        opacity: isActive ? 0.85 : 1,
        color: isActive ? '#fff' : 'var(--color-text-tertiary)'
      }
    }, c.count) : null);
  })));
}
Object.assign(__ds_scope, { SearchFilterBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/SearchFilterBar.jsx", error: String((e && e.message) || e) }); }

// components/core/StatusBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STATUS = {
  approved: {
    bg: 'var(--status-approved-bg)',
    fg: 'var(--status-approved-fg)',
    label: 'Approved'
  },
  active: {
    bg: 'var(--status-active-bg)',
    fg: 'var(--status-active-fg)',
    label: 'Active'
  },
  pending: {
    bg: 'var(--status-pending-bg)',
    fg: 'var(--status-pending-fg)',
    label: 'Pending'
  },
  candidate: {
    bg: 'var(--status-candidate-bg)',
    fg: 'var(--status-candidate-fg)',
    label: 'Candidate'
  },
  processing: {
    bg: 'var(--status-processing-bg)',
    fg: 'var(--status-processing-fg)',
    label: 'Processing'
  },
  rejected: {
    bg: 'var(--status-rejected-bg)',
    fg: 'var(--status-rejected-fg)',
    label: 'Rejected'
  },
  superseded: {
    bg: 'var(--status-superseded-bg)',
    fg: 'var(--status-superseded-fg)',
    label: 'Superseded'
  },
  error: {
    bg: 'var(--status-error-bg)',
    fg: 'var(--status-error-fg)',
    label: 'Error'
  }
};

/**
 * Allura StatusBadge — pill conveying memory / agent / review state.
 * Eight semantic statuses, each with a soft tinted background + saturated text.
 */
function StatusBadge({
  status = 'approved',
  children,
  dot = false,
  style = {},
  ...rest
}) {
  const s = STATUS[status] || STATUS.approved;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      height: 22,
      padding: '0 8px',
      background: s.bg,
      color: s.fg,
      borderRadius: 'var(--radius-full)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 1,
      whiteSpace: 'nowrap',
      ...style
    }
  }, rest), dot ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: s.fg
    }
  }) : null, children || s.label);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura Tabs — underline tab strip for switching views.
 * Active tab: blue label + 2px blue underline. Inactive: grey medium.
 */
function Tabs({
  tabs = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  const items = tabs.map(t => typeof t === 'string' ? {
    id: t,
    label: t
  } : t);
  const active = value != null ? value : items[0] && items[0].id;
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: 'flex',
      gap: 4,
      boxShadow: 'inset 0 -1px 0 var(--color-border)',
      ...style
    }
  }, rest), items.map(t => {
    const isActive = t.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: t.id,
      role: "tab",
      "aria-selected": isActive,
      onClick: () => onChange && onChange(t.id),
      style: {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 14px 10px',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-body)',
        fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
        color: isActive ? 'var(--allura-blue)' : 'var(--color-text-secondary)',
        transition: 'color var(--duration-fast) var(--ease-standard)'
      },
      onMouseEnter: e => {
        if (!isActive) e.currentTarget.style.color = 'var(--color-text-primary)';
      },
      onMouseLeave: e => {
        if (!isActive) e.currentTarget.style.color = 'var(--color-text-secondary)';
      }
    }, t.label, t.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--text-micro)',
        fontWeight: 'var(--weight-semibold)',
        color: isActive ? 'var(--allura-blue)' : 'var(--color-text-tertiary)',
        background: isActive ? 'var(--blue-50)' : 'var(--ink-50)',
        borderRadius: 'var(--radius-full)',
        padding: '1px 6px'
      }
    }, t.count) : null, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 0,
        height: 2,
        borderRadius: 'var(--radius-full)',
        background: 'var(--allura-blue)',
        opacity: isActive ? 1 : 0,
        transition: 'opacity var(--duration-base) var(--ease-standard)'
      }
    }));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/feedback/LoadingState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const shimmer = {
  background: 'linear-gradient(90deg, var(--ink-100) 25%, var(--ink-50) 37%, var(--ink-100) 63%)',
  backgroundSize: '200% 100%',
  animation: 'allura-shimmer 1.4s ease-in-out infinite',
  borderRadius: 'var(--radius-sm)'
};

/**
 * Allura LoadingState — skeleton placeholder shown while memories load.
 * Renders shimmering lines (and an optional avatar block) inside a card.
 */
function LoadingState({
  lines = 3,
  avatar = false,
  card = true,
  style = {},
  ...rest
}) {
  const widths = ['100%', '92%', '70%', '85%', '60%'];
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "status",
    "aria-label": "Loading",
    style: {
      display: 'flex',
      gap: 14,
      width: '100%',
      padding: card ? 20 : 0,
      background: card ? 'var(--white)' : 'transparent',
      boxShadow: card ? 'var(--hairline)' : 'none',
      borderRadius: 'var(--radius-lg)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), avatar ? /*#__PURE__*/React.createElement("div", {
    style: {
      ...shimmer,
      width: 40,
      height: 40,
      borderRadius: '50%',
      flexShrink: 0
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      flex: 1
    }
  }, Array.from({
    length: lines
  }).map((_, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      ...shimmer,
      height: 12,
      width: widths[i % widths.length]
    }
  }))));
}

/** Single shimmering skeleton line — compose freely. */
function SkeletonLine({
  width = '100%',
  height = 12,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...shimmer,
      width,
      height,
      ...style
    }
  });
}
Object.assign(__ds_scope, { LoadingState, SkeletonLine });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/LoadingState.jsx", error: String((e && e.message) || e) }); }

// components/icons.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* Allura iconography — Lucide-style line icons: 24×24 grid, 2px stroke,
   round caps & joins. Single-color (currentColor). Not a DS component
   (lowercase file, no .d.ts) — a shared helper for the component set. */

const PATHS = {
  memory: 'M12 5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 9 19a3 3 0 0 0 3-1m0-13a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2A3 3 0 0 1 15 19a3 3 0 0 1-3-1m0-13v14',
  insight: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z',
  event: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  decision: 'M21.8 10A10 10 0 1 1 17 3.3M22 4 12 14.01l-3-3',
  agent: 'M12 8V4H8M4 8h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm3 8h.01M15 16h.01M9 12h6',
  project: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z',
  document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  network: 'M12 2v6m0 8v6M5.6 5.6l4.2 4.2m4.4 4.4 4.2 4.2M2 12h6m8 0h6M5.6 18.4l4.2-4.2m4.4-4.4 4.2-4.2',
  graph: 'M18 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.6l6.8-3.2M8.6 13.4l6.8 3.2',
  home: 'M3 9.5 12 3l9 6.5M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-4.3-4.3',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  settings: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z',
  gear: null,
  plus: 'M5 12h14M12 5v14',
  sparkle: 'M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3Z',
  x: 'M18 6 6 18M6 6l12 12',
  trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  arrowUpRight: 'M7 17 17 7M7 7h10v10',
  lock: 'M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V7a5 5 0 0 1 10 0v4',
  shield: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  check: 'M20 6 9 17l-5-5',
  user: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  chevronRight: 'm9 18 6-6-6-6',
  chevronDown: 'm6 9 6 6 6-6',
  clock: 'M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3Z',
  star: 'M11.5 2.8a.6.6 0 0 1 1 0l2.4 5a.6.6 0 0 0 .5.3l5.4.5a.6.6 0 0 1 .3 1l-4 3.6a.6.6 0 0 0-.2.6l1.2 5.3a.6.6 0 0 1-.9.6l-4.6-2.8a.6.6 0 0 0-.6 0L7.1 22.6a.6.6 0 0 1-.9-.6l1.2-5.3a.6.6 0 0 0-.2-.6l-4-3.6a.6.6 0 0 1 .3-1l5.4-.5a.6.6 0 0 0 .5-.3l2.4-5Z',
  message: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
};
const FILLED = {
  dot: /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "6"
  })
};
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  strokeWidth = 2,
  style = {},
  ...rest
}) {
  if (FILLED[name]) {
    return /*#__PURE__*/React.createElement("svg", _extends({
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: color,
      style: {
        display: 'block',
        ...style
      },
      "aria-hidden": "true"
    }, rest), FILLED[name]);
  }
  const d = PATHS[name] || PATHS.document;
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'block',
      ...style
    },
    "aria-hidden": "true"
  }, rest), /*#__PURE__*/React.createElement("path", {
    d: d
  }));
}
const NODE_ICON = {
  memory: 'memory',
  insight: 'insight',
  event: 'event',
  decision: 'decision',
  agent: 'agent',
  project: 'project',
  document: 'document',
  file: 'document'
};
Object.assign(__ds_scope, { Icon, NODE_ICON });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icons.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura EmptyState — friendly placeholder when there's nothing to show.
 * Centered icon medallion, title, supporting copy, and an optional action.
 */
function EmptyState({
  icon = 'memory',
  title = 'No memories yet',
  description = 'Events and decisions will appear here once the agent begins logging.',
  action,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: 12,
      width: '100%',
      padding: '48px 32px',
      background: 'var(--ink-50)',
      borderRadius: 'var(--radius-xl)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 48,
      height: 48,
      borderRadius: '50%',
      background: 'var(--ink-150)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--color-text-tertiary)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 24,
    color: "currentColor"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-lg)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--color-text-primary)'
    }
  }, title), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      lineHeight: 'var(--leading-normal)',
      color: 'var(--color-text-secondary)',
      maxWidth: 360
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, action) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/memory/EvidenceCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TYPES = {
  file: {
    color: 'var(--node-document)',
    icon: 'document',
    label: 'Evidence File'
  },
  event: {
    color: 'var(--node-event)',
    icon: 'event',
    label: 'Event Record'
  },
  decision: {
    color: 'var(--node-decision)',
    icon: 'decision',
    label: 'Decision Record'
  }
};

/**
 * Allura EvidenceCard — a piece of provenance backing a memory or insight.
 * A colored icon badge (by type) sits beside a type overline, title and meta.
 */
function EvidenceCard({
  type = 'file',
  title,
  meta,
  label,
  onClick,
  style = {},
  ...rest
}) {
  const t = TYPES[type] || TYPES.file;
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      width: '100%',
      padding: 14,
      background: 'var(--white)',
      boxShadow: 'var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow var(--duration-base) var(--ease-standard)',
      ...style
    },
    onMouseEnter: e => {
      if (onClick) e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--color-border), var(--shadow-sm)';
    },
    onMouseLeave: e => {
      if (onClick) e.currentTarget.style.boxShadow = 'var(--hairline)';
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      width: 36,
      height: 36,
      borderRadius: 'var(--radius-md)',
      background: t.color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 18,
    color: "#fff"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-overline)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-overline)',
      textTransform: 'uppercase',
      color: t.color
    }
  }, label || t.label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--color-text-primary)'
    }
  }, title), meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, meta) : null));
}
Object.assign(__ds_scope, { EvidenceCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/EvidenceCard.jsx", error: String((e && e.message) || e) }); }

// components/memory/GraphNode.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TYPE_COLOR = {
  memory: 'var(--node-memory)',
  insight: 'var(--node-insight)',
  event: 'var(--node-event)',
  decision: 'var(--node-decision)',
  agent: 'var(--node-agent)',
  project: 'var(--node-project)',
  document: 'var(--node-document)'
};

/**
 * Allura GraphNode — a single node in the knowledge graph: a colored
 * circle with a white type icon and a label beneath. Color encodes type.
 */
function GraphNode({
  type = 'memory',
  label,
  size = 40,
  selected = false,
  style = {},
  onClick,
  ...rest
}) {
  const color = TYPE_COLOR[type] || TYPE_COLOR.memory;
  const text = label != null ? label : type.charAt(0).toUpperCase() + type.slice(1);
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      cursor: onClick ? 'pointer' : 'default',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      boxShadow: selected ? '0 0 0 4px rgba(29,78,216,0.18)' : 'none',
      transition: 'box-shadow var(--duration-base) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: __ds_scope.NODE_ICON[type] || 'memory',
    size: Math.round(size * 0.5),
    color: "#fff"
  })), text ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--color-text-primary)',
      whiteSpace: 'nowrap'
    }
  }, text) : null);
}
Object.assign(__ds_scope, { GraphNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/GraphNode.jsx", error: String((e && e.message) || e) }); }

// components/memory/InsightCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STATES = {
  candidate: {
    accent: 'var(--allura-orange)',
    bg: 'var(--white)',
    badge: 'candidate',
    overline: 'Insight Candidate'
  },
  approved: {
    accent: 'var(--allura-green)',
    bg: '#F0FDF4',
    badge: 'approved',
    overline: 'Approved Insight'
  },
  rejected: {
    accent: 'var(--ink-400)',
    bg: 'var(--ink-50)',
    badge: 'rejected',
    overline: 'Rejected'
  }
};

/**
 * Allura InsightCard — a promoted insight surfaced from the memory graph.
 * State drives the accent + status badge: candidate (orange), approved
 * (green wash), rejected (dimmed).
 */
function InsightCard({
  state = 'candidate',
  title,
  description,
  meta,
  confidence,
  actions,
  style = {},
  ...rest
}) {
  const s = STATES[state] || STATES.candidate;
  const faded = state === 'rejected';
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      width: '100%',
      padding: '16px 16px 16px 18px',
      background: s.bg,
      boxShadow: 'var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      opacity: faded ? 0.7 : 1,
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      background: s.accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-overline)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-overline)',
      textTransform: 'uppercase',
      color: s.accent
    }
  }, s.overline), /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    status: s.badge
  })), title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-title)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 'var(--leading-snug)',
      color: 'var(--color-text-primary)'
    }
  }, title) : null, description ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      lineHeight: 'var(--leading-normal)',
      color: 'var(--color-text-secondary)'
    }
  }, description) : null, confidence != null ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, "Confidence"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 6,
      borderRadius: 'var(--radius-full)',
      background: 'var(--ink-150)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${confidence}%`,
      height: '100%',
      background: s.accent,
      borderRadius: 'var(--radius-full)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--color-text-primary)'
    }
  }, confidence, "%")) : null, meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      color: 'var(--color-text-tertiary)'
    }
  }, meta) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 2
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { InsightCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/InsightCard.jsx", error: String((e && e.message) || e) }); }

// components/memory/MemoryCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura MemoryCard — a stored memory in the feed. Shows a type overline,
 * the memory text, an attribution/meta line and a source/provenance line.
 * States: default, selected (blue wash), superseded (dimmed).
 */
function MemoryCard({
  label = 'Raw Memory',
  title,
  meta,
  source,
  state = 'default',
  accent = 'var(--allura-blue)',
  children,
  onClick,
  style = {},
  ...rest
}) {
  const states = {
    default: {
      background: 'var(--white)',
      boxShadow: 'var(--hairline)',
      opacity: 1
    },
    selected: {
      background: 'var(--blue-50)',
      boxShadow: 'inset 0 0 0 1px var(--allura-blue)',
      opacity: 1
    },
    superseded: {
      background: 'var(--ink-50)',
      boxShadow: 'var(--hairline)',
      opacity: 0.55
    }
  };
  const s = states[state] || states.default;
  return /*#__PURE__*/React.createElement("div", _extends({
    onClick: onClick,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: '100%',
      padding: 16,
      borderRadius: 'var(--radius-lg)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow var(--duration-base) var(--ease-standard), background var(--duration-base) var(--ease-standard)',
      ...s,
      ...style
    }
  }, rest), label ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-overline)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-overline)',
      textTransform: 'uppercase',
      color: state === 'selected' ? 'var(--allura-blue)' : accent
    }
  }, label) : null, title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 'var(--leading-normal)',
      color: 'var(--color-text-primary)'
    }
  }, title) : null, children, meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, meta) : null, source ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      color: 'var(--color-text-tertiary)',
      marginTop: 2
    }
  }, source) : null);
}
Object.assign(__ds_scope, { MemoryCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/MemoryCard.jsx", error: String((e && e.message) || e) }); }

// components/memory/NodeDetailPanel.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TYPE = {
  memory: {
    color: 'var(--node-memory)',
    label: 'Memory'
  },
  insight: {
    color: 'var(--node-insight)',
    label: 'Insight'
  },
  event: {
    color: 'var(--node-event)',
    label: 'Event'
  },
  decision: {
    color: 'var(--node-decision)',
    label: 'Decision'
  },
  agent: {
    color: 'var(--node-agent)',
    label: 'Agent'
  },
  project: {
    color: 'var(--node-project)',
    label: 'Project'
  }
};
function MetaRow({
  label,
  value
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 16,
      padding: '8px 0'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-primary)',
      textAlign: 'right'
    }
  }, value));
}

/**
 * Allura NodeDetailPanel — the inspector for a selected graph node. A fixed
 * 380px panel with a type badge + title header, a provenance meta block,
 * freeform content sections, and an action footer.
 */
function NodeDetailPanel({
  type = 'memory',
  title,
  status,
  meta = [],
  children,
  actions,
  onClose,
  width = 380,
  style = {},
  ...rest
}) {
  const t = TYPE[type] || TYPE.memory;
  return /*#__PURE__*/React.createElement("aside", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      width,
      maxWidth: '100%',
      background: 'var(--white)',
      boxShadow: 'var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: '18px 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      height: 22,
      padding: '0 8px',
      borderRadius: 'var(--radius-sm)',
      background: t.color,
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: '0.06em',
      textTransform: 'uppercase'
    }
  }, t.label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, status ? /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    status: status
  }) : null, onClose ? /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      display: 'inline-flex',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-tertiary)',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M18 6 6 18M6 6l12 12"
  }))) : null)), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-title)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 'var(--leading-snug)',
      color: 'var(--color-text-primary)'
    }
  }, title)), meta.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 20px 12px',
      borderTop: '1px solid var(--color-border)'
    }
  }, meta.map((m, i) => /*#__PURE__*/React.createElement(MetaRow, {
    key: i,
    label: m.label,
    value: m.value
  }))) : null, children ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      padding: '16px 20px',
      borderTop: '1px solid var(--color-border)'
    }
  }, children) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 8,
      padding: '14px 20px',
      borderTop: '1px solid var(--color-border)',
      marginTop: 'auto'
    }
  }, actions) : null);
}

/** Section helper for NodeDetailPanel content. */
function NodeSection({
  title,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-overline)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--tracking-overline)',
      textTransform: 'uppercase',
      color: 'var(--color-text-tertiary)'
    }
  }, title) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      lineHeight: 'var(--leading-normal)',
      color: 'var(--color-text-secondary)'
    }
  }, children));
}
Object.assign(__ds_scope, { NodeDetailPanel, NodeSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/NodeDetailPanel.jsx", error: String((e && e.message) || e) }); }

// components/memory/ReviewQueueCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STATES = {
  pending: {
    bg: 'var(--white)',
    badge: 'candidate',
    badgeLabel: 'Pending review'
  },
  reviewing: {
    bg: '#FFFBEB',
    badge: 'pending',
    badgeLabel: 'Reviewing'
  },
  approved: {
    bg: '#F0FDF4',
    badge: 'approved',
    badgeLabel: 'Approved'
  }
};

/**
 * Allura ReviewQueueCard — an item awaiting human review of a candidate
 * memory/insight. Header carries a queue label + status; body shows the
 * proposed text, attribution and confidence; footer holds review actions.
 */
function ReviewQueueCard({
  state = 'pending',
  queueRef,
  title,
  meta,
  confidence,
  actions,
  style = {},
  ...rest
}) {
  const s = STATES[state] || STATES.pending;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      width: '100%',
      padding: 16,
      background: s.bg,
      boxShadow: 'var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, queueRef ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-micro)',
      color: 'var(--color-text-tertiary)'
    }
  }, queueRef) : /*#__PURE__*/React.createElement("span", null), /*#__PURE__*/React.createElement(__ds_scope.StatusBadge, {
    status: s.badge
  }, s.badgeLabel)), title ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body-lg)',
      fontWeight: 'var(--weight-semibold)',
      lineHeight: 'var(--leading-snug)',
      color: 'var(--color-text-primary)'
    }
  }, title) : null, meta ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, meta) : null, confidence != null ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 6,
      borderRadius: 'var(--radius-full)',
      background: 'var(--ink-150)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: `${confidence}%`,
      height: '100%',
      background: 'var(--allura-blue)',
      borderRadius: 'var(--radius-full)'
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--color-text-primary)'
    }
  }, confidence, "%")) : null, actions ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginTop: 2
    }
  }, actions) : null);
}
Object.assign(__ds_scope, { ReviewQueueCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/ReviewQueueCard.jsx", error: String((e && e.message) || e) }); }

// components/memory/SystemHealthCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STATES = {
  online: {
    bg: '#F0FDF4',
    dot: '#16A34A',
    label: 'Online'
  },
  processing: {
    bg: '#FFFBEB',
    dot: '#D97706',
    label: 'Processing'
  },
  offline: {
    bg: '#FEF2F2',
    dot: '#DC2626',
    label: 'Offline'
  }
};

/**
 * Allura SystemHealthCard — status of an agent / service. A tinted card
 * with a live status dot, a headline metric and a supporting label.
 */
function SystemHealthCard({
  name,
  status = 'online',
  statusLabel,
  value,
  unit,
  sublabel,
  style = {},
  ...rest
}) {
  const s = STATES[status] || STATES.online;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      width: '100%',
      padding: 16,
      background: s.bg,
      boxShadow: 'var(--hairline)',
      borderRadius: 'var(--radius-lg)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      fontWeight: 'var(--weight-semibold)',
      color: 'var(--color-text-primary)'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-medium)',
      color: s.dot
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: s.dot,
      boxShadow: `0 0 0 3px ${s.bg}`
    }
  }), statusLabel || s.label)), value != null ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-h3)',
      fontWeight: 'var(--weight-bold)',
      letterSpacing: 'var(--tracking-tight)',
      color: 'var(--color-text-primary)'
    }
  }, value), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--color-text-secondary)'
    }
  }, unit) : null) : null, sublabel ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      color: 'var(--color-text-secondary)'
    }
  }, sublabel) : null);
}
Object.assign(__ds_scope, { SystemHealthCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/memory/SystemHealthCard.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNavItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura SidebarNavItem — one row in the product sidebar. Active rows get a
 * blue wash, a left orange accent bar, and blue icon + label. Supports a
 * collapsed (icon-only) mode and a trailing count badge.
 */
function SidebarNavItem({
  icon = 'home',
  label,
  active = false,
  collapsed = false,
  count,
  onClick,
  style = {},
  ...rest
}) {
  const color = active ? 'var(--allura-blue)' : 'var(--color-text-secondary)';
  return /*#__PURE__*/React.createElement("button", _extends({
    onClick: onClick,
    title: collapsed ? label : undefined,
    "aria-current": active ? 'page' : undefined,
    style: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      height: 44,
      padding: collapsed ? '0' : '0 12px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      border: 'none',
      background: active ? 'var(--blue-50)' : 'transparent',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
      color,
      ...style
    },
    onMouseEnter: e => {
      if (!active) e.currentTarget.style.background = 'var(--ink-50)';
    },
    onMouseLeave: e => {
      if (!active) e.currentTarget.style.background = 'transparent';
    }
  }, rest), active ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 0,
      top: 10,
      bottom: 10,
      width: 3,
      borderRadius: 'var(--radius-full)',
      background: 'var(--allura-orange)'
    }
  }) : null, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 20,
    color: color
  }), !collapsed ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-body)',
      fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
      whiteSpace: 'nowrap'
    }
  }, label), count != null ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      fontWeight: 'var(--weight-semibold)',
      color: active ? 'var(--allura-blue)' : 'var(--color-text-tertiary)',
      background: active ? 'var(--white)' : 'var(--ink-50)',
      borderRadius: 'var(--radius-full)',
      padding: '1px 7px'
    }
  }, count) : null) : null);
}
Object.assign(__ds_scope, { SidebarNavItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNavItem.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SidebarNavigation.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura SidebarNavigation — the full product sidebar: brand lockup, a list
 * of nav items, and a footer (settings + agent status). Expanded (220px)
 * or collapsed (64px icon rail).
 */
function SidebarNavigation({
  items = [],
  activeId,
  onSelect,
  collapsed = false,
  logo,
  product = 'Memory',
  statusText = 'v2.0 · 12 agents active',
  footerItem = {
    id: 'settings',
    icon: 'settings',
    label: 'Settings'
  },
  style = {},
  ...rest
}) {
  const active = activeId != null ? activeId : items[0] && items[0].id;
  return /*#__PURE__*/React.createElement("nav", _extends({
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: collapsed ? 64 : 240,
      height: '100%',
      background: 'var(--color-bg-canvas)',
      borderRight: '1px solid var(--color-border-cream)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 60,
      padding: collapsed ? '0' : '0 16px',
      justifyContent: collapsed ? 'center' : 'flex-start',
      borderBottom: '1px solid var(--color-border-cream)'
    }
  }, logo ? logo : /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--weight-bold)',
      fontSize: 20,
      letterSpacing: '-0.02em',
      color: 'var(--allura-charcoal)'
    }
  }, "allura"), !collapsed && product ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-medium)',
      color: 'var(--color-text-tertiary)'
    }
  }, product) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: collapsed ? '12px 8px' : '12px',
      flex: 1,
      overflowY: 'auto'
    }
  }, items.map(it => /*#__PURE__*/React.createElement(__ds_scope.SidebarNavItem, {
    key: it.id,
    icon: it.icon,
    label: it.label,
    count: it.count,
    collapsed: collapsed,
    active: it.id === active,
    onClick: () => onSelect && onSelect(it.id)
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: collapsed ? '12px 8px' : '12px',
      borderTop: '1px solid var(--color-border-cream)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, footerItem ? /*#__PURE__*/React.createElement(__ds_scope.SidebarNavItem, {
    icon: footerItem.icon,
    label: footerItem.label,
    collapsed: collapsed,
    active: footerItem.id === active,
    onClick: () => onSelect && onSelect(footerItem.id)
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: collapsed ? '0' : '4px 12px',
      justifyContent: collapsed ? 'center' : 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--allura-green)',
      flexShrink: 0
    }
  }), !collapsed ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-micro)',
      color: 'var(--color-text-tertiary)'
    }
  }, statusText) : null)));
}
Object.assign(__ds_scope, { SidebarNavigation });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SidebarNavigation.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TopNavBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Allura TopNavBar — the application header: a centered global search, a
 * notification bell, and a user avatar. White surface with a hairline base.
 */
function TopNavBar({
  onSearch,
  searchPlaceholder = 'Search memories, entities, decisions, evidence…',
  initials = 'RM',
  notifications = 0,
  left,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("header", _extends({
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      height: 64,
      padding: '0 24px',
      background: 'var(--white)',
      boxShadow: 'inset 0 -1px 0 var(--color-border)',
      boxSizing: 'border-box',
      ...style
    }
  }, rest), left ? /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0
    }
  }, left) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      maxWidth: 640
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.SearchBar, {
    placeholder: searchPlaceholder,
    onChange: onSearch
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("button", {
    "aria-label": "Notifications",
    style: {
      position: 'relative',
      display: 'inline-flex',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      color: 'var(--color-text-secondary)',
      padding: 4
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "bell",
    size: 20,
    color: "currentColor"
  }), notifications > 0 ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 0,
      right: 0,
      minWidth: 16,
      height: 16,
      padding: '0 4px',
      borderRadius: 'var(--radius-full)',
      background: 'var(--allura-orange)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontSize: 10,
      fontWeight: 'var(--weight-semibold)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--white)'
    }
  }, notifications) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: '50%',
      background: 'var(--allura-charcoal)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--text-caption)',
      fontWeight: 'var(--weight-semibold)'
    }
  }, initials)));
}
Object.assign(__ds_scope, { TopNavBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TopNavBar.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.SearchBar = __ds_scope.SearchBar;

__ds_ns.SearchFilterBar = __ds_scope.SearchFilterBar;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.LoadingState = __ds_scope.LoadingState;

__ds_ns.SkeletonLine = __ds_scope.SkeletonLine;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.NODE_ICON = __ds_scope.NODE_ICON;

__ds_ns.EvidenceCard = __ds_scope.EvidenceCard;

__ds_ns.GraphNode = __ds_scope.GraphNode;

__ds_ns.InsightCard = __ds_scope.InsightCard;

__ds_ns.MemoryCard = __ds_scope.MemoryCard;

__ds_ns.NodeDetailPanel = __ds_scope.NodeDetailPanel;

__ds_ns.NodeSection = __ds_scope.NodeSection;

__ds_ns.ReviewQueueCard = __ds_scope.ReviewQueueCard;

__ds_ns.SystemHealthCard = __ds_scope.SystemHealthCard;

__ds_ns.SidebarNavItem = __ds_scope.SidebarNavItem;

__ds_ns.SidebarNavigation = __ds_scope.SidebarNavigation;

__ds_ns.TopNavBar = __ds_scope.TopNavBar;

})();
