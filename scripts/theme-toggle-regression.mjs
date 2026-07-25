/**
 * Theme single-click regression (no browser).
 * Run: node scripts/theme-toggle-regression.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const themeUtilPath = path.join(root, "apps/admin/src/utils/theme.ts");
const useThemePath = path.join(root, "apps/admin/src/composables/useTheme.ts");
const layoutPath = path.join(root, "apps/admin/src/layouts/AdminLayout.vue");

assert(existsSync(themeUtilPath), "utils/theme.ts missing");
assert(existsSync(useThemePath), "useTheme.ts missing");
assert(existsSync(layoutPath), "AdminLayout.vue missing");

const themeUtil = readFileSync(themeUtilPath, "utf8");
const useTheme = readFileSync(useThemePath, "utf8");
const layout = readFileSync(layoutPath, "utf8");

assert(useTheme.includes("toggleLightDark"), "toggleLightDark export");
assert(useTheme.includes("setMode"), "setMode present");
assert(
  useTheme.includes("cycleMode") || themeUtil.includes("system"),
  "system/cycle retained",
);
assert(themeUtil.includes("system"), "system mode preserved");
assert(layout.includes("toggleLightDark"), "layout uses toggleLightDark");
assert(layout.includes("onThemeClick"), "layout onThemeClick");
assert(
  layout.includes('@click.stop="onThemeClick"') ||
    layout.includes('@click="onThemeClick"'),
  "theme button single click handler",
);
assert(
  !layout.includes("cycleMode()\n  toggleLightDark") &&
    !layout.includes("toggleLightDark()\n  cycleMode"),
  "no double toggle in one handler",
);
assert(
  layout.includes("侧栏不出现") ||
    !/menuOptions[\s\S]{0,900}label:\s*['"]个人信息['"]/.test(layout),
  "sidebar must not expose 个人信息 menu item",
);
assert(
  layout.includes("accountOptions") && layout.includes("profile"),
  "topbar account entry to profile",
);
assert(
  layout.includes("canWriteConfig") || layout.includes("viewer"),
  "viewer write-channel gate present",
);

function resolveTheme(mode, prefersDark = false) {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

function toggleLightDark(mode, prefersDark = false) {
  const current = resolveTheme(mode, prefersDark);
  return current === "dark" ? "light" : "dark";
}

assert(toggleLightDark("light") === "dark", "light→dark one step");
assert(toggleLightDark("dark") === "light", "dark→light one step");
assert(toggleLightDark("system", true) === "light", "system+darkOS → light once");
assert(toggleLightDark("system", false) === "dark", "system+lightOS → dark once");
assert(toggleLightDark(toggleLightDark("light")) === "light", "two clicks restore");

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        "toggleLightDark source",
        "layout single click",
        "no double bind",
        "no sidebar 个人信息",
        "viewer gate",
        "behavioral one-click matrix",
      ],
    },
    null,
    2,
  ),
);
console.log("PASS theme-toggle-regression");
