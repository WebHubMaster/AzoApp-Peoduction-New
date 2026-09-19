# Critical Build Learnings (AzoApp)

## Babel "Maximum call stack size exceeded" on recursive JSX components (2026-06)
**Symptom:** Frontend fails to compile with
`RangeError: <file>.jsx: Maximum call stack size exceeded` from `@babel/traverse`.
Standalone `babel.transformFileSync` with `babel-preset-react-app` alone PASSES, so it looks
like a file-size / AST problem — IT IS NOT. (Files were only 55-290 lines.)

**Root cause:** The dev-only babel plugin `@emergentbase/visual-edits` (added by
`withVisualEdits` in `craco.config.js`) infinitely recurses when it processes a
**self-referencing recursive React component** — i.e. a component whose JSX renders itself:
```
function TreeNode({node}) { return <div>{node.children.map(c => <TreeNode node={c}/>)}</div>; }
```
Reproduced: `only-visual-edits` plugin -> FAIL; `only-react-refresh` -> OK; no-plugins -> OK.

**Fix:** Do NOT write self-referencing recursive components in this codebase.
Render recursive/tree data **iteratively** (flatten to a list with a stack + a per-node
`depth`, indent via `marginLeft`, track expand/collapse in a `Set` of open ids).
See `src/pages/merchant/NetworkTreeView.jsx` for the pattern.

**Note:** Splitting a large file or renaming it can appear to "fix" it, but only because it
removed/relocated the recursive component. The real trigger is the self-reference, not size.

## Person360 (admin) demo seeds (2026-09)
Person360 tabs need real data to demo. Standalone idempotent seeders (run with `python -m <name>` from /app/backend):
- seed_partner_earnings_demo — partner_ledger earning rows (gross/commission), incentives, penalties, wallet running balance.
- seed_profile_changes_demo — profile_changes with a photo(doc) change + unmasked field changes.
- seed_partner_docs_demo — registration docs (selfie/aadhaar/pan/passbook) on users + partner_profiles.documents.
- seed_partner_bank_demo — partner_pan + partner_bank_accounts (pending/approved) for Bank&KYC approve/reject/lock.
- seed_pro_and_invoices — 207 invoices (view/PDF).
Note: profile_audit_service.diff now UNMASKS values + emits `docs[]` (old_url/new_url/kind); doc-fields detected by name too (extension-less URLs ok).
Playwright screenshot tool here is ASYNC (await all page calls). Admin tab bar sits under sticky header when scrolled — use el.click() via eval to bypass overlay.
