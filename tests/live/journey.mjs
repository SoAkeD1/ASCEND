// Live smoke test: node tests/live/journey.mjs https://your-site.vercel.app admin@email
// Signs in as admin (sandbox code), creates a demo user through the real engines, walks the whole
// journey over HTTP, checks the lender dashboard and the family view, then deletes the demo user.
const BASE = process.argv[2];
const ADMIN = process.argv[3];
if (!BASE || !ADMIN) throw new Error("usage: node journey.mjs <base-url> <admin-email>");

let cookies = {};
const jar = () => Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
async function call(path, body, method = "POST") {
  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    redirect: "manual",
    headers: { "Content-Type": "application/json", Cookie: jar() },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    const k = kv.slice(0, i), v = kv.slice(i + 1);
    if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === "") delete cookies[k];
    else cookies[k] = v;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
async function page(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { Cookie: jar() } });
  // Visible text only: drop scripts, tags and React's <!-- --> markers, and decode the common entities.
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { status: res.status, text, location: res.headers.get("location") };
}
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

// admin sign-in
const req = await call("auth/request", { identifier: ADMIN });
const v = await call("auth/verify", { identifier: ADMIN, code: req.sandboxCode });
check("admin sign-in lands on /admin", v.next === "/admin");

// demo user through the real engines
const made = await call("admin/demo/user", { fullName: "Live Test", dob: "2004-01-01", monthlyInflows: [9000, 9000, 9000, 9000], bounce: false, overdueAmount: null });
check("demo user approved by the real engines", made.decision === "approved");
const uid = made.userId;

const adminCookie = cookies.ascend_session;
await call("admin/demo/impersonate", { userId: uid });
const kfs = await call("onboarding/limit", { amount: 2200 });
check("KFS generated with chosen limit", kfs.limit?.chosen === 2200 && kfs.fees?.late === 0);
await call("onboarding/kfs/accept", { version: kfs.version });
await call("onboarding/activate", { autopayOn: true, dueDay: 7 });
const big = await call("line/spend", { merchant: "Live Bookshop", category: "Books", amount: 1500, confirmed: false });
check("big spend asks for confirmation", big.needsConfirm === true);
const spent = await call("line/spend", { merchant: "Live Canteen", category: "Food", amount: 700, confirmed: true });
check("spend accepted", spent.needsConfirm === false && !!spent.ref);
const home = await page("/home");
check("home renders the student's own data", home.status === 200 && home.text.includes("Hi Live") && home.text.includes("₹1,500"));

const link = await call("family", { showAttentionFlag: false });
const fam = await page(`/family/${link.token}`);
check("family view shows first name, no amounts", fam.status === 200 && fam.text.includes("Live") && !/₹\s?[0-9]/.test(fam.text.replace(/₹0/g, "")));
const famId = link.id;
await call(`family/${famId}`, undefined, "DELETE");
const famAfter = await page(`/family/${link.token}`);
check("revoked family link stops working", famAfter.text.includes("isn&#x27;t active") || famAfter.text.includes("isn't active"));

// back to admin: time travel to the due date, AutoPay should pay on time
cookies.ascend_session = adminCookie;
delete cookies.ascend_admin_return;
const t = await call("admin/demo/time", { userId: uid, dueDate: true });
check("time travel replays days", t.daysProcessed > 30, `(${t.daysProcessed} days)`);
const lender = await page("/lender");
check("lender dashboard renders live numbers", lender.status === 200 && lender.text.includes("Late-fee revenue") && lender.text.includes("Credit-Ready Rate"));

// forced failure walks the slip ladder
await call("admin/demo/impersonate", { userId: uid });
await call("line/spend", { merchant: "Live Canteen 2", category: "Food", amount: 600, confirmed: true });
cookies.ascend_session = adminCookie;
delete cookies.ascend_admin_return;
await call("admin/demo/autopay-fail", { userId: uid, on: true });
await call("admin/demo/time", { userId: uid, dpd: 31 });
await call("admin/demo/impersonate", { userId: uid });
const slip = await page("/slip");
check("slip page shows frozen + hardship plan", slip.status === 200 && slip.text.includes("Your line is frozen") && slip.text.includes("Ascend earns"));
const plan = await call("line/hardship", { months: 3 });
check("hardship plan created, Ascend revenue 0", plan.ascendRevenue === 0 && plan.months === 3);

// clean up demo data
cookies.ascend_session = adminCookie;
delete cookies.ascend_admin_return;
const reset = await call("admin/demo/reset", {});
check("demo data reset", reset.deleted >= 1, `(${reset.deleted} deleted)`);

console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
