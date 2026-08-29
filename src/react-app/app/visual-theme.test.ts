import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function findReactAppRoot(start: string): string {
	let directory = resolve(start);
	while (true) {
		const candidate = join(directory, "src/react-app");
		if (existsSync(join(candidate, "index.css"))) return candidate;
		const parent = dirname(directory);
		if (parent === directory) throw new Error("Could not locate src/react-app/index.css");
		directory = parent;
	}
}

const reactAppRoot = findReactAppRoot(process.cwd());
const themeCss = readFileSync(join(reactAppRoot, "index.css"), "utf8");

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
