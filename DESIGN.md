---
name: ebaycli Relay Setup
description: The implemented visual system for the optional relay setup portal.
colors:
  accent: "#a43e26"
  accent-hover: "#8b321d"
  accent-active: "#742916"
  nav: "#182e31"
  nav-hover: "#244347"
  nav-active: "#304c4d"
  paper: "#f7f7f2"
  white: "#fff"
  ink: "#17292c"
  muted: "#536365"
  line: "#dce2dd"
  success: "#21613f"
  warning: "#80531a"
  error: "#a02d35"
  focus: "#215da0"
  status-neutral: "#edf0ed"
  status-good: "#e5f2e9"
  status-warning: "#fff0d7"
  status-error: "#fbe9e9"
  command: "#1b3033"
  command-text: "#edf5ee"
typography:
  headline:
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-.035em"
  title:
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-.025em"
  body:
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "15px"
    lineHeight: 1.55
  label:
    fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.55
  command:
    fontFamily: 'ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace'
    fontSize: "12px"
    lineHeight: 1.85
rounded:
  compact-control: "5px"
  control: "8px"
  command: "9px"
  panel: "12px"
  status: "20px"
spacing:
  tight: "8px"
  small: "12px"
  medium: "16px"
  roomy: "20px"
  section: "24px"
  wide: "28px"
  block: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-active}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
  button-copy:
    backgroundColor: "transparent"
    textColor: "#e5f1e8"
    rounded: "{rounded.compact-control}"
    padding: "4px 9px"
  environment-select:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 33px 8px 12px"
    width: "160px"
  copy-fallback:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
  navigation-item:
    textColor: "#c7d8d1"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  navigation-item-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.white}"
  status-good:
    backgroundColor: "{colors.status-good}"
    textColor: "{colors.success}"
    rounded: "{rounded.status}"
    padding: "4px 9px"
  check-panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "24px 28px"
  command-block:
    backgroundColor: "{colors.command}"
    textColor: "{colors.command-text}"
    typography: "{typography.command}"
    rounded: "{rounded.command}"
    padding: "16px 18px"
---

# Design System: ebaycli Relay Setup

## Overview

**Creative North Star: "Relay Workbench"**

A quiet setup workbench uses paper content, dark green navigation, and a rust action to organize practical tasks. Native controls, compact type, and flat bordered surfaces keep configuration and commands easy to scan.

The recorded system applies to the optional relay's web portal. It was extracted from `backend/src/site.ts` and `backend/src/pages.ts`, checked against the desktop, mobile, and live captures in `.impeccable/review/`. The north-star name and color descriptions are documentation vocabulary for this implementation. No formal FORM seed, QUALITY BAR card, or approved comp was available to establish earlier visual approval.

**Key Characteristics:**

- Paper ground with a dark green navigation area.
- Rust for the main handoff action; restrained native controls elsewhere.
- Flat white status panels and dark command blocks.
- Readable labels, explicit status text, and visible keyboard focus.
- A desktop rail that becomes a wrapping mobile navigation band.

## Colors

Warm paper and rust sit beside cool green structural surfaces. The frontmatter holds the exact source values. The sidecar's tonal strips are synthesized previews; they do not add implementation tokens.

### Primary

- **Rust:** the main handoff action, with darker hover and pressed states.
- **Deep green:** navigation and command context; lighter green navigation surfaces identify hover and the selected item.

### Neutral

- **Paper / white:** page ground and bounded check surfaces.
- **Ink / muted:** headings and controls / explanatory text and metadata.
- **Line:** quiet dividers between check rows and setup steps.

### Semantic

- **Success green, warning ochre, error red:** status text paired with a pale state background and written label.
- **Focus blue:** keyboard outlines on links, buttons, the environment selector, and copy fallback.

**The Action Contrast Rule.** The main handoff action uses rust; retry remains a white bordered control. Status colors describe checks rather than actions.

## Typography

The interface uses the system sans-serif stack. Commands use the source monospace stack. There is no separate display face or decorative lettering.

