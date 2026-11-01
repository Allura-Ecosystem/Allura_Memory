import { randomBytes, randomUUID } from 'node:crypto';
import { SQL } from 'bun';
import { runDbBatches } from '../src/db-test-runner.ts';
// Shared orchestration: production supplies its owned DB; regression fixtures
// exercise these exact subprocess and native-coverage gates without a database.
export async function runDbTests(url: string) {
  // The eight audited duplicate preflights execute only under native canonical ownership.
  // Exact canonical ownership, partitioned once in the original file order.
  const suites = [
  {
    "requiredFile": "./tests/run-limits.test.ts",
    "requiredCases": [
      "run handoff retry exhaustion preserves partial truth and cannot reset through new keys",
      "run separate processes contend for the last workspace lease without exceeding four"
    ]
  },
  {
    "requiredFile": "./tests/run-inspection.test.ts",
    "requiredCases": [
      "run inspection exposes exact pinned complete evidence and page independent doctor without mutation",
      "run inspection strict selectors and independent current human authority preserve foreign privacy",
      "run inspection current inspector revocation serializes both attributable database orders",
      "run inspection coherent snapshot never mixes a concurrent committed cancellation",
      "run inspection query outages are unknown while authority store outages remain forbidden",
      "run inspection reports inconsistent handoff links with a guard sensitive restored control",
      "run inspection validates every projected approval decision and effect field against authoritative evidence",
      "run inspection database time observes lease retry attempts approval and deadline without repair",
      "run inspection missing and changed installed source preserves authorized pinned history",
      "run inspection missing committed success journal approval links cannot verify completion"
    ]
  },
  {
    "requiredFile": "./tests/run-inspection-upgrade.test.ts",
    "requiredCases": [
      "run revision six inspection preserves genuine revision five histories and refuses old execution"
    ]
  },
  {
    "requiredFile": "./tests/run-cancel.test.ts",
    "requiredCases": [
      "run cancel current scoped administrator stops work after original participant revocation",
      "run cancellation and parallel failures preserve committed effect truth",
      "run cancel strict envelopes replay and shared command keys preserve exact receipts",
      "run cancelled preparation and handoff claims fence late fresh process completion",
      "run cancel insert update deferred faults and backend termination preserve full snapshots",
      "run cancel lost committed HTTP response reconciles in a fresh process without semantic effects",
      "run cancel restricted SQL foreign scopes machines and owner linked clients deny without disclosure",
      "run cancel prechecks every fence revision and journal exhaustion without partial mutation",
      "run cancel versus prepare finish serializes both attributable database orders",
      "run cancel versus handoff finish serializes both attributable database orders"
    ]
  },
  {
    "requiredFile": "./tests/run-cancel-upgrade.test.ts",
    "requiredCases": [
      "run revision five upgrade preserves genuine revision four receipts and refuses old execution"
    ]
  },
  {
    "requiredFile": "./tests/run-resume.test.ts",
    "requiredCases": [
      "run resume separates durable admission claim and one linked local completion",
      "run advance replay during committed handoff claim returns original receipt without mutation",
      "run resume fresh processes recover admission and expired claim crashes without repeating preparation",
      "run resume strict commands changed envelopes and cross command keys cannot create effects",
      "run resume original humans current grants bindings and foreign scopes deny every boundary",
      "run resume missing rejected approval stale fences and changed source never authorize handoff",
      "run resume lost committed HTTP response reconciles exact receipt with unchanged semantic stores",
      "run handoff owner and approved reviewer revocation serialize both attributable database orders",
      "run handoff insert update deferred faults and terminated backend leave no partial completion",
      "run resume expired approval never renews at admission or historical recovery",
      "run handoff final expiry guard has valid attributable deferred entry and isolated mutant control",
      "run resume restricted SQL authenticates before validation and dependency links reject splicing",
      "run resume concurrent start key collision reaches uncommitted lookup and fails without another run"
    ]
  },
  {
    "requiredFile": "./tests/run-resume-upgrade.test.ts",
    "requiredCases": [
      "run revision four upgrade preserves genuine revision three decisions and refuses old handoff"
    ]
  },
  {
    "requiredFile": "./tests/run-decision.test.ts",
    "requiredCases": [
      "run decision approve is atomic ready handoff without execution or semantic promotion",
      "run decision exact selectors strict SQL payloads and namespace conflicts write nothing",
      "run decision concurrent start collision reaches post-admission lookup and returns conflict",
      "run decision final expiry guard rolls back after attributable valid deferred entry",
      "run decision signed HTTP rejects malformed raw UTF8 without writes and preserves exact Unicode",
      "run decision current original participants bindings and foreign scopes cannot be substituted",
      "run decision private SQL immutable rows scoped links and pooled contexts enforce isolation",
      "run decision concurrent duplicates and competing choices produce one authoritative transition",
      "run decision insert update deferred faults and backend termination leave no partial approval",
      "run decision owner and reviewer revocation serialize both attributable database orders",
      "run decision source drift denies new approval while exact committed replay stays historical",
      "run decision database expiry rejects pending and in-flight approval without renewing historical replay",
      "run decision HTTP authenticates before body and lost committed response reconciles after restart"
    ]
  },
  {
    "requiredFile": "./tests/run-upgrade.test.ts",
    "requiredCases": [
      "run revision three upgrade preserves genuine paused revision two evidence and refuses old execution",
      "run revision two owned export cleanup survives extraction verification and callback failures",
      "run expired revision two claim replays exact receipt without changing complete history",
      "run still-valid revision two claim original worker is blocked by revision guard after upgrade",
      "run real revision upgrade preserves legacy admission and admits current revision in the same workspace"
    ]
  },
  {
    "requiredFile": "./tests/runs-http.test.ts",
    "requiredCases": [
      "run HTTP inspection returns pinned scoped evidence without mutation",
      "run HTTP cancellation persists one immutable stop receipt without an effect",
      "run HTTP starts pauses approves and resumes one durable local handoff",
      "run exact approval replay never authorizes changed expired or rejected evidence",
      "run lost committed preparation response reconciles without another effect",
      "run HTTP authenticates before body and preserves mixed identity CSRF denial",
      "run HTTP strict selectors and input reject overrides without disclosure",
      "run lost committed HTTP start response reconciles the original admission",
      "run HTTP start persists one immutable scoped admission receipt",
      "run prepare persists measured artifact evidence and pauses for independent approval"
    ]
  },
  {
    "requiredFile": "./tests/runs.test.ts",
    "requiredCases": [
      "run prepare SQL state and measurement constraints reject nullable forged evidence",
      "run prepare retry due time and attempt exhaustion cannot reset through new keys",
      "run prepare aborted work retains admission until real rollback and rejects excess leases",
      "run prepare terminated backend reports unknown and leaves no partial effect",
      "run prepare fresh processes recover an expired claim and fence killed execution",
      "run prepare actual source drift blocks both claim and completion",
      "run prepare owner and reviewer revocation serialize both finish orders",
      "run prepare mismatch records raw measurements without success or approval",
      "run prepare concurrent replay commits one bound approval and immutable effect",
      "run prepare current participant loss denies claims finishes and receipt replay",
      "run prepare strict command and stale fence reject caller asserted completion",
      "run prepare insert update and deferred faults preserve atomic effect boundaries",
      "run authority denies foreign machines self review and current revocation",
      "run restricted tables and pooled contexts preserve immutable scoped evidence",
      "run start owner and reviewer revocation serialize in both database orders",
      "run start insert and deferred commit faults leave no partial admission",
      "run start retention admission is bounded and exact replay survives saturation",
      "run restricted start rejects caller policy handlers outcomes and malformed envelopes",
      "run start replay requires original owner and reviewer bindings",
      "run same key concurrency yields one receipt and changed payload conflicts"
    ]
  },
  {
    "requiredFile": "./tests/selected-consent-browser.test.ts",
    "requiredCases": [
      "selected browser SDK discovery approves grantless exact consent and reads only the approved version",
      "selected browser denies absent invalid expired mixed bearer no share and foreign scope before display",
      "selected browser display bindings reject tamper swapped session cross site replay and expiry without issuance",
      "selected browser rechecks share issuer recipient and workspace loss for approval and cancellation",
      "selected browser real back navigation discards private consent without resubmission",
      "selected browser history restoration clears private request and cannot resurrect a decision",
      "selected browser duplicate display tabs and competing decisions have one effective approval",
      "selected browser lost display or decision responses clear private state and never retry or navigate",
      "selected browser exact request wraps at desktop and phone with readable named controls",
      "selected browser disabled APIs deny private consent and machine only mode has no dashboard",
      "selected browser delayed real responses cannot resurrect state after lifecycle discard",
      "selected browser malformed navigation remains neutral without requesting private display",
      "selected browser dialog dismissal preserves consent while explicit cancellation issues no credential"
    ]
  },
  {
    "requiredFile": "./tests/selected-client.test.ts",
    "requiredCases": [
      "selected client rejects malformed exact UUID before database casts",
      "selected client original issuer and recipient bindings cannot be substituted by alternate active bindings",
      "selected client read first serializes issuer recipient connection and RFC token loss at the real audit boundary",
      "selected client issuance first serializes share issuer recipient and pending connection revocation",
      "selected client authority loss first blocks distinct readers and issuers and token revocation denies cached reads",
      "selected client grantless recipient self consents and exchanges without granting B or workspace access",
      "selected client SDK discovers without a token exchanges PKCE and reads exact content through five tools",
      "selected client exact history and foreign privacy never enable other tools or elevated recipient authority",
      "selected client current share issuer recipient credential connection and workspace attenuate cached authority",
      "selected client self revoke survives share loss and foreign revoke and exact RFC client stay private",
      "selected client protocol rejects mixed scopes modes sessions nonce and immutable display tampering",
      "selected client exchange rejects callback resource PKCE expiry replay and pending revocation with one concurrent winner",
      "selected client private SQL shared transaction bound and immutable audit preserve owner separation",
      "selected client deferred audit faults roll back approval issuance revoke and suppress exact read",
      "selected client read first holds actual authority and audit locks while share revocation waits",
      "selected client revoke first blocks exact read and exchange then denies without disclosure or issuance"
    ]
  },
  {
    "requiredFile": "./tests/memory-shares.test.ts",
    "requiredCases": [
      "selected sharing human approval discloses only the exact version to recipient A",
      "selected sharing historical replay never resurrects revocation and explicit revisions govern reapproval",
      "selected sharing restricted SQL validates exact commands and never accepts extra authority claims",
      "selected sharing history returns only the approved immutable version and never successor neighbor or foreign scope",
      "selected sharing rechecks issuer recipient binding membership grants and workspace without cached authority",
      "selected sharing current administrator can revoke after original issuer or recipient loses authority",
      "selected sharing HTTP rejects forged machine mixed CSRF malformed and unauthorized commands without effects",
      "selected sharing grants no existing HTTP retrieval review administration capture or OAuth surface",
      "selected sharing restricted SQL preserves RLS federation own capture and private append only boundaries",
      "selected sharing deferred audit and receipt failures roll back mutations and suppress read disclosure",
      "selected sharing read first holds locks through audit before share revocation",
      "selected sharing revoke first blocks the reader then denies without disclosure",
      "selected sharing issuer demotion orders both read first and demotion first",
      "selected sharing recipient binding loss orders both read first and loss first",
      "selected sharing absent revoke stays not found for every supplied revision",
      "selected sharing concurrent creation replay and competing revisions have one durable effect per operation",
      "selected sharing exact original issuer binding cannot be replaced by another active human"
    ]
  },
  {
    "requiredFile": "./tests/oauth-consent-browser.test.ts",
    "requiredCases": [
      "OAuth browser real back navigation discards private consent without resubmission",
      "OAuth browser lost display or decision responses clear private state and never retry or navigate",
      "OAuth browser display bindings reject tamper swapped session cross site replay and expiry without issuance",
      "OAuth browser disabled APIs deny private consent and machine only mode has no dashboard",
      "OAuth browser denies absent invalid mixed member foreign and revoked identities before private display",
      "OAuth browser current revocation clears a displayed request without callback or credential",
      "OAuth browser exact request wraps at desktop and phone with readable named controls",
      "OAuth browser history restoration clears private request and cannot resurrect a decision",
      "OAuth browser follows SDK discovery approves exact consent and reconnects for five tools and receipt readback",
      "OAuth browser dialog dismissal preserves consent while explicit cancellation issues no credential"
    ]
  },
  {
    "requiredFile": "./tests/oauth-contract.test.ts",
    "requiredCases": [
      "OAuth discovery metadata is exact anonymous configuration bound and GET only",
      "OAuth discovery challenges preserve gateway and wrapper authentication denials without trusting forwarded hosts",
      "OAuth discovery stays absent when disabled and never decorates scope conflicts or human routes",
      "OAuth exchange serializes with an in flight owner revocation before creating any connection",
      "OAuth pending requests are bounded and expired state is cleaned without background work",
      "OAuth HTTP parser failures return bounded safe JSON without internal diagnostic spill",
      "OAuth exchange rejects verifiers outside RFC7636 syntax even when their S256 challenge matches",
      "OAuth token endpoint rejects scope injection instead of silently issuing a credential",
      "OAuth consent binds the signed display session exact scope and one use nonce without implicit member grants",
      "OAuth exchange enforces PKCE client callback resource expiry and exactly one concurrent redemption",
      "OAuth deferred audit fault rolls back code consumption and every issued artifact while private transitions deny forged callers",
      "OAuth current owner narrowing revocation and missing durable bindings deny cached and subsequent access",
      "OAuth human connection revocation disables delegation and all credentials without granting machine administration",
      "OAuth resource binding cannot fall back to legacy explicit scope after resource mismatch",
      "OAuth protocol rejects ambiguous fields exact callback mismatch and unsafe diagnostics before state creation",
      "OAuth token revocation is registration bound nonenumerating and immediately denies MCP"
    ]
  },
  {
    "requiredFile": "./tests/oauth-http.test.ts",
    "requiredCases": [
      "OAuth isolated core SDK discovers issuer exchanges tokens and closes its separate listener"
    ]
  },
  {
    "requiredFile": "./tests/client-authority.test.ts",
    "requiredCases": [
      "client current and authenticated actions intersect delegation credential and owner",
      "client authentication denies revoked or missing linkage without legacy fallback",
      "client SQL context and event RLS independently enforce delegation action narrowing",
      "client transaction holds current owner grant until commit before revocation",
      "client transaction serializes delegation revocation deletion and action narrowing",
      "client transaction holds owner binding membership and current credential",
      "client transaction waiting behind owner revocation rechecks before callback",
      "client cached identity and SQL deny inactive owner client scope and expired credentials",
      "client binding rejects foreign identities scopes and unapproved member inheritance",
      "client authority tables and preclient bypass helpers are inaccessible to app role",
      "client actual core gateway authenticates bound read and denies narrowing revocation and foreign scope",
      "owner linked client retains admin content authority without human impersonation"
    ]
  },
  {
    "requiredFile": "./tests/memory-experiment-browser.test.ts",
    "requiredCases": [
      "browser independently reviews bounded RAM Durham experiment evidence without implicit promotion"
    ]
  },
  {
    "requiredFile": "./tests/memory-experiment-workflow.test.ts",
    "requiredCases": [
      "experiment multi change handoff persists only the selected replacement with separate receipts",
      "experiment cancelled transaction rolls back pending evidence and leaves no claimed receipt",
      "experiment host bounds admission cancellation and retained work without late submission",
      "experiment submission consumes issued frozen evidence and preserves independent exact proposal review",
      "experiment workflow binds every engine operation to exact owner and current provenance authority",
      "experiment governed workflow preserves changed key stale head expiry and serialized submission boundaries",
      "experiment governed submission atomically binds evidence pending correction and exact durable replay",
      "experiment governed handoff denies foreign tampered revoked and tombstone input without durable effects",
      "experiment governed receipt faults roll back capture proposal and audit together"
    ]
  },
  {
    "requiredFile": "./tests/app-modules.test.ts",
    "requiredCases": [
      "browser apps isolate invalid modules and clear stale views on failure scope change and revocation",
      "browser apps preserve populated evidence across update restore and isolated failure with responsive controls",
      "apps real HTTP authenticates scopes commands and keeps disabled or denied app views independent",
      "apps releases are bounded data only compatible and independently capability checked",
      "apps scoped lifecycle preserves configuration data and immutable exact replay across upgrade disable restore",
      "apps deny machine implicit foreign revoked and incompatible configuration without authority expansion",
      "apps concurrent updates and deferred faults preserve prior head and private append only audit"
    ]
  },
  {
    "requiredFile": "./tests/bumblebee-persistence.test.ts",
    "requiredCases": [
      "Bumblebee inventory bounds projection honestly and never merges changed root populations",
      "Bumblebee real HTTPS ingest returns durable receipts and authenticated read back with strict bounded ingress",
      "Bumblebee durable ingest atomically accepts sanitized evidence and exact concurrent replay",
      "Bumblebee incomplete late empty and foreign populations preserve exact current inventory boundaries",
      "Bumblebee durable ingest denies exclusive audience revoked authority and rejected catalog before body",
      "Bumblebee durable fault boundaries roll back evidence heads alerts simulations and receipts"
    ]
  },
  {
    "requiredFile": "./tests/bumblebee-leases.test.ts",
    "requiredCases": [
      "Bumblebee real HTTPS delivers bound credentials with certificate verification and no proxy trust",
      "Bumblebee lease current authority locks bound revocation and cancelled reads cannot mint leases",
      "Bumblebee runner issuance is explicit source bound hash only and one time with safe replay",
      "Bumblebee leases serialize monotonic generations and exact credential scoped replay without plaintext",
      "Bumblebee leases recheck owner source catalog revocation and expiry before replay",
      "Bumblebee lease and enrollment deferred audit faults roll back counters credentials and immutable history",
      "Bumblebee lease HTTP authenticates before body rejects mixed audiences and cancels bounded reads"
    ]
  },
  {
    "requiredFile": "./tests/bumblebee-configuration.test.ts",
    "requiredCases": [
      "Bumblebee configuration binds human source revision evidence and exact concurrent replay",
      "Bumblebee configuration rejects implicit machine foreign and revoked authority before disclosure",
      "Bumblebee catalog approval pins normalized provenance stable entries and explicit source binding",
      "Bumblebee catalog rejects malformed provenance time authority and executable metadata",
      "Bumblebee configuration audit failures roll back and private immutable tables reject direct writes",
      "Bumblebee catalog audit rollback preserves old trust and exact immutable history",
      "Bumblebee configuration HTTP authenticates before payload and binds CSRF scope and strict commands"
    ]
  },
  {
    "requiredFile": "./tests/projection-delivery.test.ts",
    "requiredCases": [
      "projection real transport requires independent fresh read back not successful PATCH response",
      "projection delayed write and fresh process restart reconcile without a second mutation",
      "projection conflict redirect overflow malformed rate limits and cancellation never permit blind writes",
      "projection durable prewrite crash revocation and concurrent workers do not duplicate remote mutation",
      "projection HTTP scopes CSRF transfer inputs and observation reads never accept a supplied sync claim"
    ]
  },
  {
    "requiredFile": "./tests/projection-browser.test.ts",
    "requiredCases": [
      "browser projection authorizes exact transfer reads real sync and preserves unknown revoked observations"
    ]
  },
  {
    "requiredFile": "./tests/projection.test.ts",
    "requiredCases": [
      "projection transfer atomically binds approved source explicit destination and immutable replay",
      "projection rejects unapproved foreign changed source and nonhuman or implicit transfer authority",
      "projection bounded claims fence concurrent workers and durable write marker forbids blind retry",
      "projection observations distinguish content conflicts unknown due time and exhausted attempts",
      "projection revocation current source and grant changes prevent late work without rewriting evidence",
      "projection restricted tables helpers immutable rows and audit rollback fail closed",
      "projection outbound admission locks current authority and failed marker commits cannot permit a write"
    ]
  },
  {
    "requiredFile": "./tests/persistence.test.ts",
    "requiredCases": [
      "migration is repeatable and checksum drift fails",
      "restricted login is not owner superuser or RLS bypass",
      "authorized append persists exact actor and scoped evidence",
      "RLS denies missing foreign malformed and spoofed contexts",
      "events reject update delete truncate even accidental owner writes",
      "rollback leaves no partial events and reused pool clears scope",
      "current revocation membership lock binding and role are enforced",
      "concurrent revocation waits for transaction then denies next use",
      "database machine binding revocation and ceilings remain current",
      "real HTTP evidence read enforces database scope and revocation"
    ]
  },
  {
    "requiredFile": "./tests/access.test.ts",
    "requiredCases": [
      "creation atomically records explicit admin and requires nominee consent",
      "access HTTP authenticates before input and supports a grantless request lifecycle",
      "service creation requires current explicit ceiling and consenting active human",
      "grants require current independent workspace admin and exact revision",
      "invitations grant nothing until acceptance and recheck inviter authority",
      "access requests support narrower approval privacy and terminal notification",
      "last administrator transfer activates consenting successor atomically",
      "orphan recovery requires different nominee consent and one concurrent winner",
      "organization projection is allowlisted and contains no content or request rationale",
      "audit failure rolls back grant and untrusted identity or locked scope denies",
      "invitation expiry withdrawal cancellation and concurrent revisions fail safely",
      "stale requests and malformed inputs never overwrite grants"
    ]
  },
  {
    "requiredFile": "./tests/capture.test.ts",
    "requiredCases": [
      "capture canonicalization preserves content and normalizes only declared defaults",
      "concurrent capture creates one atomic record set and byte exact replay",
      "capture conflicts and denied scope create no durable effects",
      "operation key is actor scoped and unknown acknowledgement reconciles",
      "capture rollback at every durable boundary and commit leaves no partial set",
      "capture artifacts are immutable restricted and independent of providers",
      "terminated capture connection rolls back and same key safely retries"
    ]
  },
  {
    "requiredFile": "./tests/proposals.test.ts",
    "requiredCases": [
      "proposal generation links exact evidence and high score remains pending",
      "proposal authority rejects spoofed actors unknown modes and inaccessible evidence",
      "curator sees only linked proposal evidence and viewers cannot read pending content",
      "proposal revisions are immutable and concurrent expected version has one winner",
      "proposal audit failure atomically rolls back state versions links and event"
    ]
  },
  {
    "requiredFile": "./tests/decisions.test.ts",
    "requiredCases": [
      "independent human approval creates exact immutable semantic content and receipt",
      "human decision denies machine role-only self source-author and forged identity",
      "stale human decision and foreign evidence cause zero writes",
      "request evidence stays pending and immutable replay survives newer version",
      "real human review HTTP enforces identity CSRF exact version and error privacy"
    ]
  },
  {
    "requiredFile": "./tests/decision-atomic.test.ts",
    "requiredCases": [
      "decision faults at every durable boundary and commit preserve full rollback",
      "concurrent decision replay and independent competing reviewers have one atomic winner",
      "terminated approval connection leaves no partial state and same key can recover",
      "lost HTTP approval response reconciles without repeating semantic mutation"
    ]
  },
  {
    "requiredFile": "./tests/corrections.test.ts",
    "requiredCases": [
      "correction submission is pending retry safe and never directly replaces the head",
      "correction approval appends immutable version and lineage with one current head",
      "competing corrections require explicit refresh and new human reviewed version",
      "correction denies foreign base invalid version and unauthorised actor without writes",
      "supersedes failure rolls back new semantic receipt intent and head change",
      "correction submission receipt failure rolls back evidence proposal and base binding",
      "real correction HTTP exposes exact base for fresh independent review"
    ]
  },
  {
    "requiredFile": "./tests/lifecycle.test.ts",
    "requiredCases": [
      "governed deletion is replay safe while immutable history remains visible",
      "lifecycle authority foreign identifiers and stale heads fail without mutation",
      "lifecycle receipt failure rolls back tombstone event and head state",
      "exact text duplicate approvals preserve provenance and append scoped equivalence",
      "concurrent first duplicate roots and delete retries serialize without double effects",
      "real foreign semantic ids never leak through delete restore history or equivalence"
    ]
  },
  {
    "requiredFile": "./tests/restoration.test.ts",
    "requiredCases": [
      "restoration copies exact history into pending proposal with current permission and replay",
      "independent restoration appends new version and preserves deletion and supersedes",
      "competing restoration exact head revision has one winner and no stale resurrection",
      "restoration hidden source machine approval and revoked authority never change head",
      "restoration late decision failure rolls back head version lineage and receipt",
      "restore historical ancestor creates fresh lineage and rejects original producer approval",
      "real HTTP deletion history restoration and review preserve current authority"
    ]
  },
  {
    "requiredFile": "./tests/indexing.test.ts",
    "requiredCases": [
      "real pinned offline model produces normalized vectors and native semantic retrieval",
      "index current scope and raw source entitlement deny before provider work",
      "index replay validates model identity and vector failure never reports ready",
      "embedding failure uses equivalent scoped lexical fallback with truthful stores",
      "index lease fencing concurrency retries and batch drain persist actual vectors",
      "index revocation after embedding cannot publish and search rechecks lifecycle",
      "indexed foreign workspace sentinel is excluded from native and fallback paths",
      "index cancellation avoids pre-aborted claims and never publishes late provider success"
    ]
  },
  {
    "requiredFile": "./tests/retrieval.test.ts",
    "requiredCases": [
      "semantic get and list distinguish current history and inaccessible identifiers",
      "signed pagination binds principal scope filters and rejects malformed cursors",
      "graph authorizes both endpoints and raw provenance independently",
      "real retrieval HTTP provides signed authorized reuse and no-store graph responses",
      "history search labels stale knowledge while read audits never store content",
      "foreign tenant and workspace graph metadata and cursors remain isolated"
    ]
  },
  {
    "requiredFile": "./tests/federation.test.ts",
    "requiredCases": [
      "real full semantic and native batches retain unindexed exact fresh evidence",
      "live indexed evidence preserves cosine score and explicit unknown confidence semantics",
      "federation reports real path failures without presenting raw fallback as native readiness",
      "federation rechecks current lifecycle and denies authority before fallback",
      "real federation HTTP labels fresh evidence and rejects selector overrides",
      "fresh evidence native and fallback paths isolate actual foreign indexed scopes",
      "federation timeouts preserve fallback and grant changes serialize with retrieval",
      "bounded source selection preserves trimmed Unicode exact evidence priority"
    ]
  },
  {
    "requiredFile": "./tests/retrieval-evaluation.test.ts",
    "requiredCases": [
      "versioned live retrieval evaluation reports mode labeled quality latency freshness and isolation",
      "evaluation metrics distinguish ranking from no answer and reject empty telemetry",
      "fixed additional paraphrases and no answer probes exercise measured vector policy",
      "evaluation reports injected provider timeout and fallback separately from healthy latency"
    ]
  },
  {
    "requiredFile": "./tests/operations.test.ts",
    "requiredCases": [
      "scoped health probes real providers and reports durable pending then indexed freshness",
      "health and observation reads deny org viewer foreign locked and revoked contexts before probes",
      "operational observations are append only scoped redacted and honestly label fallback",
      "health HTTP reports provider failure and unknown timeout without exposing secrets",
      "promotion observations require committed independent decisions and disappear on rollback",
      "saturated provider admission reports unknown readiness without invoking a probe"
    ]
  },
  {
    "requiredFile": "./tests/consumer-http.test.ts",
    "requiredCases": [
      "real MCP initialization and five tools preserve capture replay independent approval and second session reuse",
      "real consumer readback distinguishes receipt evidence preview empty search and denied followup",
      "MCP boundary rejects authority overrides foreign scope and alternate REST capture",
      "MCP schemas reject null enum values and array coercion without invoking alternate semantics",
      "composed gateway shares admission across MCP and API and cancels stalled bodies"
    ]
  },
  {
    "requiredFile": "./tests/consumer-pack.test.ts",
    "requiredCases": [
      "clean packed SDK declarations Node and Bun clients execute real receipt replay without source imports",
      "packed CLI and actual stdio MCP client share governed remote contracts and redact credentials",
      "packed second principal reuses approved record and exact revision deletion honors current grants",
      "consumer packing preserves existing artifacts in caller supplied directories",
      "packed CLI and stdio reject oversized frames with no protocol or credential spill"
    ]
  },
  {
    "requiredFile": "./tests/recovery.test.ts",
    "requiredCases": [
      "actual restore child failure retains bounded redacted diagnostics and no restored schema",
      "recovery targets reject forged capabilities and preserve data through actual database restart",
      "one streaming backup exceeds old buffer limits and two same-day manifests restore exact chosen evidence",
      "restore hashes actual archive and rejects missing corrupt traversal and incompatible evidence before target writes",
      "backup deadline removes partial output and emits no successful manifest",
      "restore refuses pre-existing foreign schema without adding restored data",
      "concurrent restore admits one writer and mutated owned resource bounds deny before operations"
    ]
  },
  {
    "requiredFile": "./tests/core-release.test.ts",
    "requiredCases": [
      "packed core leases actual pinned scanner evidence over verified TLS without executing package scripts",
      "packed dashboard serves integrity bound browser assets without granting anonymous content",
      "clean packed core initializes without seed knowledge and survives real server and database restarts",
      "packed core refuses occupied initialization elevated runtime roles and missing offline model",
      "packed core refuses tampered source before database work and never prints injected credentials",
      "packed recovery backs up and restores without a source checkout or git provenance fallback",
      "packed DOC-J01 through DOC-J06 journey preserves review atomicity replay provenance and current retrieval"
    ]
  },
  {
    "requiredFile": "./tests/device-authority.test.ts",
    "requiredCases": [
      "device current authority intersects owner role and never gains human or admin powers",
      "device owner binding membership grant and current generation fail closed on reused identity",
      "device linkage and baseline helpers are private and RLS sees owner attenuation",
      "device transaction locks owner authority until completion then revocation denies"
    ]
  },
  {
    "requiredFile": "./tests/devices.test.ts",
    "requiredCases": [
      "device expiry requires human reauthentication and duplicate tokens cannot create partial authority",
      "device deferred commit failure and preaborted commands leave no authority or receipts",
      "device enrollment needs explicit current admin approval and proof then returns secret free replay receipts",
      "device enrollment rejects foreign owners expired proofs stale approvers and machine callers",
      "device rotation revocation and replay never reactivate an old credential generation",
      "device concurrent exchanges rotations and enrollment cap have one bounded durable outcome",
      "device audit failure rolls back exchange and rotation without credential leaks"
    ]
  },
  {
    "requiredFile": "./tests/device-http.test.ts",
    "requiredCases": [
      "real device HTTP enrollment enforces human CSRF scope proof and current MCP revocation"
    ]
  },
  {
    "requiredFile": "./tests/device-client.test.ts",
    "requiredCases": [
      "persistent device reconciles lost responses using actual secure store HTTP and MCP"
    ]
  },
  {
    "requiredFile": "./tests/dashboard-http.test.ts",
    "requiredCases": [
      "selected consent page serves only neutral GET HTML with unchanged dashboard security headers",
      "OAuth consent page serves only neutral GET HTML with unchanged dashboard security headers",
      "dashboard HTTP derives current presentation scope without granting organization content access",
      "dashboard queue uses actual RLS current proposals without weakening machine capture"
    ]
  },
  {
    "requiredFile": "./tests/dashboard-browser.test.ts",
    "requiredCases": [
      "browser discards late inspector work and keeps evidence requests and rejection unpromoted",
      "real operator drafts correction and exports only freshly authorized audit observations",
      "real browser reviews signed scoped evidence and preserves stale denial and responsive navigation"
    ]
  },
  {
    "requiredFile": "./tests/dashboard-admin-browser.test.ts",
    "requiredCases": [
      "browser access requests need independent current admin and never imply a content grant",
      "browser approves exact device enrollment revokes current credential and runs one bounded index job"
    ]
  },
  {
    "requiredFile": "./tests/dashboard-graph-browser.test.ts",
    "requiredCases": [
      "browser graph contains invalid roots malformed responses and evidence denial without stale content",
      "browser Memory Map traverses persisted lineage with keyboard filters camera and revoked authority"
    ]
  },
  {
    "requiredFile": "./tests/dashboard-surface-browser.test.ts",
    "requiredCases": [
      "operator keyboard dialog cancels without writes and restores focus in forced colors",
      "operator route viewport matrix has named readable controls and no document overflow"
    ]
  },
  {
    "requiredFile": "./tests/run-retention-journal.test.ts",
    "requiredCases": [
      "run retained total saturation admits one final concurrent start and preserves scoped history",
      "run journal admission exhaustion preserves reserved handoff completion through row 128",
      "run journal exhaustion preserves reserved cancellation after an abandoned boundary claim"
    ]
  }
];
  const batches = [suites.slice(0, 11), suites.slice(11, 42), suites.slice(42)].map(batch => batch.map(suite => suite.requiredFile));
  await runDbBatches({ suites, batches, timeoutMs: 240000, minAssertions: 40,
    env: { ALLURA_DISPOSABLE_DB: 'owned-test-container', ALLURA_DISPOSABLE_DB_URL: url },
    retainReports: process.env.ALLURA_TEST_REPORT_DIRECTORY,
  });
}

