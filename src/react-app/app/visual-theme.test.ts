import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
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
		expect(themeCss).toContain(":focus-visible {\n\toutline: 3px solid var(--color-focus);\n\toutline-offset: 2px;\n}");
	});

	it("caps production typography at medium weight", () => {
		expect(productionSource).not.toMatch(/\bfont-(?:bold|black)\b/);
	});

	it("removes the previous warm brand literals from production UI", () => {
		expect(productionSource).not.toMatch(/#(?:f8d9cf|fbfbf8|1b1b1a|74736e|e5e1da|f36c45|d95734|fff7f2|ffece4|f3a488|fff0eb|fff0ea|e8a28f)(?:\b|_)/i);
	});
});
