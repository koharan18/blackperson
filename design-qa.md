# BLACK original-tone design QA

**final result: passed**

Rich-import follow-up: individual program/reason/memo fields now appear in bulk preview, common-field hints accurately explain fallback precedence, and invalid-row warnings are visible. Existing monochrome tokens and layout are retained. Full unit/API suite 19/19 and browser suite 5/5 passed, with no console errors in the design capture test. Current screenshots were regenerated using synthetic fixtures; no provided personal roster data was used for browser capture.

Scope is the user's request to restore the supplied original visual tone across the existing functional app. This is a production UI update, not a new hosted prototype. No Sites deployment or new data migration was requested.

## Visual truth and captures

Source visual truth: the seven inline screenshots attached to the user's “디자인이라도 이 톤으로 다시 되살려줘” message in this conversation. Inspected directly as images; no separate source-image filesystem paths were provided. They show a light login, horizontal navigation, restriction-history dashboard, bulk form, and comparison input/preview/results. Personal reference records were not copied into code or fixtures.

Browser implementation evidence (Chromium/Playwright, synthetic accounts and records only):
- `docs/images/original-tone/login.png`: CSS/pixel viewport 1487×861, deviceScaleFactor 1, source login 1487×861.
- `docs/images/original-tone/dashboard.png`: 1571×905, source dashboard 1571×905.
- `docs/images/original-tone/bulk.png`: CSS viewport 1418×874; full-page image is taller because existing required fields and preview controls are retained. Source bulk is 1418×874. Compare the common above-fold region; do not interpret full-page height as viewport density drift.
- `docs/images/original-tone/compare-empty.png`: 1373×881, source empty comparison 1373×881.
- `docs/images/original-tone/compare-results.png`: CSS viewport 1373×881; full-page input+preview+results capture. Source results screenshots are scrolled crops, so compare the preview/result table regions rather than their absolute full-page Y positions.
- `docs/images/original-tone/mobile.png`: CSS width 390 and viewport height 844, full-page. No source mobile was provided; this verifies adaptation rather than original mobile fidelity.

No density rescaling was used. Source images in the conversation and implementation images were inspected in the same visual review context. Full views were used for composition; readable login form and comparison-table regions were checked for labels, spacing, input/button sizes, borders and semantic state colors. No pixel-exact or physically side-by-side comparison is claimed, since source image files were not available locally.

## Comparison history

1. Original reconstructed app had a dark sage sidebar, decorative login art, cards and unrelated prose. These were major mismatches (P1). Replaced them with a 56px white horizontal header, pink active underline, neutral line tables, flat counts and the supplied login copy/layout.
2. First capture had an oversized login wordmark, one-line intro summary, a shortened divider, too tall a notice and a bulk column boundary left of the source (P2). Reduced wordmark size; constrained summary width; restored the 576px divider; reduced notice padding; adjusted bulk columns to 1.17fr/1fr. Recaptured all states after the changes. Final login retains the source's two-line description and form at x≈825, width 440, top rule at y126. Bulk second column starts at x≈702 for the 1418px viewport.
3. Final captures show no remaining actionable P0/P1/P2 mismatch for the requested tone and existing app scope.

## Required surfaces

- **Fonts/typography:** system Korean UI fonts with Arial/Malgun Gothic/Noto Sans fallbacks; 40px application headings, 28px login heading, 56px BLACK display wordmark, 14px body/forms, 12–13px navigation/table headings. Source hierarchy and wrapping restored. Native font rendering can vary between Linux and Windows (P3).
- **Spacing/layout:** source login columns and rule positions restored; desktop horizontal navigation and line-separated count/table sections; two-column bulk input; inline input, preview, notice and result sequence. Responsive navigation tested at 390px with no document overflow. Wide tables scroll inside their region.
- **Colors/tokens:** background #fafafa, primary #18181b/#1d1d1f, muted #64748b, neutral #d4d4d8/#e4e4e7 rules, active navigation #ec4899. Exact result rows #fff1f2 and badges pink; normal/unregistered badges pale teal. Large sage panels, shadows and decorative artwork removed.
- **Images/assets:** no illustration/photo/texture assets exist in the supplied reference. The supplied BLACK/B wordmark is text UI, retained as editable branding; no generated imagery or substituted decorative art. Remaining control icons are existing library/native browser controls.
- **Copy/content:** login, section headings, warning, upload, preview, result and footer copy aligned with reference. Visible records/counters remain real API results; no source names/phones/counts were fabricated. All screenshots use synthetic fixtures.

## Intentional product constraints

- Existing required program/reason validation and 2000-row limit are preserved; the source screenshot's optional reason/500-row behavior would require a separately scoped functional change. Labels accurately describe current behavior.
- Existing current-month metric is labelled “이번 달 등록”; no historical counts or missing records are invented. The old source's partially visible six-month chart is not fabricated.
- Administrator access remains under the top user-name menu. Existing password change, staff management and activity access remain reachable.
- Result filter is preserved as a compact select; it does not change comparison or registration semantics.

## Interaction and regression evidence

`npm run build`: passed. `npm run test:e2e`: 4/4 passed, including login, CRUD, inline comparison, XLSX download, mobile navigation, stale-upload protection, file re-selection, successful CSV bulk registration, admin access, palette/header geometry and all evidence captures. Browser console/page-error collection: empty. `npm test`: 15/15 passed before the final file-reselection frontend fix; the final browser suite covers that fix. Backend source, dependency declarations and lockfile are unchanged.

Fresh code review found no Critical/Important issues. Its same-file reselection refinement was fixed with a regression observed failing before the fix and passing after it.

## Update safety

Updater tests verify checksum validation before changes, path restriction, preservation of database/private/backend files, previous-UI backup and repeat-run no-op. Extracted update ZIP applied successfully to a prior installed app copy; data/private/server directory hashes remained unchanged. Windows launcher was reviewed statically; a real Windows update has not been executed from this Linux environment.

## Follow-up polish

- P3: exact font rasterization may differ by the user's Windows font installation and browser zoom. Verify their installed screen after update before adjusting optical font weight.

## Implementation checklist

- [x] Selected source screenshots inspected.
- [x] Login, header, dashboard, forms, preview/results and bulk tone restored.
- [x] Functional backend and actual stored data preserved.
- [x] Browser screenshots inspected after the spacing fixes.
- [x] Existing and new workflows tested.
- [x] Source-reference record privacy preserved.
- [x] UI-only updater prepared and preservation behavior verified.
