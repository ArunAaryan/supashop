# Clear Ice Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supashop's warm pink/coral interface with the approved Clear Ice palette and ensure all user-facing typography uses a maximum font weight of 500.

**Architecture:** Keep the existing React component structure and centralize the shared palette in Tailwind theme tokens. Add a source-level visual-theme regression test, then make mechanical class and literal replacements across shared controls, shells, and feature screens without changing behavior.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Vitest 4, Testing Library, Vite 7

---

## File Map

- Create `src/react-app/app/visual-theme.test.ts`: enforce the approved shared tokens, the 500 weight ceiling, and removal of the previous warm brand literals.
- Modify `src/react-app/index.css`: define the Clear Ice tokens, cool shadow, and visible focus color.
- Modify `src/react-app/components/button.tsx`: use medium-weight text and Clear Ice button/hover depth colors.
- Modify `src/react-app/components/field.tsx`: reduce field-label weight to medium.
- Modify `src/react-app/app/router.tsx`: reduce placeholder-page kicker and heading weights.
- Modify `src/react-app/app/session-gate.tsx`: reduce loading and restricted-state text weights.
- Modify `src/react-app/app/cms-shell.tsx`: reduce brand, navigation, badge, and role-label weights.
- Modify `src/react-app/app/customer-shell.tsx`: reduce brand, delivery badge, and mobile-navigation weights.
- Modify `src/react-app/features/auth/login-page.tsx`: replace warm gradients and notice surface, then reduce brand, heading, and divider weights.
- Modify `src/react-app/features/store/store-settings-page.tsx`: reduce all heading, status, chip, label, and day weights; replace warm notice and chip surfaces.

### Task 1: Lock and Apply the Shared Clear Ice Theme

**Files:**
- Create: `src/react-app/app/visual-theme.test.ts`
- Modify: `src/react-app/index.css`
- Test: `src/react-app/app/visual-theme.test.ts`

- [ ] **Step 1: Write the failing shared-token test**

Create `src/react-app/app/visual-theme.test.ts` with the first theme contract:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reactAppRoot = fileURLToPath(new URL("..", import.meta.url));
const themeCss = readFileSync(`${reactAppRoot}/index.css`, "utf8");

describe("Clear Ice visual theme", () => {
	it("defines the approved shared palette and focus treatment", () => {
		expect(themeCss).toContain("--color-canvas: #f2f8fb;");
		expect(themeCss).toContain("--color-surface: #ffffff;");
		expect(themeCss).toContain("--color-ink: #25343b;");
		expect(themeCss).toContain("--color-muted: #748289;");
		expect(themeCss).toContain("--color-line: #dfeaec;");
		expect(themeCss).toContain("--color-action: #c7e5f1;");
		expect(themeCss).toContain("--color-focus: #4f8194;");
		expect(themeCss).toContain("--shadow-float: 0 20px 45px rgb(55 89 101 / 10%);");
		expect(themeCss).toContain("outline: 3px solid var(--color-focus);");
	});
});
```

- [ ] **Step 2: Run the token test to verify it fails**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts
```

Expected: FAIL because `index.css` still contains the warm palette and has no `--color-focus` token.

- [ ] **Step 3: Replace the shared theme tokens**

Change the `@theme` block and focus rule in `src/react-app/index.css` to:

```css
@theme {
	--color-canvas: #f2f8fb;
	--color-surface: #ffffff;
	--color-ink: #25343b;
	--color-muted: #748289;
	--color-line: #dfeaec;
	--color-action: #c7e5f1;
	--color-focus: #4f8194;
	--radius-card: 1.25rem;
	--shadow-float: 0 20px 45px rgb(55 89 101 / 10%);
}

:focus-visible {
	outline: 3px solid var(--color-focus);
	outline-offset: 2px;
}
```

Do not change the body font family, global sizing, radius, or form inheritance rules.

