/* eslint-disable @next/next/no-img-element -- Portable static portfolio uses the official local wordmark without a Next image service. */
import { BookOpen, ChevronDown, FolderOpen, LayoutDashboard, LayoutGrid, ListChecks, Menu, Network, PanelsTopLeft, Shield, ShoppingBag, Users } from 'lucide-react'
import { type ReactNode, useEffect, useRef } from 'react'
import brand from '@/components/dashboard/brand-tokens.module.css'
import { Avatar, AvatarFallback } from './studio-ui/avatar'

const navigation = [
  { title: 'Your day', items: [
    { route: 'overview', label: 'Home', icon: LayoutDashboard },
    { route: 'memories', label: 'Company Knowledge', icon: BookOpen },
    { route: 'files', label: 'Files', icon: FolderOpen },
    { route: 'graph', label: 'Connections', icon: Network },
    { route: 'apps', label: 'Apps', icon: LayoutGrid },
    { route: 'ecommerce', label: 'Store overview', icon: ShoppingBag },
    { route: 'work', label: 'Work Board', icon: PanelsTopLeft },
    { route: 'review', label: 'Review changes', icon: ListChecks },
  ] },
  { title: 'Your organization', items: [
    { route: 'people', label: 'People & teams', icon: Users },
    { route: 'trust', label: 'Security & Trust', icon: Shield },
    { route: 'admin', label: 'Administration', icon: Users },
  ] },
]
const descriptions: Record<string, string> = {
  profile: 'A familiar place for your details, preferences and work.',
  people: 'Meet the people behind the work and understand their access.',
  vendors: 'Find company contacts and follow their connections.',
  teams: 'Give each team a clear home and explicit membership.',
  roles: 'Make access understandable, with clear responsibilities.',
  files: 'Find the right file, understand its source, and connect it to work.',
  ecommerce: 'A familiar view of products, stock and sales, using fictional examples.',
  connections: 'Try bringing information from another tool into this sample workspace.',
  apps: 'Choose a familiar place to get your work done.',
  mortgage: 'Keep case documents organized and know what needs a second look.',
  bumblebee: 'Understand a reported device concern and prepare the next step.',
  'app-settings': 'See what each app does and review changes before an update.',
  memories: 'Find company guidance and see where it came from.',
  graph: 'See how files, tasks, people and apps fit together.',
  'memory-graph': 'Follow relationships between the sample knowledge documents.',
  dense: 'Explore a larger sample, one connection at a time.',
  embeddings: 'Check whether documents are ready to appear in search.',
  review: 'See what changed and help decide the next step.',
  work: 'A shared view of what comes next, who owns it, and what is waiting.',
  devices: 'Understand the tools and agents that could work alongside your team.',
  trust: 'Make responsibilities, evidence, and the next step easy to understand.',
  admin: 'Bring people and knowledge together with clear boundaries.',
  audit: 'Follow the story behind a change, from action to evidence.',
  denied: 'Clear boundaries can still feel considerate.',
}

export function PreviewShell({ route, title, workspace, role, contextLabel = 'Sample workspace', contextControls, children }: {
  route: string
  title: string
  workspace: string
  contextLabel?: string
  role: string
  contextControls?: ReactNode
  children: ReactNode
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (menu.current) menu.current.open = false }, [route])
  const active = ['embeddings', 'devices', 'audit', 'denied', 'app-settings'].includes(route) ? 'admin' : ['mortgage', 'bumblebee', 'connections'].includes(route) ? 'apps' : ['teams', 'roles', 'vendors'].includes(route) ? 'people' : ['memory-graph', 'dense'].includes(route) ? 'memories' : route === 'security' ? 'trust' : route
  const nav = (mobile: boolean) => <nav aria-label={mobile ? 'Mobile preview navigation' : 'Preview navigation'}>{navigation.map(group => <section className="portfolio-nav-group" key={group.title}><h2>{group.title}</h2><ul>{group.items.map(item => <li key={item.route}><a href={`#${item.route}`} aria-current={active === item.route ? 'page' : undefined}><item.icon size={18} strokeWidth={1.65} aria-hidden="true" /><span>{item.label}</span></a></li>)}</ul></section>)}</nav>
  return <div className={`${brand.theme} portfolio-shell`}>
    <a className="portfolio-skip" href="#dashboard-content">Skip to content</a>
    <div className="portfolio-banner" role="note"><span><strong>Portfolio project</strong> · SOC 2 readiness is a goal. No compliance or audit claim.</span><span>Local sample data · No backend connection</span></div>
    <div className="portfolio-layout">
      <aside className="portfolio-sidebar">
        <a href="#overview" className="portfolio-wordmark" aria-label="Allura preview overview"><img src="/brand/allura-lettermark-al-figma.png" alt="Allura AL icon" width={1024} height={1024} /></a>
        <p className="portfolio-sidebar-caption">A space for shared knowledge</p>
        {nav(false)}
        <div className="portfolio-sidebar-note"><span className="portfolio-note-mark" aria-hidden="true" /><p>Explore freely.<br /><span>Changes stay in this preview.</span></p></div>
      </aside>
      <div className="portfolio-column">
        <header className="portfolio-topbar">
          <a href="#overview" className="portfolio-mobile-brand" aria-label="Allura preview overview"><img src="/brand/allura-lettermark-al-figma.png" alt="Allura AL icon" width={1024} height={1024} /></a>
          <div className="portfolio-breadcrumb"><span>{contextLabel}</span><strong>{workspace}</strong></div>
          <a href="#profile?person=alex" className="portfolio-persona enterprise-preview" aria-label="My profile"><Avatar><AvatarFallback>AM</AvatarFallback></Avatar><span><strong>My profile</strong><small>Sample {role === 'Viewer' ? 'reader' : role === 'Curator' ? 'editor' : 'administrator'}</small></span></a>
          <details className="portfolio-mobile-menu" ref={menu}><summary><Menu size={18} aria-hidden="true" /><span>Menu</span><ChevronDown size={14} aria-hidden="true" /></summary>{nav(true)}</details>
        </header>
        <main id="dashboard-content" tabIndex={-1} className={`portfolio-main portfolio-route-${route}`}>
          {route !== 'overview' && <div className="portfolio-heading"><h1>{title}</h1><p>{descriptions[route] ?? 'Explore the ideas behind an Allura workspace.'}</p></div>}
          {route !== 'overview' && contextControls && <div className="portfolio-context">{contextControls}</div>}
          {children}
          {route === 'overview' && contextControls && <div className="portfolio-context">{contextControls}</div>}
        </main>
        <footer className="portfolio-footer"><span>Allura · Enterprise memory dashboard concept</span><span>Fictional people and records. Changes reset on reload. Sign-in and permissions are demonstrations only.</span></footer>
      </div>
    </div>
  </div>
}
