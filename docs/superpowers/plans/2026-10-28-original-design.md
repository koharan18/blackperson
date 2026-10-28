# Restore supplied BLACK visual design

User supplied seven original screenshots and explicitly requested implementation. Scope: visual/layout restoration of the current working app, not a new prototype or backend rewrite. Preserve existing records, API contracts and validation. Existing cloud checkout remains the implementation workspace. Browser verification uses the existing Playwright browser and synthetic DB; Sites publication is not requested or needed for the production app.

Reference: user-attached login, bulk registration, comparison input/preview/results and dashboard screenshots in this conversation. They contain personal information; do not transcribe real reference records into code or fixtures. No decorative raster imagery is present. BLACK/B are supplied text brand marks. Use system Korean UI fonts matching the references.

- [x] Update browser expectations to original Korean headings and flat header layout; observe failure before implementation.
- [x] Replace sidebar with 56px horizontal navigation, pink active rule, monochrome brand/actions, staff profile and preserved admin access.
- [x] Recreate two-column light login, flat restriction-history dashboard/table, flat forms, two-column bulk input and inline comparison preview/results.
- [x] Replace sage tokens/shadows/card styling with #fafafa, #18181b, neutral borders and muted slate copy; preserve semantic match badges and pink exact-match rows.
- [x] Run backend regression suite, build, browser workflow and responsive tests; inspect login/dashboard/compare/bulk captures against source screenshots.
- [x] Create a UI-only update ZIP and Windows launcher that identifies the existing app, backs up changed UI and writes no data/private files. No dependency reinstall or DB restore. Include src and UI test alongside dist so future rebuilds retain the new design.

Known constraint: exact original source, chart data and missing record history are unavailable. Do not show fabricated historical counts or charts. Keep current backend month count accurately labelled and preserve current required bulk fields. This task does not recover missing data.