- [ ] **Step 4: Run the token test to verify it passes**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts
```

Expected: PASS with one passing test.

- [ ] **Step 5: Commit the shared theme**

```bash
git add src/react-app/index.css src/react-app/app/visual-theme.test.ts
git commit -m "style: add clear ice theme tokens"
```

### Task 2: Enforce the Medium-Weight Ceiling

**Files:**
- Modify: `src/react-app/app/visual-theme.test.ts`
- Modify: `src/react-app/components/button.tsx`
- Modify: `src/react-app/components/field.tsx`
- Modify: `src/react-app/app/router.tsx`
- Modify: `src/react-app/app/session-gate.tsx`
- Modify: `src/react-app/app/cms-shell.tsx`
- Modify: `src/react-app/app/customer-shell.tsx`
- Modify: `src/react-app/features/auth/login-page.tsx`
- Modify: `src/react-app/features/store/store-settings-page.tsx`
- Test: `src/react-app/app/visual-theme.test.ts`

- [ ] **Step 1: Add a failing production-source weight invariant**

Extend the imports and helpers in `visual-theme.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

function productionFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return entry.name === "test" ? [] : productionFiles(path);
		if (entry.name.includes(".test.")) return [];
		return [".css", ".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
	});
}

const productionSource = productionFiles(reactAppRoot)
	.map((path) => readFileSync(path, "utf8"))
	.join("\n");
```

Add this test inside the existing `describe` block:

```ts
	it("caps production typography at medium weight", () => {
		expect(productionSource).not.toMatch(/\bfont-(?:bold|black)\b/);
	});
```

- [ ] **Step 2: Run the weight test to verify it fails**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts -t "caps production typography"
```

Expected: FAIL because production TSX files still contain `font-bold` and `font-black`.

- [ ] **Step 3: Make the exact typography replacements**

Across the production files listed in this task, replace every `font-bold` and `font-black` utility with `font-medium`.

Representative final class fragments must read:

```tsx
// button.tsx
"... px-5 text-sm font-medium transition ..."

// field.tsx and TextArea in store-settings-page.tsx
"grid gap-1.5 text-sm font-medium text-ink"

// headings, brands, navigation items, badges, statuses, chips, and day names
"font-medium"
```

Keep existing `font-normal` declarations on inputs and error details. Do not alter font sizes, tracking, casing, layout, or text.

