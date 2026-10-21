# Publication handoff: Reddit remediation

AI-Assisted Documentation: delivery checklist, 2026-10-20. This is preparation, not publication authority or a release receipt. The [goal audit](goal-audit.md) retains all live and human acceptance requirements.

## Verified public baseline

An unauthenticated HTTPS check at 2026-10-20T23:10:52Z resolved GitHub `main` to `fa396a20258100cb5496b46142e9a1c1ef86526f`, then fetched that immutable revision's README: HTTP 200, 463 lines, SHA-256 `e319b33acff3d89cd00a3d995c7a35763d6ad707b7ece5f2d87da235383cd40b`. It does not contain the new heading. The [machine receipt](public-baseline.json) records the URL, revision, time and digest. No repository credentials, cookies or proxy credentials were used.

The current working README is 72 lines. Its existence does not update the public repository. The earlier web-tool result was cached; the fresh HTTPS result above supplies this dated baseline. It does not establish the repository's state after that time or close the historical Reddit 404 concern.

## Keep the delivery scope reviewable

- [x] Identify the actual public revision and compare it with the local draft.
- [x] Preserve the original goal-owned [manifest](review-manifest.json), initial working-tree snapshots and local delta package. Its apply check targets the captured initial tree.
- [x] Prepare and refresh a separately isolated candidate against public base `fa396a20258100cb5496b46142e9a1c1ef86526f`; [Fowler's refresh report](publication-refresh.md) records the current scope, including reviewed AD-71 preparation. The earlier [91-file isolation](publication-isolation.md) remains dated evidence. The current branch still contains unrelated prior work; do not push or stage it wholesale.
- [x] Resolve that candidate's canonical prerequisites without importing unrelated dirty documents. Initial-tree apply success alone was insufficient; the final candidate's patch passes apply-check against a separate export of the verified public base.
- [x] Record the refreshed candidate's base, selected paths and hashes, and verify it separately: typecheck, AD-71+runner64/search66/SDK53 pass. The refreshed selection contains 104 files including its review manifest; final link count, patch digest and apply-check are in `/tmp/allura-reddit-public-candidate-refresh/validation.json`. Existing installed dependencies were reused; no clean-install result follows.
- [x] Check the refreshed candidate's accepted audience, shared example, source/review vocabulary, educational visual labels and canonical additions; [refresh report](publication-refresh.md). Parent inspection confirmed zero published nonblank canonical lines removed and no unrelated backend/auth/dashboard section imported. This is consistency evidence, not verification of the still-failing live journey.

The public-base isolation attempt and any unresolved dependencies must be reported rather than hidden by taking whole dirty files. No conflict marker belongs in a published artifact. Preserve unrelated changes in their original worktree.

## Acceptance before a completion claim

- [ ] Verify a clean installation on authorized isolated infrastructure; preserve commands, initialization, recovery and source revision. The [installation recon](clean-install-recon.md) identifies current source gaps.
- [ ] Run authenticated save, end the session, start another session and discover the same decision; compare ID and content. Record actual source/review state. Exact-ID reconciliation alone does not pass discovery.
- [ ] Observe a separate authorized human review decision. Storage labels, scores and agent output cannot establish that decision.
- [ ] Observe the five arranged participants using the [study protocol](usability-study.md), record actual outcomes, repair failures and retest. Current observations remain 0/5.
- [ ] Recheck applicable SDK, runner, search, link/anchor and infographic checks for changed candidate sources; retain independent review findings and final fingerprints.
- [ ] Obtain missing publication authority for the concrete reviewed candidate and destination. The installed Allura Cowork 0.4.2 skill (`allura-cowork/SKILL.md`, Approval Boundaries) requires explicit approval for “public or external sends.” The documentation-audience decision does not authorize publication or runtime deployment.

If an educational draft is separately authorized for publication before full acceptance, disclose the open gates. That publication cannot be called completion of this goal or a verified product journey.

## Verify the published result without repository credentials

After the authorized merge/publication, resolve the actual public commit and check immutable URLs. Use no authenticated GitHub client, authorization header or session cookie for these checks.

1. Fetch the root README at the published commit and compare its bytes/digest with the reviewed candidate. Check the rendered page's heading and primary first-use link separately.
2. Follow the shared guide and every applicable README's local navigation at that same revision. Record redirects, final URLs and failures; HTTP 200 alone does not prove the intended content.
3. Fetch the three explainer SVG/PNG sets, source notes, alt text and preview. Compare reviewed digests/dimensions; inspect the rendered preview at desktop and 390px width. A local file or cached page cannot establish current public availability.
4. Confirm equivalent text and the source/review boundary remain reachable from the reader path. Optional technical and synthetic portfolio material must retain its labels.
5. Record commit, UTC check time, request URL, response status and content identity. Keep failed or unavailable checks open; do not infer success from a push/merge receipt.
6. Update the goal audit only with this observed public evidence. Obtain separate authority for external status/Notion changes if requested; none has been performed here.

Expected immutable URL shapes, to fill only with the actual published commit:

```text
https://github.com/Allura-Ecosystem/Allura_Memory/blob/<published-commit>/README.md
https://raw.githubusercontent.com/Allura-Ecosystem/Allura_Memory/<published-commit>/docs/user-guide/getting-started.md
https://raw.githubusercontent.com/Allura-Ecosystem/Allura_Memory/<published-commit>/docs/readme/first-use/svg/01-remember-a-decision.svg
```

Publication status: no push, pull request, merge, deployment, public settings change or external status move was performed by this handoff.

## Draft review publication — 2026-10-21 UTC

Sabir explicitly approved publishing the reviewed branch and opening a draft PR. [PR #169](https://github.com/Allura-Ecosystem/Allura_Memory/pull/169) was created from the exact initial 104-file candidate at `dd9a9705cc4e93efcdaad9d7bb12eca64af7ddfc`, then attached to this chat. Public unauthenticated requests verified all 104 immutable-commit files against their candidate bytes and the API reported open/draft/unmerged. The default-branch README remains the older 463-line version. This supersedes the earlier no-publication status as a dated observation, without turning draft review into a release.

CI follow-through identified two bounded issues: exact AI-assisted disclosure labels and same-content dedup replacing an existing retrieval score. Corrections must preserve the workflow, benchmark threshold, per-store eligibility, min-score filters and human/live boundaries; actual follow-up results belong in the first-use evidence and independent technical review. Merge, deployment, real journey proof and participant sessions remain separate open gates.
