import { describe, expect, it } from 'vitest'
import { categories, matchesOrderFilter, orderValue, products, recentOrders, salesShare } from './commerce-samples'
import originalOrders from '../../studio-baseui/app/(main)/dashboard/ecommerce/_components/recent-orders-table/data.json'

describe('Studio commerce sample integrity', () => {
  it('derives displayed product shares from the October summary', () => {
    const combined = products.reduce((total, product) => total + product.sales, 0)
    expect(combined).toBe(35210)
    expect(Math.round(salesShare(combined))).toBe(73)
    expect(products.map(product => Math.round(salesShare(product.sales)))).toEqual([31, 24, 18])
    expect(categories.reduce((total, category) => total + category.share, 0)).toBe(100)
  })
  it('preserves every upstream order fact except the explicitly shifted date', () => {
    expect(recentOrders).toHaveLength(34)
    expect(new Set(recentOrders.map(order => order.id)).size).toBe(34)
    recentOrders.forEach((order, index) => {
      const { date, ...facts } = order
      const { date: originalDate, ...originalFacts } = originalOrders[index]
      expect(facts).toEqual(originalFacts)
      expect(Date.parse(date) - Date.parse(`${originalDate}Z`)).toBe(Date.UTC(2026, 9, 1) - Date.UTC(2026, 3, 23))
      expect(order).not.toBe(originalOrders[index])
    })
    expect(recentOrders.map(order => order.date.slice(0, 10)).sort()[0]).toBe('2026-10-01')
    expect(recentOrders.map(order => order.date.slice(0, 10)).sort().at(-1)).toBe('2026-10-17')
    expect(recentOrders.reduce((total, order) => total + orderValue(order), 0)).toBe(24048)
  })
  it('distinguishes unpaid, unfulfilled, and returned orders without implying payment actions', () => {
    expect(recentOrders.filter(order => matchesOrderFilter(order, 'All'))).toHaveLength(34)
    expect(recentOrders.filter(order => matchesOrderFilter(order, 'Unpaid'))).toHaveLength(10)
    expect(recentOrders.filter(order => matchesOrderFilter(order, 'Unfulfilled'))).toHaveLength(12)
    expect(recentOrders.filter(order => matchesOrderFilter(order, 'Returns'))).toHaveLength(5)
    const paidUnfulfilled = { ...recentOrders[0], payment: 'Paid' as const, fulfillment: 'Unfulfilled' as const }
    expect(matchesOrderFilter(paidUnfulfilled, 'Unpaid')).toBe(false)
    expect(matchesOrderFilter(paidUnfulfilled, 'Needs action')).toBe(true)
    expect(matchesOrderFilter({ ...paidUnfulfilled, fulfillment: 'Returned' }, 'Returns')).toBe(true)
    expect(matchesOrderFilter({ ...paidUnfulfilled, payment: 'Refunded', fulfillment: 'Fulfilled' }, 'Returns')).toBe(true)
  })
})
