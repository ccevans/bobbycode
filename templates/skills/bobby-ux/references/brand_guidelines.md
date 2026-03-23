<!-- CUSTOMIZE THIS FILE: Replace these example brand tokens with your project's actual colors, fonts, and design tokens after running `bobby init`. This is a starter template showing the structure — your project's values will differ. -->

# Brand Guidelines

## Overview

Replace this with your project's brand identity. Define the aesthetic, color palette, typography, and design tokens that make your product feel cohesive and intentional.

---

## Color System

### Primary Palette

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--rf-cta` | #15803d | 21, 128, 61 | Primary buttons, CTAs, active tabs, links, focus rings |
| `--rf-cta-hover` | #166534 | 22, 101, 52 | Button hover state |
| `--rf-cta-text` | #ffffff | 255, 255, 255 | Text on CTA buttons |
| `--rf-action` | #22c55e | 34, 197, 94 | Interactive badges, focus rings, progress dots |
| `--rf-action-hover` | #16a34a | 22, 163, 74 | Action element hover |

### Gold Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--rf-gold` | #c48c3a | Progress bars, brand accent, onboarding dots, logo |
| `--rf-gold-light` | #d6ba82 | Lighter gold variant |
| `--rf-gold-deep` | #b58c45 | Deeper gold variant |
| `--rf-gold-soft` | rgba(196, 140, 58, 0.12) | Soft gold background tint |

### Text Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--rf-ink` | #111111 | Primary text, headings, structural elements |
| `--rf-ink-light` | #1f2937 | Secondary text |
| `--rf-muted` | #706560 | Meta text, disabled states (WCAG AA ≥4.5:1 on cream) |
| `--rf-muted-light` | #756959 | Lighter muted text |

### Surfaces & Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `--rf-bg` | #faf7f4 | Primary page background (warm cream) — ALL pages |
| `--rf-bg-warm` | #f3ede6 | Secondary background surface |
| `--rf-card` | #ffffff | Card and container backgrounds |
| `--rf-border` | #e5ded6 | Border color |
| `--rf-border-light` | #f0ebe4 | Light border variant |

### Semantic / Status Colors

| State | Background | Text |
|-------|-----------|------|
| Success | #dcfce7 | #16a34a |
| Warning | #fef9c3 | #a16207 |
| Error | #fef2f2 | #dc2626 |
| Hot/Alert | #fecaca | #dc2626 |
| Info | #dbeafe | #2563eb |

---

## Typography

### Font Families

| Role | Font | Weight | Fallback |
|------|------|--------|----------|
| Body | futura-pt | 300 (light) | sans-serif |
| Headings | Graphik | 600 (semibold) | system-ui, sans-serif |

### Type Scale

| Token | Size | Pixels | Usage |
|-------|------|--------|-------|
| `--rf-type-xs` | 0.8125rem | 13px | Badges, counters |
| `--rf-type-sm` | 0.875rem | 14px | Meta text, timestamps |
| `--rf-type-body-sm` | 0.9375rem | 15px | Small body, labels |
| `--rf-type-body` | 1rem | 16px | Body text, inputs |
| `--rf-type-subtitle` | 1.125rem | 18px | Card titles |
| `--rf-type-heading-sm` | 1.25rem | 20px | Small headings |
| `--rf-type-heading` | 1.375rem | 22px | Section headings |
| `--rf-type-heading-lg` | 1.5rem | 24px | Large headings |
| `--rf-type-title` | 1.75rem | 28px | Page titles |
| `--rf-type-hero` | 2rem | 32px | Hero text |
| `--rf-type-display` | 2.25rem | 36px | Display text |

### Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--rf-font-normal` | 400 | Regular body text |
| `--rf-font-medium` | 500 | Emphasized body |
| `--rf-font-semibold` | 600 | Headings, labels |
| `--rf-font-bold` | 700 | Strong emphasis |
| `--rf-font-extrabold` | 800 | Display/hero text |

---

## Spacing System

Based on a 4px unit:

