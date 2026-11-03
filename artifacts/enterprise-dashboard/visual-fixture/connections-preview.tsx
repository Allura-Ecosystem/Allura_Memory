import { FileText, Link2, Pause, ShoppingBag } from "lucide-react"
import { type FormEvent, useState } from "react"
import { usePreviewFiles, validSampleStore } from "./files-state"
import { Badge } from "./studio-ui/badge"
import { Button } from "./studio-ui/button"
import { Input } from "./studio-ui/input"
import "./files-connections.css"

export function ConnectionsPage({ previewRole }: { previewRole: string }): React.ReactElement {
  const model = usePreviewFiles()
  const connection = model.shopify
  const [reviewing, setReviewing] = useState(false)
  const [store, setStore] = useState(connection.store)
  const [products, setProducts] = useState(connection.products)
  const [inventory, setInventory] = useState(connection.inventory)
  const [error, setError] = useState("")
  const admin = previewRole === "Admin"
  const imported = model.files.filter((file) => file.id.startsWith("SHOPIFY-"))
  function review(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get("store"))
    const chosenProducts = data.has("products")
    const chosenInventory = data.has("inventory")
    setStore(name)
    setProducts(chosenProducts)
    setInventory(chosenInventory)
    if (!validSampleStore(name)) {
      setError("Enter a fictional store such as allura-sample.myshopify.com, without a URL or path.")
      setReviewing(false)
      return
    }
    if (!chosenProducts && !chosenInventory) {
      setError("Choose at least one type of example information.")
      return
    }
    setError("")
    setReviewing(true)
  }
  return (
    <div className="connections-page studio-preview">
      <div className="files-heading">
        <div>
          <p className="files-eyebrow">Bring your tools together</p>
          <h2>Connected tools</h2>
          <p>Your store’s information, alongside your team’s work.</p>
        </div>
        <ShoppingBag aria-hidden="true" size={32} />
      </div>
      <p className="files-note">
        Portfolio demonstration. No Shopify account is connected. This flow uses fictional files, makes no network
        requests, and never asks for a password or access token.
      </p>
      <section className="connector-overview">
        <div className="connector-identity">
          <ShoppingBag size={24} aria-hidden="true" />
          <div>
            <h2>Shopify</h2>
            <p>Product and inventory examples for your Sales team.</p>
          </div>
          <Badge variant="outline">{connection.status}</Badge>
        </div>
        <dl className="connector-facts">
          <div>
            <dt>Sample owner</dt>
            <dd>Alex Morgan</dd>
          </div>
          <div>
            <dt>Team</dt>
            <dd>Sales</dd>
          </div>
          <div>
            <dt>Access shown</dt>
            <dd>Read selected information</dd>
          </div>
        </dl>
      </section>
      {!admin && (
        <section className="files-note">
          <h2>Ask your administrator</h2>
          <p>
            Only the Administrator example can set up or manage a sample connection. Change the fictional role under
            Preview options to explore this journey.
          </p>
        </section>
      )}
      {admin && connection.status !== "Sample connected" && (
        <section className="connector-setup">
          <h2>
            {connection.status === "Paused" ? "Resume the sample connection" : "1. Choose your store and information"}
          </h2>
          <form onSubmit={review}>
            <label>
              Store address
              <Input
                name="store"
                aria-label="Shopify store address"
                value={store}
                onChange={(event) => {
                  setStore(event.target.value)
                  setReviewing(false)
                }}
                maxLength={80}
                placeholder="allura-sample.myshopify.com"
                required
              />
            </label>
            <small>Use a fictional store ending in .myshopify.com. Leave out https:// and paths.</small>
            <fieldset>
              <legend>Which examples should Allura bring in?</legend>
              <label className="connector-check">
                <input
                  name="products"
                  type="checkbox"
                  checked={products}
                  onChange={(event) => {
                    setProducts(event.target.checked)
                    setReviewing(false)
                  }}
                />
                Products — names and example catalog items
              </label>
              <label className="connector-check">
                <input
                  name="inventory"
                  type="checkbox"
                  checked={inventory}
                  onChange={(event) => {
                    setInventory(event.target.checked)
                    setReviewing(false)
                  }}
                />
                Inventory — example stock counts
              </label>
            </fieldset>
            <Button variant="outline">Review sample access</Button>
          </form>
          {reviewing && (
            <section className="connector-review">
              <h3>2. Review before you continue</h3>
              <p>
                Show read access for <strong>{store}</strong> to{" "}
                {products && inventory ? "Products and Inventory" : products ? "Products" : "Inventory"}.
              </p>
              <p>
                No customers, orders, payments, or changes to your store are included. In a working connector, Shopify
                would ask an authorized store administrator to approve access.
              </p>
              <Button
                onClick={() => {
                  const problem = model.connectShopify(store, products, inventory)
                  setError(problem || "")
                  if (!problem) setReviewing(false)
                }}
              >
                <Link2 size={16} aria-hidden="true" />
                Try sample connection
              </Button>
            </section>
          )}
        </section>
      )}
      {connection.status === "Sample connected" && (
        <section className="connector-setup">
          <h2>Bring example files into Allura</h2>
          <p>
            <strong>{connection.store}</strong> ·{" "}
            {connection.products && connection.inventory
              ? "Products and Inventory"
              : connection.products
                ? "Products"
                : "Inventory"}{" "}
            · sample read access
          </p>
          <p>
            Import once, find the files in Sales, and create a review task from a file. Repeating an import keeps one
            copy of each example.
          </p>
          {admin && (
            <div className="connector-actions">
              <Button
                onClick={() => {
                  setError(model.importShopify() || "")
                }}
              >
                <FileText size={16} aria-hidden="true" />
                Import sample files
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  model.pauseShopify()
                  setError("")
                }}
              >
                <Pause size={16} aria-hidden="true" />
                Pause sample connection
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  model.disconnectShopify()
                  setError("")
                }}
              >
                Disconnect sample
              </Button>
            </div>
          )}
          {admin && (
            <details>
              <summary>Explore a sync problem</summary>
              <p>This example keeps existing files when a sync fails.</p>
              <Button variant="outline" onClick={() => setError(model.importShopify(true) || "")}>
                Try sample sync failure
              </Button>
            </details>
          )}
        </section>
      )}
      {admin && connection.status === "Paused" && (
        <Button
          variant="outline"
          onClick={() => {
            model.disconnectShopify()
            setError("")
          }}
        >
          Disconnect sample
        </Button>
      )}
      {connection.message && (
        <p className="files-feedback" role="status">
          {connection.message}
        </p>
      )}
      {error && (
        <p className="files-feedback" role="alert">
          {error}
        </p>
      )}
      <section className="connector-imports">
        <h2>Example files from this connector</h2>
        {imported.length ? (
          <>
            <p>These are retained sample snapshots. Disconnecting or pausing leaves them available for review.</p>
            <ul>
              {imported.map((file) => (
                <li key={file.id}>
                  <FileText size={18} aria-hidden="true" />
                  <a href={`#files?file=${file.id}`}>{file.name}</a>
                  <small>{file.source}</small>
                </li>
              ))}
            </ul>
            <p>Open a file to link existing work or create a review task.</p>
          </>
        ) : (
          <p>No examples imported yet. An administrator can try the sample connection above.</p>
        )}
      </section>
      <details className="connector-technical">
        <summary>For IT: planned connector access</summary>
        <p>
          Shopify documents read_products and read_inventory as access scopes. This preview does not request or grant
          them. A working connection still needs its authorization, storage, revocation, and isolation contracts.
        </p>
        <a href="https://shopify.dev/docs/api/usage/access-scopes" target="_blank" rel="noreferrer">
          Shopify access scope documentation
        </a>
      </details>
    </div>
  )
}
