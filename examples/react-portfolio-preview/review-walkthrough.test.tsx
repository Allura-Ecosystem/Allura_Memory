/** @vitest-environment jsdom */
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ReviewWalkthrough, useReviewWalkthrough, type WalkthroughSource } from './review-walkthrough'

const source: WalkthroughSource = {
  title: 'Company handbook v2', workspace: 'Company Knowledge', owner: 'HR team',
  text: 'New colleagues consult the handbook and ask their team lead about onboarding.', version: 2,
}
function Harness({ navigation = false, policy = source }: { navigation?: boolean; policy?: WalkthroughSource }) {
  const controller = useReviewWalkthrough()
  const [visible, setVisible] = useState(true)
  return <>{navigation && <button onClick={() => setVisible(value => !value)}>Toggle screen</button>}{visible ? <ReviewWalkthrough controller={controller} source={policy} /> : <p>Another preview screen</p>}</>
}
function startProposal() {
  fireEvent.click(screen.getByLabelText('I’ve read the sample source'))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to proposal' }))
}
function sendProposal() {
  startProposal()
  fireEvent.click(screen.getByRole('button', { name: 'Send example for review' }))
}
function record(decision: string, reason = 'This is a reason supplied for the fictional review.') {
  fireEvent.change(screen.getByLabelText('Review decision'), { target: { value: decision } })
  fireEvent.change(screen.getByLabelText('Reason for this decision'), { target: { value: reason } })
  fireEvent.click(screen.getByRole('button', { name: 'Record example decision' }))
}
afterEach(cleanup)

