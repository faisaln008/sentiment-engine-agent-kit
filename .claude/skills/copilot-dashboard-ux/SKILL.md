---
name: copilot-dashboard-ux
description: UX and implementation rules for the live negotiation copilot dashboard — glanceable layout, the four mandatory widgets, colour/state semantics, motion, accessibility, WebSocket/POST data flow and demo playback. Use for any work under apps/frontend or when reviewing UI.
---

# Copilot dashboard UX

## Design principle
The user is mid-negotiation and glances for ~1 second. Priority order on screen:
**1. what to do now (mitigation) → 2. how bad is it (traffic light) → 3. is it escalating (volatility) → 4. history (stream).**
One screen, no navigation, no settings page. Discreet: dark-friendly, no sound, motion only for critical.

## Layout (1280×800, all four visible without scroll)
```
┌ header: session ▾ · connection ● · p50 182ms · mode llm:groq ───────────────┐
│ [TRAFFIC LIGHT]   │ MITIGATION (large, 24–28px)                              │
│  ● HIGH           │ "Propose a joint legal review with a fixed date"  [copy] │
│  risk + sentiment │ prev 2 suggestions, dimmed                               │
├───────────────────┴──────────────────────────────────────────────────────────┤
│ ⚠ VOLATILITY ALERT banner (only when active; decays after 8s quiet)           │
├──────────────────────────────────────────────────────────────────────────────┤
│ SENTIMENT STREAM (newest top): time · speaker · chip · conf bar · intent · ms │
└──────────────────────────────────────────────────────────────────────────────┘
```
Narrow screens: stack mitigation → light → alert → stream.

## Semantics
| risk | colour | icon + text | motion |
|---|---|---|---|
| low | green | ✓ LOW | none |
| medium | amber | ! MEDIUM | none |
| high | red | ▲ HIGH | none |
| critical | red + outline | ⛔ CRITICAL | slow pulse (off with prefers-reduced-motion) |
Sentiment chips: 7 distinct hues + text label; never colour-only. Speaker shown as "You" (candidate) / "Them" (counterpart).

## Data flow
- `useTelemetry()` owns WS `/ws/telemetry` (reconnect w/ backoff 0.5→8 s, jitter) and an in-memory ring buffer (200 / session).
- Demo player POSTs a scripted negotiation at real cadence (1–3 s gaps); POST responses feed the same store (dedupe by chunk_id) so it works without WS (reference backend has none).
- Validate every message with contracts zod; drop invalid.
- Render LLM strings as text only.

## Accessibility
`aria-live="polite"` mitigation, `role="alert"` for critical/volatility, contrast ≥ 4.5:1, focus visible, keyboard: `Space` play/pause demo, `C` copy mitigation.

## Avoid
Charts for their own sake, modals, toasts stacking, more than one primary action, auto-scrolling that fights the user.
