import { useEffect, useReducer, useRef } from 'react'
import './review-walkthrough.css'

export interface WalkthroughSource {
  title: string
  workspace: string
  owner: string
  text: string
  version: number
}

type Stage = 'source' | 'propose' | 'review' | 'outcome'
type Decision = 'approve' | 'evidence' | 'reject'
interface Proposal { text: string; source: WalkthroughSource; revision: number }
interface Outcome { proposal: Proposal; decision: Decision; rationale: string }
interface WalkthroughState {
  stage: Stage
  sourceRead: boolean
  draft: string
  proposal: Proposal | null
  revision: number
  decision: Decision | ''
  rationale: string
  outcome: Outcome | null
}
type Action =
  | { type: 'read'; value: boolean }
  | { type: 'begin' }
  | { type: 'source' }
  | { type: 'draft'; value: string }
  | { type: 'submit'; source: WalkthroughSource }
  | { type: 'decision'; value: Decision | '' }
  | { type: 'rationale'; value: string }
  | { type: 'record' }
  | { type: 'revise' }
  | { type: 'restart' }

const initialDraft = 'Clarify the first-day onboarding checklist in the company handbook.'
const stages: { key: Stage; label: string }[] = [
  { key: 'source', label: 'Read the source' },
  { key: 'propose', label: 'Suggest a change' },
  { key: 'review', label: 'Review independently' },
  { key: 'outcome', label: 'See the outcome' },
]
const decisions: Record<Decision, { label: string; heading: string; next: string }> = {
  approve: {
    label: 'Approve this example', heading: 'Approved in this example',
    next: 'The fictional reviewer supports this proposal. The source document is unchanged; no knowledge was published or promoted.',
  },
  evidence: {
    label: 'Request more evidence', heading: 'More evidence needed',
    next: 'The proposal is still unapproved. Revise it to explain the missing evidence, then send the new version through review again.',
  },
  reject: {
    label: 'Reject this example', heading: 'Rejected in this example',
    next: 'The fictional reviewer does not support this proposal. You can revise it and ask for a fresh review, or restart the walkthrough.',
  },
}

function initialState(): WalkthroughState {
  return { stage: 'source', sourceRead: false, draft: initialDraft, proposal: null, revision: 0, decision: '', rationale: '', outcome: null }
}

function reducer(state: WalkthroughState, action: Action): WalkthroughState {
  switch (action.type) {
    case 'read': return { ...state, sourceRead: action.value }
    case 'begin': return state.sourceRead ? { ...state, stage: 'propose' } : state
    case 'source': return { ...state, stage: 'source' }
    case 'draft': return { ...state, draft: action.value, proposal: null, decision: '', rationale: '', outcome: null }
    case 'submit': {
      if (state.stage !== 'propose' || !state.sourceRead || !state.draft.trim()) return state
      const revision = state.revision + 1
      return { ...state, stage: 'review', revision, proposal: { text: state.draft.trim(), source: { ...action.source }, revision }, decision: '', rationale: '', outcome: null }
    }
    case 'decision': return { ...state, decision: action.value }
    case 'rationale': return { ...state, rationale: action.value }
    case 'record': {
      if (state.stage !== 'review' || !state.proposal || !state.decision || !state.rationale.trim()) return state
      return { ...state, stage: 'outcome', outcome: { proposal: state.proposal, decision: state.decision, rationale: state.rationale.trim() } }
    }
    case 'revise': return { ...state, stage: 'propose', proposal: null, decision: '', rationale: '', outcome: null }
    case 'restart': return initialState()
  }
}

/** Keep this controller in App so leaving the walkthrough does not lose its work. */
export function useReviewWalkthrough() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  return { state, dispatch }
}

interface ReviewWalkthroughProps {
  controller: ReturnType<typeof useReviewWalkthrough>
  source: WalkthroughSource
  onOpenSource?: () => void
}