if (import.meta.main) {
  const laneStarted = performance.now();

  // No production URL fallback. This lane owns exactly one fresh container.
  if (process.argv.length !== 2) { throw new Error('DB lane accepts no selection overrides'); }
  const stop = '/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026/STOP';
  if (await Bun.file(stop).exists()) { throw new Error('Direct-build STOP present'); }
  const name = `allura-direct-test-${randomUUID()}`;
  const image = 'postgres@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea';
  const password = randomBytes(32).toString('hex');
  function docker(args: string[]): string {
    const result = Bun.spawnSync(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
    if (result.exitCode !== 0) { throw new Error(`Disposable Docker operation failed: ${args[0]}`); }
    return result.stdout.toString().trim();
  }
  let created = false;
  try {
    docker(['run', '--detach', '--name', name, '--label', 'allura.task=direct-build-20261026', '--publish', '127.0.0.1::5432', '--env', `POSTGRES_PASSWORD=${password}`, '--env', 'POSTGRES_DB=allura_test', '--tmpfs', '/var/lib/postgresql/data', image]);
    created = true;
    const binding = docker(['port', name, '5432/tcp']);
    if (!/^127\.0\.0\.1:\d+$/.test(binding)) { throw new Error('Unexpected non-loopback binding'); }
    const url = `postgres://postgres:${password}@${binding}/allura_test`;
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = Bun.spawnSync(['docker', 'exec', name, 'pg_isready', '-U', 'postgres', '-d', 'allura_test'], { stdout: 'pipe', stderr: 'pipe' });
      if (result.exitCode === 0) { ready = true; break; }
      await Bun.sleep(250);
    }
    if (!ready) { throw new Error('Disposable PostgreSQL readiness exhausted'); }
    let server: string | undefined;
    for (let attempt = 0; attempt < 40 && !server; attempt++) {
      const probe = new SQL(url, { connectionTimeout: 1 });
      try { const [version] = await probe`SELECT version()`; server = version.version as string; }
      catch { await Bun.sleep(250); }
      finally { await probe.close(); }
    }
    if (!server) { throw new Error('Disposable TCP readiness exhausted'); }
    console.log(JSON.stringify({ image, server, target: 'isolated-loopback-disposable', container: name }));
    console.log(JSON.stringify({ lane: 'database-timing', phase: 'setup', durationMs: performance.now() - laneStarted }));
    await runDbTests(url);
  } finally {
    if (created) {
      const cleanupStarted = performance.now();
      docker(['rm', '--force', name]);
      const remaining = docker(['ps', '--all', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']);
      if (remaining) { throw new Error('Owned disposable container cleanup unverified'); }
      console.log(`Verified removed owned container ${name}`);
      console.log(JSON.stringify({ lane: 'database-timing', phase: 'cleanup', durationMs: performance.now() - cleanupStarted, totalDurationMs: performance.now() - laneStarted }));
    }
  }
}
