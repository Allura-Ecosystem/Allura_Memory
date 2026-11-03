import { ShoppingBag } from 'lucide-react'
import { Inventory } from './studio-adapters/ecommerce/inventory'
import { KpiStrip } from './studio-adapters/ecommerce/kpi-strip'
import { RecentOrders } from './studio-adapters/ecommerce/recent-orders'
import { StoreTraffic } from './studio-adapters/ecommerce/store-traffic'
import { TopProducts } from './studio-adapters/ecommerce/top-products'
import './studio-ecommerce.css'

/** Adapts the selected Studio Base UI e-commerce page's actual widget layout. */
export function StudioEcommercePage({ previewRole }: { previewRole: string }): React.ReactElement {
  return <div className="studio-source allura-commerce">
    <div className="commerce-heading">
      <div><p className="commerce-eyebrow"><ShoppingBag size={18} aria-hidden="true" /> Your store, in context</p><h2>A closer look at your store</h2><p>Make sense of the example numbers, then bring the source into your team’s work.</p></div>
      <div className="commerce-actions"><a href="#connections">{previewRole === 'Admin' ? 'Explore sample connection' : 'View sample connection'}</a><a href="#files">Open team files →</a></div>
    </div>
    <div className="commerce-notice" role="note"><strong>Fictional portfolio examples · no store connected</strong><p>These fixed demonstration numbers are not Shopify, customer, order or financial records. Connecting or importing examples in Connected tools does not populate these charts. No account is contacted.</p></div>
    <div className="commerce-period"><span>Summary period: October 2026 · static sample</span><span>Sales chart: 12 example months · traffic: one example day</span></div>
    <div className="commerce-grid">
      <div className="commerce-kpis"><KpiStrip /></div>
      <div className="commerce-traffic"><StoreTraffic /></div>
      <div className="commerce-products"><TopProducts /></div>
      <div className="commerce-inventory"><Inventory /></div>
      <div className="commerce-orders"><RecentOrders /></div>
    </div>
    <div className="commerce-footnotes"><p>Charts show fictional values. Blue and Ink distinguish measures; Orange highlights a category, never an approval. Inventory labels identify each state in words.</p><p>The sales line shows revenue and the bars show profit on the same dollar scale. Hover or focus chart points to explore their sample values.</p></div>
    <section className="commerce-next" aria-label="Continue the sample journey"><div><h3>Connect the numbers to the work</h3><p>Try the separate Shopify connection demonstration, import fictional product or inventory files, then create a review task from a file.</p></div><a href="#connections">Try the sample journey →</a></section>
  </div>
}
