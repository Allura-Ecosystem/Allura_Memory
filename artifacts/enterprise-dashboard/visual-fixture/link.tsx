import { type AnchorHTMLAttributes, Children, cloneElement, isValidElement, type ReactElement } from 'react'
const routes: Record<string, string> = {
  '/dashboard': 'overview', '/dashboard/ecommerce': 'ecommerce', '/dashboard/apps': 'apps', '/dashboard/apps/mortgage': 'mortgage', '/dashboard/apps/bumblebee': 'bumblebee', '/dashboard/admin/apps': 'app-settings', '/dashboard/search': 'memories', '/dashboard/memories': 'memories',
  '/dashboard/kanban': 'work', '/dashboard/work-board': 'work', '/dashboard/security': 'trust', '/dashboard/governance': 'trust', '/dashboard/graph': 'graph', '/dashboard/curator': 'review', '/portal': 'devices',
  '/dashboard/mission-control': 'audit', '/dashboard/audit': 'audit', '/dashboard/teams': 'teams', '/dashboard/users': 'people', '/dashboard/profile': 'profile', '/dashboard/roles': 'roles', '/dashboard/file-manager': 'files', '/dashboard/connections': 'connections', '/dashboard/embeddings': 'embeddings',
}
export function previewHref(href: string): string {
  if (!href.startsWith('/')) return href
  const [path, query = ''] = href.split('?')
  const route = routes[path]
  return route ? `#${route}${query ? `?${query}` : ''}` : `#unavailable?target=${encodeURIComponent(path)}`
}
export default function FixtureLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const label = props.href === '/dashboard/mission-control' ? 'Audit & Operations' : props.href === '/dashboard/teams' ? 'Teams' : props.href === '/dashboard/curator' ? 'Review' : null
  const children = label ? Children.map(props.children, child => isValidElement(child) && child.type === 'span' ? cloneElement(child as ReactElement<{children: string}>, {children: label}) : child) : props.children
  return <a {...props} children={children} href={props.href ? previewHref(props.href) : undefined} />
}