The headline role is the page title; the title role is the setup and scope heading. Compact check headings use a smaller size (20px), and step headings use another smaller size (17px). Explanatory paragraphs commonly use body sizes (13–16px); status and metadata use small labels (11–12px). Paragraph measures range from (58ch) in the page introduction to (72ch) for setup notes.

At the mobile breakpoint, the page title becomes (29px), setup headings become (22px), step headings become (16px), and command text becomes (11px) with a line height of (1.8).

**The Command Context Rule.** Monospace distinguishes executable commands, deployment addresses, and inline technical names. Explanations and controls use the sans-serif stack.

## Layout

Desktop uses a two-column shell: a navigation rail (238px) and a flexible content column. Content is centered within a maximum width (1120px), with padding (40px 56px 30px). The page header and section headers place a control alongside the heading when space permits. Ordered setup steps use a narrow numbered column and an expanding text column; scope content uses two equal columns.

At the intermediate breakpoint (1100px), the rail narrows (210px), content padding becomes (32px 35px), and the page header stacks. At the mobile breakpoint (760px), the shell becomes a single column. Navigation wraps horizontally, supporting sidebar text and the external navigation link are hidden, content padding becomes (25px 20px), the handoff action and environment selector fill the width, and scope/footer content stacks.

Commands preserve whitespace while wrapping long lines anywhere. Sections use generous separation; compact spacing stays inside controls and rows. The check panel uses smaller mobile padding (20px 18px), and command blocks use (13px 14px).

## Elevation & Depth

There are no box shadows in the portal. Paper, white panels, dark navigation, dark command blocks, and thin borders supply separation. Focus uses a visible outline (3px) with an offset (4px); it is an interaction cue rather than elevation.

**The Flat Surface Rule.** Standard surfaces use color and borders for hierarchy; their default, hover, and pressed states do not add shadows or lift.

Button background and border colors transition over (160ms). Anchor navigation scrolls smoothly. Reduced-motion preference removes transitions and restores immediate scrolling.

## Shapes

Controls use gently rounded corners, command blocks use a slightly larger radius, and the check panel has the largest structural radius. Status labels use pill corners with a circular dot; setup numbers use outlined circles. Borders are thin (1px). These shapes distinguish functions without ornamental framing.

## Components

### Buttons

Compact, direct controls use a minimum height (42px), an outlined white secondary style, and a rust primary style. Both have distinct hover and pressed colors. Disabled retry uses reduced opacity (.65) and a waiting cursor. Small command-copy controls use a compact outlined style with a minimum height (30px). Keyboard focus stays visible on every button.

### Inputs / Fields

The environment control is a labeled native select with a minimum height (40px). Its width becomes fluid on mobile. Clipboard failure reveals a labeled, selectable, read-only monospace textarea with a minimum height (160px) and vertical resizing; the same focus outline applies.

### Navigation

Dark green navigation contains inline SVG icons and rounded text links. Hover and selected surfaces differ; the selected item has stronger weight (650). Mobile removes link icons and lets links wrap. These are section anchors, with Connection checks marked active in the current implementation.

### Status Panels and Labels

The white connection panel has a thin border and flat check rows. Each state pairs written text with a colored pill and dot, including pending, good, warning, and error. Summary and copy feedback use polite live announcements. The retry action and timestamp belong to the same panel.

### Command Blocks

Dark green command surfaces contain a muted contextual label, an outlined copy control, and wrapping monospace text. Copied state changes the button label temporarily; clipboard fallback displays selected text. Copy controls use accessible names that identify the relevant command.

## Do's and Don'ts

### Do:

- **Do** preserve the paper ground, green structural surfaces, and rust main action.
- **Do** pair connection colors with clear state text and a recovery action.
- **Do** keep commands selectable, wrapping, and visually distinct from explanation.
- **Do** retain native controls, visible keyboard focus, and reduced-motion behavior.

### Don't:

- **Don't** use color as the only connection-state indicator.
- **Don't** add shadows or hover lift to the existing flat controls and panels.
- **Don't** let long commands force horizontal page overflow.
