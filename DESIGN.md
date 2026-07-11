# CloudPulse

Airy, calm, trustworthy with a pulse of activity.

## Overview

CloudPulse is a design system crafted for cloud infrastructure monitoring and DevOps dashboards that need to convey complex system health without overwhelming the operator. The philosophy centers on calm confidence — generous whitespace, soft rounded surfaces, and a sky-to-violet gradient language that evokes reliability and uptime. Panels may optionally switch to dark mode for ambient monitoring screens. Designed for engineers who need clarity at a glance during both routine checks and incident response.

## Colors

- **Primary** (#0EA5E9): Primary actions, active nav items, healthy status indicators
- **Secondary** (#8B5CF6): Accent highlights, secondary actions, graph gradients
- **Tertiary** (#14B8A6): Positive metrics, availability badges, throughput markers
- **Background** (#F8FAFC): App-level canvas, light mode default
- **Surface** (#FFFFFF): Cards, modals, popovers
- **Success** (#22C55E)
- **Warning** (#EAB308)
- **Error** (#EF4444)
- **Info** (#0EA5E9)

## Typography

- **Headline Font**: Plus Jakarta Sans
- **Body Font**: DM Sans
- **Mono Font**: Roboto Mono

- **Display**: Plus Jakarta Sans 52px extra-bold, 1.1 line height, 0.025em tracking. Status hero banners.
- **Headline**: Plus Jakarta Sans 40px bold, 1.2 line height, 0.015em tracking. Page headings.
- **Subhead**: Plus Jakarta Sans 28px semibold, 1.3 line height, 0.01em tracking. Section titles, panel headings.
- **Body Large**: DM Sans 18px regular, 1.6 line height. Lead paragraphs, alert messages.
- **Body**: DM Sans 16px regular, 1.6 line height. Default body text.
- **Body Small**: DM Sans 14px regular, 1.5 line height. Table cells, metadata.
- **Caption**: DM Sans 12px medium, 1.4 line height, 0.01em tracking. Timestamps, chart labels.
- **Overline**: DM Sans 11px bold, 1.2 line height, 0.1em tracking. Service tags, environment labels (uppercase).
- **Code**: Roboto Mono 14px regular, 1.5 line height. Log output, config values, CLI text.

## Spacing

- **Base unit:** 8px
- **Scale:** 0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96
- **Component padding:** 8px (small), 16px (medium), 24px (large)
- **Section spacing:** 32px (mobile), 48px (tablet), 64px (desktop)

## Border Radius

- **None:** 0px — Inline code tokens, status bar edges
- **Small:** 4px — Tags, small badges, compact chips
- **Medium:** 8px — Inputs, buttons, dropdowns
- **Large:** 12px — Cards, panels, modals
- **XL:** 20px — Feature callouts, onboarding dialogs
- **Full:** 9999px — Avatars, status dots, pill indicators

## Elevation

CloudPulse uses subtle, diffused shadows that feel like soft ambient light. Elevation is understated — the goal is gentle lift, not dramatic depth. No harsh edges.
- **Subtle:** 1px offset, 3px blur, #0F172A at 4%; 1px offset, 2px blur, #0F172A at 3%
- **Medium:** 4px offset, 8px blur, -2px spread, #0F172A at 6%; 2px offset, 4px blur, -2px spread, #0F172A at 4%
- **Large:** 12px offset, 20px blur, -4px spread, #0F172A at 7%; 4px offset, 8px blur, -4px spread, #0F172A at 3%
- **Overlay:** 16px offset, 32px blur, -6px spread, #0F172A at 10%; 6px offset, 12px blur, -4px spread, #0F172A at 5%
- **Glow (Primary):** 20px glow #0EA5E9 at 15% — used on active monitoring cards

## Components

### Buttons
- **Primary (Filled)**: #0EA5E9 fill, #FFFFFF text, 8px corners. DM Sans 15px 600. 10px/20px padding. Hover: background shifts to #0284C7. Active: background shifts to #0369A1, scale 0.98.
- **Secondary (Outline)**: transparent, #0EA5E9 text, 1px #0EA5E9 border, 8px corners. 10px/20px padding. Hover: background fills #F0F9FF.
- **Ghost**: transparent, #64748B text. Hover: background fills #F1F5F9, text shifts to #0F172A.
- **Destructive**: #EF4444 fill, white text. Hover: background shifts to #DC2626.
- **Sizes**: Small (34px), Medium (40px), Large (48px)
- **Disabled**: 40% opacity, disabled cursor

### Cards
- **Default**: #FFFFFF fill, 1px #E2E8F0 border, 12px corners. 20px padding. Hover: border color shifts to #CBD5E1.
- **Elevated**: Medium shadow. Hover: shadow transitions to Large, subtle translateY(-1px).

### Inputs
- **Text Input**: #FFFFFF fill, 1px #E2E8F0 border, #0F172A text, 8px corners. DM Sans 15px. #94A3B8 placeholder, 10px/14px padding, 40px tall. Focus: border #0EA5E9, ring 3px ring #0EA5E9 at 12%. Error: border #EF4444, message #EF4444. Disabled: background #F8FAFC, text 50% opacity.
- **Label**: Above input, DM Sans, 14px, 500, #334155
- **Helper text**: 13px, #64748B

### Chips
- **Filter Chip**: 8px corners, 1px #E2E8F0 border. 13px 500. 32px tall, 10px/horizontal padding. Selected: background #0EA5E9, text #FFFFFF, border transparent. Hover: background #F1F5F9.
- **Status Chip**: background #F0FDF4, text #16A34A, border #BBF7D0 healthy, background #FEFCE8, text #CA8A04, border #FEF08A degraded, background #FEF2F2, text #DC2626, border #FECACA down.

### Lists
- **Default List Item**: DM Sans 15px. 48px tall, 12px/16px padding, 1px #F1F5F9 divider, 20px icon, 12px spacing from text with icon. Hover: background #F8FAFC. Selected: background #F0F9FF, text #0EA5E9, left border 2px #0EA5E9.

### Checkboxes
18px, 1.5px #CBD5E1 border, 4px corners. Checked: background #0EA5E9, white checkmark. Indeterminate: background #0EA5E9, white dash. Disabled: 40% opacity. Labels in DM Sans 15px 10px spacing from box.

### Radio Buttons
18px outer circle, 1.5px #CBD5E1 border. Selected: border #0EA5E9, inner dot 9px #0EA5E9. Disabled: 40% opacity. Labels in DM Sans 15px 10px spacing from circle.

### Tooltips
#0F172A fill, #F8FAFC text, 8px corners. 13px 500. 8px/12px padding, 260px max width, 7px arrow, 400ms delay, top (default) position.

## Do's and Don'ts
- Do use semantic status colors consistently — green for healthy, yellow for degraded, red for critical
- Do pair real-time data with visible timestamps so operators know freshness at a glance
- Do use the primary glow shadow on cards that represent live or actively updating services
- Don't use red for non-critical UI elements — reserve it strictly for errors and outages
- Don't auto-refresh data faster than every 10 seconds without a visible loading indicator
- Don't stack more than three alert banners simultaneously — summarize into a single grouped notification
- Do provide dark panel variants for ambient wall-mounted monitoring displays
- Don't rely solely on color to indicate status — always pair with icons or text labels for accessibility