# Clear Ice Visual Refresh Design

**Date:** 2026-08-29  
**Status:** Approved  
**Target:** Existing Supashop React interface

## 1. Outcome

Replace the current warm pink and coral visual treatment with a subtle, cool light-blue system. Reduce typographic heaviness across every user-facing React screen without changing layout, content, navigation, validation, or application behavior.

The approved direction combines the **Clear Ice** palette with a strict **medium-weight ceiling**. No interface text may use font weights above `500`.

## 2. Visual System

The shared Tailwind theme tokens will use:

| Token | Value | Purpose |
|---|---|---|
| `canvas` | `#f2f8fb` | Cool, nearly white application background |
| `surface` | `#ffffff` | Cards, fields, bars, and raised surfaces |
| `ink` | `#25343b` | Primary text and dark navigation surfaces |
| `muted` | `#748289` | Supporting text and quiet metadata |
| `line` | `#dfeaec` | Borders and separators |
| `action` | `#c7e5f1` | Primary buttons, selected navigation, chips, and checkboxes |
| action shadow | `#a5d2e2` | Pressed-button depth treatment |
| focus/accent text | `#4f8194` | Accessible focus rings and text placed directly on pale blue |

The existing card radius remains unchanged. Warm shadows become low-saturation blue-charcoal shadows so raised surfaces feel soft rather than pink.

Login-page decorative gradients use pale blue values derived from `canvas` and `action`. Direct warm background values used for chips and notices are replaced with cool blue equivalents. Destructive and validation messages remain red because their semantic meaning is distinct from the brand palette; their backgrounds will be neutral, low-saturation red rather than coral.

## 3. Typography

No `font-bold` or `font-black` utility remains in the user-facing React interface.

- Brand marks, page titles, section headings, primary actions, active navigation, labels, and compact status text use `font-medium` (`500`).
- Body copy, descriptions, field values, placeholders, and error details use the normal weight (`400`).
- Hierarchy comes from size, spacing, color, letter spacing, and placement rather than heavier weight.
- The current font family and type scale remain unchanged. This refresh does not introduce a font dependency or alter text content.

## 4. Scope

The refresh applies consistently to:

- shared buttons and form fields;
- login and account-creation states;
- CMS desktop and mobile shells;
- customer desktop and mobile shells;
- store settings headers, cards, fields, chips, hours, notices, and save bar;
- loading and failure states rendered by those components.

No Worker, database, API contract, routing, authentication, or state-management behavior changes. Existing responsive breakpoints, component dimensions, hover movement, disabled states, and button press motion remain intact.

## 5. Accessibility and Interaction

- Pale blue controls always use dark `ink` text.
- Dark navigation surfaces retain white text except for active pale-blue items, which use `ink`.
- Focus outlines use the darker `#4f8194` accent rather than the pale action color, preserving visibility on white and blue surfaces.
- Error messages retain a red foreground and visible low-saturation red background or border.
- The implementation must not communicate state through color alone; existing text, borders, and control structure remain in place.

## 6. Implementation Boundaries

Prefer centralized theme tokens for shared colors. Replace direct warm color literals only where they represent the old brand treatment. Keep semantic error colors local and explicitly named by use where no shared token exists.

Typography changes are mechanical and limited to weight utilities. Component structure is not refactored as part of this visual refresh.

## 7. Verification

Verification will include:

- a repository search confirming no `font-bold` or `font-black` utilities remain under `src/react-app`;
- a repository search confirming the previous pink and coral brand literals are removed from `src/react-app`;
- the existing React test suite;
- TypeScript type-checking;
- a production build;
- visual inspection of representative login, CMS shell, mobile navigation, store-settings form, and error states at desktop and mobile widths.
