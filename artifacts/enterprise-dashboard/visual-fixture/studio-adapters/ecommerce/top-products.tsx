// Adapted from the pinned Studio Base UI TopProducts widget; MIT retained in studio-baseui.
import { Button } from '@studio/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@studio/components/ui/card'
import { Separator } from '@studio/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@studio/components/ui/table'
import { useRef, useState } from 'react'
import { categories, money, products, salesShare, summarySales } from './commerce-samples'

export function TopProducts() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const selected = products.find(product => product.id === selectedId)
  const combined = products.reduce((sum, product) => sum + product.sales, 0)
  return <Card className="h-full commerce-top-products"><CardHeader><CardTitle className="font-normal text-muted-foreground text-sm">Sample top products</CardTitle><CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">{Math.round(salesShare(combined))}% of October sales</CardDescription></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-col gap-2"><div aria-label={`Sales by category: ${categories.map(category => `${category.name} ${category.share}%`).join(', ')}`} className="flex h-2 gap-1 overflow-hidden bg-muted" role="img">{categories.map(category => <div aria-hidden="true" key={category.name} className="rounded-md" style={{ backgroundColor: category.color, width: `${category.share}%` }} />)}</div>
        <div className="commerce-category-legend">{categories.map(category => <span key={category.name}><i aria-hidden="true" style={{ backgroundColor: category.color }} />{category.name} {category.share}%</span>)}</div></div>
      <Separator />
      <Table className="commerce-product-table" aria-label="Sample product sales"><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Share</TableHead><TableHead>Sales</TableHead></TableRow></TableHeader><TableBody>{products.map(product => <TableRow key={product.id} data-state={product.id === selectedId ? 'selected' : undefined}><TableCell><button type="button" className="commerce-product-link" aria-pressed={product.id === selectedId} aria-label={`View ${product.name} details`} onClick={event => { openerRef.current = event.currentTarget; setSelectedId(product.id) }}>{product.name}</button><small>{product.category}</small></TableCell><TableCell>{Math.round(salesShare(product.sales))}%</TableCell><TableCell>{money(product.sales).replace('.00', '')}</TableCell></TableRow>)}</TableBody></Table>
      <p className="commerce-data-note">October 2026 examples. Shares use {money(summarySales)} total sales, rounded to the nearest whole percent.</p>
      {selected && <section className="commerce-product-detail" aria-label="Selected product details"><div className="commerce-detail-heading"><h3>{selected.name}</h3><Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedId(null); openerRef.current?.focus() }}>Close</Button></div><p>Fictional product · {selected.category}</p><dl><div><dt>October sales</dt><dd>{money(selected.sales)}</dd></div><div><dt>Share of total sales</dt><dd>{salesShare(selected.sales).toFixed(1)}% before whole-percent rounding</dd></div><div><dt>Individual stock count</dt><dd>Not provided in this sample</dd></div></dl><p className="commerce-data-note">The inventory panel is a separate store-wide example. It does not provide stock for this product.</p></section>}
    </CardContent>
  </Card>
}