export function ReviewWalkthrough({ controller, source, onOpenSource }: ReviewWalkthroughProps) {
  const { state, dispatch } = controller
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStage = useRef(state.stage)
  useEffect(() => {
    if (previousStage.current !== state.stage) heading.current?.focus()
    previousStage.current = state.stage
  }, [state.stage])
  const step = stages.findIndex(item => item.key === state.stage)
  const outcome = state.outcome
  const title = state.stage === 'source' ? 'Begin with the handbook'
    : state.stage === 'propose' ? 'What would you change?'
      : state.stage === 'review' ? 'Give the proposal a second look'
        : outcome ? decisions[outcome.decision].heading : 'Review outcome'

  return <div className="review-walkthrough">
    <div className="rw-intro">
      <p className="eyebrow">A guided Allura example</p>
      <p>Follow a handbook change from its source to a reviewer’s decision.</p>
      <p className="sample-note" role="note">Fictional people and local sample data only. This walkthrough does not publish knowledge, create a Work Board task, contact a service, or record a real approval. Your place is kept while you explore other preview screens; reloading starts over.</p>
    </div>
    <ol className="rw-steps" aria-label="Walkthrough progress">
      {stages.map((item, index) => <li key={item.key} aria-current={state.stage === item.key ? 'step' : undefined}>
        <span className="rw-step-number" aria-hidden="true">{index + 1}</span><span>{item.label}</span>
      </li>)}
    </ol>
    <section className="preview-section rw-panel" aria-labelledby="rw-stage-heading">
      <p className="rw-step-caption">Step {step + 1} of {stages.length} · {stages[step].label}</p>
      <h2 id="rw-stage-heading" ref={heading} tabIndex={-1}>{title}</h2>

      {state.stage === 'source' && <>
        <p>A useful suggestion starts with what the source actually says.</p>
        <div className="rw-source">
          <h3>{source.title}</h3>
          <dl><dt>Workspace</dt><dd>{source.workspace}</dd><dt>Owner</dt><dd>{source.owner}</dd><dt>Source version</dt><dd>{source.version}</dd></dl>
          <blockquote>{source.text}</blockquote>
          <a href="#memories?q=handbook" onClick={onOpenSource}>Open the source in Company Knowledge →</a>
          <p className="rw-help">Use Review changes to return here. The walkthrough keeps your place.</p>
        </div>
        <label className="rw-confirm"><input type="checkbox" checked={state.sourceRead} onChange={event => dispatch({ type: 'read', value: event.target.checked })} />I’ve read the sample source</label>
        <div className="rw-actions"><button type="button" className="primary" disabled={!state.sourceRead} onClick={() => dispatch({ type: 'begin' })}>Continue to proposal</button></div>
      </>}

      {state.stage === 'propose' && <form onSubmit={event => { event.preventDefault(); dispatch({ type: 'submit', source }) }}>
        <p>Sample author: <strong>Alex Morgan</strong>. Describe a specific change for <strong>{source.title}</strong>, version {source.version}.</p>
        <label>Proposed change<textarea rows={5} value={state.draft} onChange={event => dispatch({ type: 'draft', value: event.target.value })} required /></label>
        <p className="rw-help">Sending this example freezes a copy for review. It does not edit the source document.</p>
        <div className="rw-actions"><button type="submit" className="primary" disabled={!state.draft.trim()}>Send example for review</button><button type="button" onClick={() => dispatch({ type: 'source' })}>Back to source</button></div>
      </form>}

      {state.stage === 'review' && state.proposal && <form onSubmit={event => { event.preventDefault(); dispatch({ type: 'record' }) }}>
        <p><strong>Jordan Lee</strong> is the fictional reviewer; <strong>Alex Morgan</strong> is the author. They are different people in this example, not authenticated identities.</p>
        <dl><dt>Source</dt><dd>{state.proposal.source.title} · version {state.proposal.source.version}</dd><dt>Proposal</dt><dd>Revision {state.proposal.revision}</dd></dl>
        <blockquote>{state.proposal.text}</blockquote>
        <label>Review decision<select value={state.decision} onChange={event => dispatch({ type: 'decision', value: event.target.value as Decision | '' })} required><option value="" disabled>Choose a decision</option>{Object.entries(decisions).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
        <label>Reason for this decision<textarea rows={3} value={state.rationale} onChange={event => dispatch({ type: 'rationale', value: event.target.value })} placeholder="What supports the change, or what is missing?" required /></label>
        <p className="rw-help">Choose a decision and explain it. No decision or evidence check is assumed for you.</p>
        <div className="rw-actions"><button type="submit" className="primary" disabled={!state.decision || !state.rationale.trim()}>Record example decision</button><button type="button" onClick={() => dispatch({ type: 'revise' })}>Back to edit proposal</button></div>
      </form>}

      {state.stage === 'outcome' && outcome && <>
        <p>{decisions[outcome.decision].next}</p>
        <div className="rw-record" aria-label="Illustrative review record">
          <p className="eyebrow">Local illustrative record · no server-issued receipt</p>
          <dl><dt>Source</dt><dd>{outcome.proposal.source.title} · version {outcome.proposal.source.version}</dd><dt>Proposal</dt><dd>Revision {outcome.proposal.revision}</dd><dt>Proposed change</dt><dd>{outcome.proposal.text}</dd><dt>Author / reviewer</dt><dd>Alex Morgan / Jordan Lee · fictional</dd><dt>Decision</dt><dd>{decisions[outcome.decision].label}</dd><dt>Reason</dt><dd>{outcome.rationale}</dd><dt>Persistence</dt><dd>Browser memory only. Reloading clears this example.</dd></dl>
        </div>
        <div className="rw-actions"><button type="button" className="primary" onClick={() => dispatch({ type: 'revise' })}>Revise proposal</button><button type="button" onClick={() => dispatch({ type: 'restart' })}>Restart walkthrough</button></div>
        <nav className="rw-explore" aria-label="Explore the rest of the preview"><h3>See how the rest of the workspace fits together</h3><p>These are separate sample areas. This walkthrough has not added a task, attachment, or connection.</p><ul><li><a href="#work">Explore the Work Board →</a></li><li><a href="#files">Browse team files →</a></li><li><a href="#graph">Explore Connections →</a></li><li><a href="#ecommerce">Open Store overview →</a></li></ul></nav>
      </>}
    </section>
  </div>
}
