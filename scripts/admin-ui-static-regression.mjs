/**
 * Minimal static regression for Admin UI: theme / Profile / route animation / KPI / Message.
 * Does not start a browser — verifies source contracts remain intact after refactors.
 *
 * Run: pnpm test:admin-ui-static
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminSrc = path.join(root, "apps", "admin", "src");

function read(rel) {
  const p = path.join(adminSrc, rel);
  if (!existsSync(p)) throw new Error(`missing file: ${rel}`);
  return readFileSync(p, "utf8");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const checks = [];
function pass(name) {
  checks.push(name);
  console.log(`  ✓ ${name}`);
}

// —— API client paths match backend ——
const adminApi = read("api/admin.ts");
assert(adminApi.includes("api.get('/me')") || adminApi.includes('api.get("/me")'), "fetchMe /me");
assert(
  adminApi.includes("api.put('/me'") || adminApi.includes('api.put("/me"'),
  "updateMe /me",
);
assert(
  adminApi.includes("/me/password") &&
    (adminApi.includes("api.put('/me/password'") ||
      adminApi.includes('api.put("/me/password"') ||
      adminApi.includes("api.put(`/me/password`")),
  "changeMyPassword /me/password",
);
assert(
  adminApi.includes("/admin-users") &&
    (adminApi.includes("api.get('/admin-users'") ||
      adminApi.includes('api.get("/admin-users"')),
  "listAdminUsers",
);
assert(
  !adminApi.includes("/profile") || adminApi.includes("admin-users"),
  "no stale /profile-only API",
);
pass("api/admin.ts paths: /me /me/password /admin-users");

// —— ProfileView ——
const profile = read("views/ProfileView.vue");
assert(profile.includes("fetchMe") && profile.includes("changeMyPassword"), "Profile imports");
assert(profile.includes("listAdminUsers") || profile.includes("createAdminUser"), "admin users UI");
assert(
  profile.includes("useMessage") &&
    (profile.includes("message.success") || profile.includes("message.error")),
  "Profile NMessage",
);
assert(
  profile.includes("current_password") ||
    profile.includes("old_password") ||
    profile.includes("new_password"),
  "password fields",
);
pass("ProfileView: me + password + message");

// —— Theme ——
const theme = read("composables/useTheme.ts");
assert(theme.includes("dark") || theme.includes("light") || theme.includes("theme"), "useTheme");
assert(existsSync(path.join(adminSrc, "utils/theme.ts")), "utils/theme.ts");
assert(existsSync(path.join(adminSrc, "styles/theme.css")), "styles/theme.css");
pass("theme composable + styles present");

// —— Route animation ——
const layout = read("layouts/AdminLayout.vue");
assert(
  layout.includes("page-fade") &&
    (layout.includes("<transition") || layout.includes("<Transition")),
  "route transition page-fade",
);
assert(
  layout.includes("<router-view") || layout.includes("<RouterView"),
  "router-view in layout",
);
assert(layout.includes("useTheme") || layout.includes("cycleMode"), "layout theme control");
pass("AdminLayout route animation / router-view / theme");

// —— KPI ——
const dash = read("views/DashboardView.vue");
const kpi = read("components/KpiCard.vue");
assert(dash.includes("KpiCard"), "Dashboard uses KpiCard");
const kpiCount = (dash.match(/<KpiCard/g) || []).length;
assert(kpiCount >= 4, `expected ≥4 KpiCard, got ${kpiCount}`);
assert(kpi.includes("title") || kpi.includes("value") || kpi.includes("props"), "KpiCard props");
pass(`Dashboard four KPI cards (${kpiCount})`);

// —— Message usage across key views ——
const views = [
  "views/LoginView.vue",
  "views/OrdersView.vue",
  "views/OrderDetailView.vue",
  "views/SettingsView.vue",
];
for (const v of views) {
  if (!existsSync(path.join(adminSrc, v))) continue;
  const t = read(v);
  assert(
    t.includes("useMessage") || t.includes("message."),
    `${v} should use NMessage`,
  );
}
pass("key views use NMessage");

// —— Router has /profile ——
const router = read("router/index.ts");
assert(
  router.includes("profile") || router.includes("ProfileView"),
  "router profile route",
);
pass("router Profile route");

console.log(
  JSON.stringify({ ok: true, checks: checks.length, names: checks }, null, 2),
);
console.log("PASS admin-ui-static-regression");
