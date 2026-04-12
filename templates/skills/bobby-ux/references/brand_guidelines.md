<!-- CUSTOMIZE THIS FILE: Replace these example brand tokens with your project's actual colors, fonts, and design tokens after running `bobby init`. This is a starter template showing the structure — your project's values will differ. -->

# Brand Guidelines

## Overview

Replace this with your project's brand identity. Define the aesthetic, color palette, typography, and design tokens that make your product feel cohesive and intentional.

---

## Color System

### Primary Palette

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--brand-primary` | #2563eb | 37, 99, 235 | Primary buttons, CTAs, active tabs, links, focus rings |
| `--brand-primary-hover` | #1d4ed8 | 29, 78, 216 | Button hover state |
| `--brand-primary-text` | #ffffff | 255, 255, 255 | Text on primary buttons |

### Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--brand-accent` | #f59e0b | Progress bars, brand accent, highlights |
| `--brand-accent-light` | #fbbf24 | Lighter accent variant |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | #111827 | Primary text, headings |
| `--text-secondary` | #4b5563 | Secondary text |
| `--text-muted` | #9ca3af | Meta text, disabled states (ensure WCAG AA ≥4.5:1) |

### Surfaces & Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-page` | #ffffff | Primary page background |
| `--bg-surface` | #f9fafb | Secondary background surface |
| `--bg-card` | #ffffff | Card and container backgrounds |
| `--border-default` | #e5e7eb | Border color |
| `--border-light` | #f3f4f6 | Light border variant |

### Semantic / Status Colors

| State | Background | Text |
|-------|-----------|------|
| Success | #dcfce7 | #16a34a |
| Warning | #fef9c3 | #a16207 |
| Error | #fef2f2 | #dc2626 |
| Info | #dbeafe | #2563eb |

---

## Typography

### Font Families

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| Body | Inter | 400 (regular) | system-ui, sans-serif |
| Headings | Inter | 600 (semibold) | system-ui, sans-serif |

### Type Scale

| Token | Size | Pixels | Usage |
|-------|------|--------|-------|
| `--type-xs` | 0.75rem | 12px | Badges, counters |
| `--type-sm` | 0.875rem | 14px | Meta text, timestamps |
| `--type-body` | 1rem | 16px | Body text, inputs |
| `--type-lg` | 1.125rem | 18px | Card titles |
| `--type-xl` | 1.25rem | 20px | Section headings |
| `--type-2xl` | 1.5rem | 24px | Page headings |
| `--type-3xl` | 1.875rem | 30px | Page titles |
| `--type-4xl` | 2.25rem | 36px | Hero / display text |

---

## Spacing System

Based on a 4px unit:

| Token | Value | Pixels |
|-------|-------|--------|
| `--space-1` | 0.25rem | 4px |
| `--space-2` | 0.5rem | 8px |
| `--space-3` | 0.75rem | 12px |
| `--space-4` | 1rem | 16px |
| `--space-6` | 1.5rem | 24px |
| `--space-8` | 2rem | 32px |
| `--space-12` | 3rem | 48px |
| `--space-16` | 4rem | 64px |

---

## Shape & Corners

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Badges, chips, inline tags |
| `--radius-md` | 8px | Inputs, secondary buttons |
| `--radius-lg` | 12px | Cards, modals, primary buttons |
| `--radius-xl` | 16px | Large containers, drawers |
| `--radius-full` | 9999px | Avatars, pills (use sparingly) |

---

## Elevation & Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Subtle elevation |
| `--shadow-md` | `0 4px 6px rgba(0, 0, 0, 0.07)` | Card shadow |
| `--shadow-lg` | `0 10px 15px rgba(0, 0, 0, 0.1)` | Modal/dropdown shadow |

---

## Focus & Accessibility

| Token | Value |
|-------|-------|
| `--focus-ring` | `2px solid var(--brand-primary)` |
| `--focus-offset` | 2px |

Every interactive element must show a visible focus ring when focused via keyboard.

---

## Brand Rules

1. **Primary color** = CTAs, active tabs, links, focus rings. Don't use for decoration.
2. **Accent color** = Progress and brand identity. Don't use for CTAs.
3. **Consistent corners** — pick a radius scale and stick to it. Don't mix arbitrary values.
4. **Font pairing** — pick one or two font families. More creates visual noise.
5. **Status colors** — use the semantic palette. Don't invent new status colors.
6. **Focus states** — every interactive element needs a visible focus indicator.

---

## Common Violations to Watch For

| Violation | What's Wrong | Correct |
|-----------|-------------|---------|
| Missing focus rings | No visible focus state | Add focus ring to all interactive elements |
| Inconsistent corners | Random border-radius values | Use the token scale |
| System fonts only | No brand typography | Use your chosen font family |
| Cool gray on warm bg | Mismatched color temperatures | Keep shadow/border tones consistent with background |
| Missing hover states | Buttons without hover feedback | Add hover state to all interactive elements |
| Low contrast text | Text below WCAG AA ratio | Ensure ≥4.5:1 for body text, ≥3:1 for large text |