describe('React preview review walkthrough', () => {
  it('starts from supplied source facts and requires reading before moving on', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: source.title })).toBeTruthy()
    expect(screen.getByText(source.text)).toBeTruthy()
    expect(screen.getByText(source.owner)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Open the source in Company Knowledge/ }).getAttribute('href')).toBe('#memories?q=handbook')
    expect((screen.getByRole('button', { name: 'Continue to proposal' }) as HTMLButtonElement).disabled).toBe(true)
    startProposal()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'What would you change?' }))
  })

  it('opens the source workspace when another workspace filter is retained', () => {
    function SourceNavigationHarness() {
      const controller = useReviewWalkthrough()
      const [workspace, setWorkspace] = useState('Marketing')
      return <>
        <ReviewWalkthrough controller={controller} source={source} onOpenSource={() => setWorkspace(source.workspace)} />
        <output aria-label="Active workspace">{workspace}</output>
        <section aria-label="Knowledge results">
          {workspace === source.workspace ? <p>{source.title}</p> : <p>No handbook in this workspace.</p>}
        </section>
      </>
    }
    render(<SourceNavigationHarness />)
    const results = screen.getByRole('region', { name: 'Knowledge results' })
    expect(screen.getByLabelText('Active workspace').textContent).toBe('Marketing')
    expect(within(results).queryByText(source.title)).toBeNull()
    const link = screen.getByRole('link', { name: /Open the source in Company Knowledge/ })
    expect(link.getAttribute('href')).toBe('#memories?q=handbook')
    fireEvent.click(link)
    expect(screen.getByLabelText('Active workspace').textContent).toBe(source.workspace)
    expect(within(results).getByText(source.title)).toBeTruthy()
  })

  it('will not submit a blank proposal and preserves the draft when checking the source again', () => {
    render(<Harness />)
    startProposal()
    fireEvent.change(screen.getByLabelText('Proposed change'), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Send example for review' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Proposed change'), { target: { value: 'Add a first-day checklist.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue to proposal' }))
    expect((screen.getByLabelText('Proposed change') as HTMLTextAreaElement).value).toBe('Add a first-day checklist.')
  })

  it('freezes the proposal and source version and requires both a chosen decision and a reason', () => {
    render(<Harness />)
    sendProposal()
    expect((screen.getByLabelText('Review decision') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('Reason for this decision') as HTMLTextAreaElement).value).toBe('')
    const submit = screen.getByRole('button', { name: 'Record example decision' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Review decision'), { target: { value: 'approve' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Reason for this decision'), { target: { value: '  ' } })
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Reason for this decision'), { target: { value: 'Specific supported wording.' } })
    expect(submit.disabled).toBe(false)
    expect(screen.getByText(`${source.title} · version 2`)).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Give the proposal a second look' }))
  })

  it.each([
    ['approve', 'Approved in this example'],
    ['evidence', 'More evidence needed'],
    ['reject', 'Rejected in this example'],
  ])('shows the distinct %s outcome and actual review snapshot', (decision, heading) => {
    render(<Harness />)
    sendProposal()
    record(decision, 'The chosen outcome needs this explanation.')
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    const receipt = screen.getByLabelText('Illustrative review record')
    expect(within(receipt).getByText('The chosen outcome needs this explanation.')).toBeTruthy()
    expect(within(receipt).getByText('Alex Morgan / Jordan Lee · fictional')).toBeTruthy()
    expect(within(receipt).getByText('Browser memory only. Reloading clears this example.')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: heading }))
    expect(screen.getByRole('link', { name: 'Open Store overview →' }).getAttribute('href')).toBe('#ecommerce')
  })

  it('keeps the submitted source snapshot when the supplied record changes', () => {
    const { rerender } = render(<Harness />)
    sendProposal()
    rerender(<Harness policy={{ ...source, title: 'Updated handbook', version: 3 }} />)
    expect(screen.getByText(`${source.title} · version 2`)).toBeTruthy()
    expect(screen.queryByText('Updated handbook · version 3')).toBeNull()
    record('approve')
    expect(within(screen.getByLabelText('Illustrative review record')).getByText(`${source.title} · version 2`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revise proposal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send example for review' }))
    expect(screen.getByText('Updated handbook · version 3')).toBeTruthy()
  })

  it('requires a fresh review after revision and fully resets on restart', () => {
    render(<Harness />)
    sendProposal()
    record('evidence', 'Please describe who owns the checklist.')
    fireEvent.click(screen.getByRole('button', { name: 'Revise proposal' }))
    fireEvent.change(screen.getByLabelText('Proposed change'), { target: { value: 'Add the team lead as the checklist owner.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send example for review' }))
    expect(screen.getByText('Revision 2')).toBeTruthy()
    expect((screen.getByLabelText('Review decision') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('Reason for this decision') as HTMLTextAreaElement).value).toBe('')
    record('approve')
    fireEvent.click(screen.getByRole('button', { name: 'Restart walkthrough' }))
    expect(screen.getByRole('heading', { name: 'Begin with the handbook' })).toBeTruthy()
    expect((screen.getByLabelText('I’ve read the sample source') as HTMLInputElement).checked).toBe(false)
    startProposal()
    expect((screen.getByLabelText('Proposed change') as HTMLTextAreaElement).value).toBe('Clarify the first-day onboarding checklist in the company handbook.')
    fireEvent.click(screen.getByRole('button', { name: 'Send example for review' }))
    expect(screen.getByText('Revision 1')).toBeTruthy()
    expect((screen.getByLabelText('Review decision') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('Reason for this decision') as HTMLTextAreaElement).value).toBe('')
  })

  it('invalidates a pending decision when returning to edit', () => {
    render(<Harness />)
    sendProposal()
    fireEvent.change(screen.getByLabelText('Review decision'), { target: { value: 'approve' } })
    fireEvent.change(screen.getByLabelText('Reason for this decision'), { target: { value: 'An earlier reason.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to edit proposal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send example for review' }))
    expect((screen.getByLabelText('Review decision') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('Reason for this decision') as HTMLTextAreaElement).value).toBe('')
  })

  it('keeps the draft and stage when the parent changes screens', () => {
    render(<Harness navigation />)
    startProposal()
    fireEvent.change(screen.getByLabelText('Proposed change'), { target: { value: 'Keep this draft while I inspect Files.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toggle screen' }))
    expect(screen.getByText('Another preview screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle screen' }))
    expect(screen.getByRole('heading', { name: 'What would you change?' })).toBeTruthy()
    expect((screen.getByLabelText('Proposed change') as HTMLTextAreaElement).value).toBe('Keep this draft while I inspect Files.')
  })
})
