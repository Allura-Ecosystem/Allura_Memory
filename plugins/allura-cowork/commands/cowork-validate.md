# cowork-validate

Validate a cowork claim before close.

## Checks

1. Did the claimed runtime actually run?
2. Were files changed, commands run, or messages sent?
3. Is there a memory search receipt or stated unavailable reason?
4. Is there validation evidence?
5. Are approval-required actions separated from completed work?
6. Are remaining risks named?

## Verdicts

- `PASS`: evidence supports the claim.
- `WATCH`: mostly valid, but residual risk remains.
- `BLOCKED`: missing evidence or approval.