| Token | Value | Pixels |
|-------|-------|--------|
| `--rf-space-1` | 0.25rem | 4px |
| `--rf-space-2` | 0.5rem | 8px |
| `--rf-space-3` | 0.75rem | 12px |
| `--rf-space-4` | 1rem | 16px |
| `--rf-space-5` | 1.25rem | 20px |
| `--rf-space-6` | 1.5rem | 24px |
| `--rf-space-8` | 2rem | 32px |
| `--rf-space-10` | 2.5rem | 40px |
| `--rf-space-12` | 3rem | 48px |
| `--rf-space-16` | 4rem | 64px |
| `--rf-space-24` | 6rem | 96px |

---

## Shape & Corners

### Standardized Border-Radius Scale (Updated March 2026)

| Token | Value | Usage |
|-------|-------|-------|
| `--rf-radius-badge` | 4px | Tiny badges, chips, inline status tags |
| `--rf-radius-input` | 8px | Form inputs, secondary buttons, close buttons |
| `--rf-radius-content` | 10px | Content cards, primary CTA buttons, icon containers |
| `--rf-radius-card` | 12px | Page-level cards, modals, drawers, form containers |
| `--rf-radius-pill` | 9999px | **Navbar CTA ONLY** — do not use elsewhere |

> **Important:** Pill shapes (999px) are reserved exclusively for the navbar "Build Your Campaign" button as a deliberate brand accent. All other buttons use 8-10px radius. The previous 16-24px card radii have been replaced with the tighter 10-12px scale to create a more professional, less bubbly aesthetic. See TKT-077, TKT-078, TKT-079.

---

## Elevation & Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--rf-shadow` | `0 18px 36px rgba(60, 48, 36, 0.07)` | Primary card shadow |
| `--rf-shadow-soft` | `0 12px 22px rgba(60, 48, 36, 0.05)` | Subtle shadow |

**Important:** Shadows use warm brown tones (60, 48, 36), never cool gray. This matches the cream background aesthetic.

---

## Focus & Accessibility

| Token | Value |
|-------|-------|
| `--rf-focus-ring` | `2px solid var(--rf-cta, #15803d)` |
| `--rf-focus-offset` | 2px |

Every interactive element must show a visible green focus ring when focused via keyboard.

---

## Brand Rules

1. **Green** (#15803d) = CTAs, active tabs, links, focus rings. Never use for decoration.
2. **Gold** (#c48c3a) = Progress and brand identity (progress bars, onboarding dots, logo). Never use for CTAs.
3. **Cream** (#faf7f4) = Page background on ALL pages. Never use pure white (#ffffff) as page background.
4. **Ink** (#111111) = Headings, body text, structural elements. High contrast on cream.
5. **Warm shadows** — rgba(60, 48, 36) base. Never cool gray shadows.
6. **Pill buttons** — ONLY the navbar CTA uses border-radius: 999px. All other primary CTAs use 10px, secondary buttons use 8px.
7. **Consistent corners** — Page cards/modals: 12px. Content cards/CTAs: 10px. Inputs/secondary buttons: 8px. Badges: 4px. Don't mix.
8. **Font pairing** — Graphik (headings) + futura-pt (body). No other fonts.
9. **Weight contrast** — Headings: 600 (semibold). Body: 300 (light). The weight contrast creates hierarchy.
10. **Status colors** — Use the semantic palette. Don't invent new status colors.

---

## Common Violations to Watch For

| Violation | What's Wrong | Correct |
|-----------|-------------|---------|
| White page background | #ffffff body background | Use #faf7f4 (cream) |
| Cool gray shadows | `rgba(0,0,0,0.1)` shadows | Use `rgba(60,48,36,0.07)` |
| Green for non-CTA | Green used decoratively | Green = CTAs only |
| Gold for buttons | Gold used as button color | Gold = progress/brand only |
| System fonts | Arial, Helvetica, sans-serif | Use futura-pt / Graphik |
| Bubbly corners on cards | border-radius: 16-24px on cards | Use 12px for page cards, 10px for content cards |
| Pill buttons everywhere | border-radius: 999px on all buttons | Pill ONLY on navbar CTA; use 10px primary, 8px secondary |
| Gray borders | #e5e7eb or #d1d5db | Use #e5ded6 (warm) |
| Missing focus rings | No visible focus state | 2px solid #15803d |
| Mixed icon sets | FontAwesome + Lucide + custom | Pick one icon set |
