# Roadmap

- [x] Verify refresh button renders on Sales & Marketing (desktop + mobile) in preview
- [x] Venue clash: stale self-referencing warning on "18th Birthday – Amit" (03 Oct) — root cause was an old import bug; current clash code already excludes self-matches. Migration 0060 recomputes every flagged booking and strips only false warnings (genuine clashes kept), plus cleans lead "venue clash" tags.
- [ ] Publish so the cleanup runs on the live site (Live DB still shows the stale warning until then)
- [x] Corkage: removed per-guest/flat pricing settings; note field added (prints on run sheet + event page). Migration 0061 applied to Test.
