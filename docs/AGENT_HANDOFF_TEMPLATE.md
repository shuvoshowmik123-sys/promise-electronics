# Agent Handoff Template

Every worker AI must return this after implementation.

## Summary

One paragraph describing the completed work.

## Files Changed

- `path/to/file.tsx` - what changed
- `path/to/file.ts` - what changed

## Scope Confirmation

- Backend changed: yes/no
- Frontend changed: yes/no
- Admin changed: yes/no
- Customer changed: yes/no
- Corporate changed: yes/no
- Desktop changed: yes/no
- Mobile changed: yes/no

## UI Compliance

For frontend tasks:

- Existing primitives used:
- Mobile/desktop separation preserved:
- Light mode preserved:
- Bangla/English layout considered:
- Bottom dock/sheet overlap checked:
- Old/new style mismatch introduced: yes/no

## Admin Mobile Ledger

Required for admin mobile tasks:

- Ledger row targeted:
- Previous status:
- New status:
- Evidence path:
- Viewports tested:
- Chrome hide/reveal result:
- Dock clearance result:
- Detail/sheet behavior result:
- Keyboard/input behavior result:
- Desktop preservation result:
- Remaining risk:

## Verification

Commands run:

- `npx tsc --noEmit --pretty false`
- `npx vite build --mode development`
- `git diff --check`

Browser/device checks:

- viewport:
- routes:
- findings:

## Risks

- List real risks or `none`.

## Feedback Block

Use the exact block from `AGENTS.md`.