- [ ] **Step 4: Confirm the weight invariant and existing UI tests pass**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts src/react-app/app/shells.test.tsx src/react-app/features/auth/login-page.test.tsx src/react-app/features/store/store-settings-page.test.tsx
```

Expected: PASS. The visual-theme suite has two passing tests and all existing behavioral tests remain green.

- [ ] **Step 5: Commit the typography refresh**

```bash
git add src/react-app/app/visual-theme.test.ts src/react-app/components/button.tsx src/react-app/components/field.tsx src/react-app/app/router.tsx src/react-app/app/session-gate.tsx src/react-app/app/cms-shell.tsx src/react-app/app/customer-shell.tsx src/react-app/features/auth/login-page.tsx src/react-app/features/store/store-settings-page.tsx
git commit -m "style: soften interface typography"
```

### Task 3: Replace Direct Warm Brand Colors

**Files:**
- Modify: `src/react-app/app/visual-theme.test.ts`
- Modify: `src/react-app/components/button.tsx`
- Modify: `src/react-app/features/auth/login-page.tsx`
- Modify: `src/react-app/features/store/store-settings-page.tsx`
- Test: `src/react-app/app/visual-theme.test.ts`

- [ ] **Step 1: Add a failing old-palette invariant**

Add this test to the existing `describe` block:

```ts
	it("removes the previous warm brand literals from production UI", () => {
		expect(productionSource).not.toMatch(/#(?:f8d9cf|fbfbf8|1b1b1a|74736e|e5e1da|f36c45|d95734|fff7f2|ffece4|f3a488|fff0eb|fff0ea|e8a28f)\b/i);
	});
```

The semantic red foregrounds `#ae3f27` and `#8e301d` are intentionally absent from this banned list.

- [ ] **Step 2: Run the old-palette test to verify it fails**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts -t "removes the previous warm brand literals"
```

Expected: FAIL because button, login, and store-settings classes still contain direct warm literals.

- [ ] **Step 3: Update shared button colors**

Set `variants` in `src/react-app/components/button.tsx` to:

```ts
const variants = {
	primary: "bg-action text-ink shadow-[0_8px_0_#a5d2e2] hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_3px_0_#a5d2e2]",
	secondary: "bg-surface text-ink border border-line hover:bg-[#f7fbfd]",
	quiet: "bg-transparent text-ink underline-offset-4 hover:underline",
} as const;
```

- [ ] **Step 4: Update the login atmosphere and semantic notice**

In `src/react-app/features/auth/login-page.tsx`, use:

```tsx
<main className="grid min-h-screen w-full min-w-0 place-items-center bg-[radial-gradient(circle_at_10%_10%,#ffffff_0,transparent_30%),radial-gradient(circle_at_90%_90%,#d9edf5_0,transparent_35%)] p-4 sm:p-8">
```

Change the login error background from `bg-[#fff0eb]` to `bg-[#fff5f4]`. Keep the red `#ae3f27` foreground because it communicates validation failure rather than brand identity.

- [ ] **Step 5: Update store-settings notices and chips**

Use these final class fragments in `src/react-app/features/store/store-settings-page.tsx`:

```tsx
// Form-level error notice
"rounded-2xl border border-[#e6b8b2] bg-[#fff5f4] px-4 py-3 text-sm font-medium text-[#8e301d]"

// Postal-code chip
errors[`serviceablePostalCodes.${index}`]
	? "bg-[#fff5f4] text-[#8e301d] ring-2 ring-focus"
	: "bg-action/45"
```

Keep other error foregrounds red. Do not change error conditions, messages, ARIA attributes, or chip behavior.

- [ ] **Step 6: Confirm the complete visual-theme contract passes**

Run:

```bash
pnpm test -- src/react-app/app/visual-theme.test.ts
```

Expected: PASS with three passing tests.

- [ ] **Step 7: Commit the direct-color refresh**

```bash
git add src/react-app/app/visual-theme.test.ts src/react-app/components/button.tsx src/react-app/features/auth/login-page.tsx src/react-app/features/store/store-settings-page.tsx
git commit -m "style: replace warm interface accents"
```

### Task 4: Verify Behavior, Build, and Responsive Appearance

**Files:**
- Verify only; no planned source changes

- [ ] **Step 1: Run static checks and the complete React suite**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all commands exit `0`; the React suite includes all three Clear Ice contract tests.

- [ ] **Step 2: Build the production application**

Run:

```bash
pnpm build
```

Expected: TypeScript and Vite complete successfully and emit the production bundle under `dist/`.

- [ ] **Step 3: Start the local application for visual inspection**

Run:

```bash
pnpm dev
```

Expected: Vite reports a local preview URL and the application loads without console errors.

- [ ] **Step 4: Inspect representative states at desktop and mobile widths**

Check the login page, CMS desktop shell, CMS mobile header, customer mobile navigation, configured store-settings form, loading state, and error notice. Confirm:

```text
Canvas is near-white blue (#f2f8fb).
Active controls use pale Clear Ice blue (#c7e5f1) with dark text.
Focus rings use the darker blue accent (#4f8194).
No text appears heavier than medium (500).
Semantic errors remain visibly red and distinct from brand accents.
No control clips or overflows at 320px width.
```

- [ ] **Step 5: Review the final diff for scope**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files staged or modified. Preserve the pre-existing untracked `.pnpm-store/` directory and any other unrelated working-tree changes.

- [ ] **Step 6: Commit only if visual verification required a correction**

If Step 4 revealed a scoped visual defect and it was corrected, stage only the affected React files and commit:

```bash
git add src/react-app/index.css src/react-app/app/visual-theme.test.ts src/react-app/components/button.tsx src/react-app/components/field.tsx src/react-app/app/router.tsx src/react-app/app/session-gate.tsx src/react-app/app/cms-shell.tsx src/react-app/app/customer-shell.tsx src/react-app/features/auth/login-page.tsx src/react-app/features/store/store-settings-page.tsx
git commit -m "fix: refine clear ice visual treatment"
```

If no correction was necessary, do not create an empty commit.
