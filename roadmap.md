# Roadmap

- [x] Verify refresh button renders on Sales & Marketing (desktop + mobile) in preview
- [x] Venue clash: stale self-referencing warning on "18th Birthday – Amit" (03 Oct) — root cause was an old import bug; current clash code already excludes self-matches. Migration 0060 recomputes every flagged booking and strips only false warnings (genuine clashes kept), plus cleans lead "venue clash" tags.
- [ ] Publish so the cleanup runs on the live site (Live DB still shows the stale warning until then)
- [ ] Corkage: remove old per-guest/flat pricing settings; add a note field under "Host is bringing their own drinks (corkage)"
