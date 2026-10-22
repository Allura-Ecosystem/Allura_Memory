// Numeric facts from the pinned Studio e-commerce samples; no connected store data.
import originalOrders from '../../studio-baseui/app/(main)/dashboard/ecommerce/_components/recent-orders-table/data.json'
import type { OrderFilter, OrderRow } from '../../studio-baseui/app/(main)/dashboard/ecommerce/_components/recent-orders-table/schema'

export const summarySales = 48560
export const products = [
  { id: 'linen-overshirt', name: 'Linen Overshirt', category: 'Apparel', sales: 14820 },
  { id: 'everyday-tote', name: 'Everyday Tote', category: 'Accessories', sales: 11460 },
  { id: 'ceramic-planter', name: 'Ceramic Planter', category: 'Home', sales: 8930 },
] as const
export const categories = [
  { name: 'Apparel', share: 44, color: 'var(--allura-ink)' },
  { name: 'Accessories', share: 32, color: 'var(--allura-blue)' },
  { name: 'Home', share: 24, color: 'var(--allura-orange)' },
] as const
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
export const salesShare = (value: number) => value / summarySales * 100

// Preserve the actual upstream rows and ordering; shift its Apr23–May9 sample to Oct1–17.
export const recentOrders: OrderRow[] = originalOrders.map(order => {
  const date = new Date(`${order.date}Z`)
  const offset = date.getTime() - Date.UTC(2026, 3, 23)
  return { ...order, date: new Date(Date.UTC(2026, 9, 1) + offset).toISOString() } as OrderRow
})
export const orderValue = (order: OrderRow) => Number(order.total.replace(/[^0-9.]/g, ''))
export const orderDate = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
/** Preserves the pinned upstream status-filter semantics. */
export function matchesOrderFilter(order: OrderRow, filter: OrderFilter): boolean {
  if (filter === 'Needs action') return order.payment === 'Pending' || order.payment === 'Refunded' || order.fulfillment === 'Unfulfilled' || order.fulfillment === 'Returned'
  if (filter === 'Unfulfilled') return order.fulfillment === 'Unfulfilled'
  if (filter === 'Unpaid') return order.payment === 'Pending'
  if (filter === 'Returns') return order.payment === 'Refunded' || order.fulfillment === 'Returned'
  return true
}
