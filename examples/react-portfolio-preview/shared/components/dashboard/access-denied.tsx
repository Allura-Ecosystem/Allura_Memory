import styles from "./access-denied.module.css"
import brand from "./brand-tokens.module.css"

/** Presentation only. Never renders identity, requested-resource data, or policy internals. */
export function AccessDenied(): React.ReactElement {
  return (
    <main className={`${brand.theme} ${styles.page}`}>
      <a href="/dashboard" className={styles.brand} aria-label="Allura overview">
        {/* Official runtime asset; preserve its proportions and colors. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/allura-wordmark-runtime.png" alt="allura" width={791} height={272} />
      </a>
      <section className={styles.message} aria-labelledby="access-denied-title">
        <p className={styles.eyebrow}>Workspace access</p>
        <h1 id="access-denied-title">Access denied</h1>
        <p>You do not have access to this workspace.</p>
        <p className={styles.guidance}>If you need access for your work, contact your workspace administrator. No restricted records are shown here.</p>
        <a href="/dashboard" className={styles.returnLink}>Return to overview <span aria-hidden="true">→</span></a>
      </section>
      <p className={styles.footer}>Allura</p>
    </main>
  )
}
