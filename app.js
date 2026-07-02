/* ───────────────────────────────────────────────────────────
   What's for Dinner — shared-room meal picker
   Works in two modes:
   • LIVE  — real Supabase, two phones sync in real time
   • DEMO  — no keys yet; simulates a partner locally so you
             can try the whole flow. Auto-switches to LIVE once
             config.js has real values.
─────────────────────────────────────────────────────────── */

const CFG = {
  url: window.SUPABASE_URL,
  anon: window.SUPABASE_ANON,
  people: window.PEOPLE || ["Grace", "Partner"],
  target: window.TARGET_MATCHES || 5,
  budget: window.LIKE_BUDGET || 10,
};
const LIVE = CFG.url && !CFG.url.includes("PASTE_") &&
             CFG.anon && !CFG.anon.includes("PASTE_");

let sb = null;
if (LIVE) sb = supabase.createClient(CFG.url, CFG.anon);

// ── State ──
let RECIPES = [];
let picks = [];          // [{voter, recipe_id}]
let locked = [];         // [recipe_id]
let me = localStorage.getItem("mealapp_me") || null;
let deckIndex = 0;
let tab = "swipe";
const skippedKey = () => `mealapp_skipped_${me}`;
const boughtKey = () => `mealapp_bought`;

// ── Boot ──
(async function init() {
  RECIPES = await fetch("recipes.json").then(r => r.json());
  // Cooking steps live in a separate file so the recipe parser can regenerate
  // recipes.json without wiping them. Attach by id.
  try {
    const steps = await fetch("instructions.json").then(r => r.json());
    RECIPES.forEach(r => { r.instructions = steps[r.id] || steps[String(r.id)] || []; });
  } catch (e) { RECIPES.forEach(r => { r.instructions = []; }); }
  if (!me) { renderChooser(); return; }
  await loadState();
  if (LIVE) subscribe();
  else demoSeed();
  render();
})();

// ── Data layer ──────────────────────────────────────────────
async function loadState() {
  if (LIVE) {
    const [{ data: p }, { data: l }] = await Promise.all([
      sb.from("picks").select("voter,recipe_id"),
      sb.from("locked_meals").select("recipe_id"),
    ]);
    picks = p || [];
    locked = (l || []).map(x => x.recipe_id);
  } else {
    picks = JSON.parse(localStorage.getItem("mealapp_demo_picks") || "[]");
    locked = JSON.parse(localStorage.getItem("mealapp_demo_locked") || "[]");
  }
}
function demoSave() {
  localStorage.setItem("mealapp_demo_picks", JSON.stringify(picks));
  localStorage.setItem("mealapp_demo_locked", JSON.stringify(locked));
}
// In demo mode, give the "partner" a handful of random likes so
// matches can actually happen and you can see the payoff.
function demoSeed() {
  const partner = CFG.people.find(n => n !== me) || "Partner";
  if (!picks.some(p => p.voter === partner)) {
    const shuffled = [...RECIPES].sort(() => Math.random() - 0.5).slice(0, 14);
    shuffled.forEach(r => picks.push({ voter: partner, recipe_id: r.id }));
    demoSave();
  }
}

async function like(recipeId) {
  if (picks.some(p => p.voter === me && p.recipe_id === recipeId)) return;
  picks.push({ voter: me, recipe_id: recipeId });
  if (LIVE) await sb.from("picks").insert({ voter: me, recipe_id: recipeId });
  else demoSave();
}
async function lockMeal(recipeId) {
  if (locked.includes(recipeId)) return;
  locked.push(recipeId);
  if (LIVE) await sb.from("locked_meals").insert({ recipe_id: recipeId });
  else demoSave();
  toast("Locked in ✓");
  render();
}
async function unlockMeal(recipeId) {
  locked = locked.filter(id => id !== recipeId);
  if (LIVE) await sb.from("locked_meals").delete().eq("recipe_id", recipeId);
  else demoSave();
  render();
}
async function newWeek() {
  if (!confirm("Start a fresh week? This clears all likes and locked meals for both of you.")) return;
  picks = []; locked = [];
  localStorage.removeItem(skippedKey());
  localStorage.removeItem(boughtKey());
  if (LIVE) {
    await sb.from("picks").delete().neq("recipe_id", -1);
    await sb.from("locked_meals").delete().neq("recipe_id", -1);
  } else { demoSave(); demoSeed(); }
  deckIndex = 0; tab = "swipe";
  render();
}

function subscribe() {
  sb.channel("room")
    .on("postgres_changes", { event: "*", schema: "public", table: "picks" },
        async () => { await loadState(); render(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "locked_meals" },
        async () => { await loadState(); render(); })
    .subscribe();
}

// ── Derived ─────────────────────────────────────────────────
function matchesList() {
  const partner = CFG.people.find(n => n !== me) || "Partner";
  const mine = new Set(picks.filter(p => p.voter === me).map(p => p.recipe_id));
  const theirs = new Set(picks.filter(p => p.voter === partner).map(p => p.recipe_id));
  return RECIPES.filter(r => mine.has(r.id) && theirs.has(r.id));
}
function myLikeCount() { return picks.filter(p => p.voter === me).length; }
function likesLeft() { return Math.max(0, CFG.budget - myLikeCount()); }
function partnerLikeCount() {
  const partner = CFG.people.find(n => n !== me) || "Partner";
  return picks.filter(p => p.voter === partner).length;
}
function remainingDeck() {
  const skipped = new Set(JSON.parse(localStorage.getItem(skippedKey()) || "[]"));
  const mine = new Set(picks.filter(p => p.voter === me).map(p => p.recipe_id));
  return RECIPES.filter(r => !skipped.has(r.id) && !mine.has(r.id));
}

// ── Render ──────────────────────────────────────────────────
const $app = document.getElementById("app");

function renderChooser() {
  $app.innerHTML = `
    <div class="screen">
      <h2>What's for dinner?</h2>
      <p>Pick meals you both love, skip the "so what do you want to eat" text. Who's this?</p>
      ${CFG.people.map(n => `<button class="bigbtn" data-name="${n}">I'm ${n}</button>`).join("")}
    </div>`;
  $app.querySelectorAll("[data-name]").forEach(b =>
    b.onclick = async () => {
      me = b.dataset.name;
      localStorage.setItem("mealapp_me", me);
      await loadState();
      if (LIVE) subscribe(); else demoSeed();
      render();
    });
}

function render() {
  if (!me) return renderChooser();
  const matches = matchesList();
  $app.innerHTML = `
    <div class="topbar">
      <div>
        <h1>What's for Dinner</h1>
        <div class="who">You're ${me}${LIVE ? "" : " · demo mode"}</div>
      </div>
      <button class="iconbtn" id="menuBtn" aria-label="Menu"><i class="ti ti-refresh"></i></button>
    </div>
    ${LIVE ? "" : `<div class="banner">Demo mode — add your Supabase keys to sync with a real partner</div>`}
    <div class="progress">
      <div class="pill"><b>${likesLeft()}</b>likes left</div>
      <div class="pill"><b>${partnerLikeCount()}</b>they liked</div>
      <div class="pill match"><b>${matches.length}</b>matches</div>
    </div>
    <div id="body"></div>
    <div class="tabbar">
      <button data-tab="swipe" class="${tab==="swipe"?"active":""}"><i class="ti ti-cards"></i>Pick</button>
      <button data-tab="matches" class="${tab==="matches"?"active":""}"><i class="ti ti-heart"></i>Matches${matches.length?` (${matches.length})`:""}</button>
      <button data-tab="grocery" class="${tab==="grocery"?"active":""}"><i class="ti ti-shopping-cart"></i>List${locked.length?` (${locked.length})`:""}</button>
    </div>`;
  $app.querySelector("#menuBtn").onclick = newWeek;
  $app.querySelectorAll("[data-tab]").forEach(b =>
    b.onclick = () => { tab = b.dataset.tab; render(); });

  if (tab === "swipe") renderDeck();
  else if (tab === "matches") renderMatches();
  else renderGrocery();
}

// Full recipe card markup, shared by the swipe deck and the detail view.
function recipeCardHTML(r) {
  return `
    <div class="card">
      <div class="head">
        <span class="cat">${r.category}</span>
        <h2>${r.title}</h2>
        <p class="sub">${r.subtitle || ""}</p>
      </div>
      <div class="meta">
        <span class="tag"><i class="ti ti-clock"></i> ${r.time}</span>
        <span class="tag">${r.difficulty}</span>
        ${r.spice && r.spice!=="Not Spicy" ? `<span class="tag spicy"><i class="ti ti-flame"></i> ${r.spice}</span>` : ""}
        ${r.allergens.length ? `<span class="tag">${r.allergens.join(", ")}</span>` : ""}
      </div>
      <div class="ings">
        <h3>Ingredients</h3>
        <ul>${r.ingredients.map(i => `
          <li><span>${i.specialty?'<span class="star">★</span> ':""}${i.name}</span>
              <span class="q">${i.qty}</span></li>`).join("")}</ul>
      </div>
    </div>`;
}

// Slide-up detail view for any recipe (from Matches or the grocery list).
function openRecipe(id) {
  const r = RECIPES.find(x => x.id === id);
  if (!r) return;
  const isLocked = locked.includes(r.id);
  const el = document.createElement("div");
  el.className = "detail";
  el.innerHTML = `
    <div class="detail-top">
      <button id="detailClose" aria-label="Close"><i class="ti ti-arrow-left"></i></button>
      <strong>Recipe</strong>
    </div>
    <div class="detail-body">
      ${recipeCardHTML(r)}
      ${r.instructions && r.instructions.length ? `
      <div class="steps">
        <h3>Instructions</h3>
        <ol>${r.instructions.map(s => `<li>${s}</li>`).join("")}</ol>
      </div>` : ""}
      <button class="bigbtn ${isLocked?'alt':''}" style="margin-top:16px" id="detailLock">
        ${isLocked ? "Remove from this week" : "Lock in for the week"}
      </button>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector("#detailClose").onclick = close;
  el.querySelector("#detailLock").onclick = () => {
    isLocked ? unlockMeal(r.id) : lockMeal(r.id);
    close();
  };
}

function renderDeck() {
  const body = document.getElementById("body");
  // Out of likes → picking phase is over for you.
  if (likesLeft() === 0) {
    const waiting = partnerLikeCount() < CFG.budget;
    body.innerHTML = `<div class="empty">
      <i class="ti ti-circle-check" style="font-size:44px;color:var(--match)"></i>
      <p style="font-size:16px;color:var(--ink);margin:14px 0 6px">That's your ${CFG.budget} picks!</p>
      <p>${waiting
        ? `${CFG.people.find(n=>n!==me)||"Your partner"} is still choosing. Your matches update live as they like recipes.`
        : `You're both done — go lock in your meals.`}</p>
      <button class="bigbtn" style="max-width:260px;margin-top:18px" id="toMatches">See your matches</button>
    </div>`;
    document.getElementById("toMatches").onclick = () => { tab = "matches"; render(); };
    return;
  }
  const deck = remainingDeck();
  if (deck.length === 0) {
    body.innerHTML = `<div class="empty"><i class="ti ti-check" style="font-size:40px;color:var(--match)"></i>
      <p>You've been through every recipe!<br>Check your matches tab.</p></div>`;
    return;
  }
  const r = deck[0];
  body.innerHTML = `
    <div class="deck">${recipeCardHTML(r)}</div>
    <div class="actions">
      <button class="act skip" id="skipBtn"><i class="ti ti-x"></i> Skip</button>
      <button class="act like" id="likeBtn"><i class="ti ti-heart"></i> Like</button>
    </div>`;
  document.getElementById("skipBtn").onclick = () => {
    const s = JSON.parse(localStorage.getItem(skippedKey()) || "[]");
    s.push(r.id); localStorage.setItem(skippedKey(), JSON.stringify(s));
    render();
  };
  document.getElementById("likeBtn").onclick = async () => {
    await like(r.id);
    const m = matchesList();
    if (m.some(x => x.id === r.id)) toast(`It's a match! ❤️`);
    else if (likesLeft() === 0) toast(`That's your ${CFG.budget} — here are your matches`);
    render();
  };
}

function renderMatches() {
  const body = document.getElementById("body");
  const matches = matchesList();
  const remaining = Math.max(0, CFG.target - locked.length);
  if (matches.length === 0) {
    body.innerHTML = `<div class="empty"><i class="ti ti-heart" style="font-size:40px;color:var(--skip)"></i>
      <p>No matches yet.<br>Keep liking — a match happens when you<br>both like the same recipe.</p></div>`;
    return;
  }
  body.innerHTML = `<div class="sheet">
    <p style="color:var(--muted);font-size:14px;margin:0 0 14px">
      You both liked these. Lock in ${CFG.target} for the week
      ${remaining>0?`(<b>${remaining}</b> to go)`:"— you're set!"}.
    </p>
    ${matches.map(r => {
      const isLocked = locked.includes(r.id);
      return `<div class="matchcard${isLocked?"":" pending"}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div data-open="${r.id}" style="flex:1;cursor:pointer">
            <h4>${r.title} <i class="ti ti-chevron-right" style="font-size:14px;color:var(--muted);vertical-align:-1px"></i></h4>
            <div class="sub">${r.category} · ${r.time} · tap to view recipe</div>
          </div>
          <button class="bigbtn ${isLocked?'ghost':'alt'}" style="width:auto;margin:0;padding:10px 16px;font-size:14px"
            data-lock="${r.id}">${isLocked?"Locked ✓":"Lock in"}</button>
        </div></div>`;
    }).join("")}
  </div>`;
  body.querySelectorAll("[data-lock]").forEach(b =>
    b.onclick = () => {
      const id = +b.dataset.lock;
      locked.includes(id) ? unlockMeal(id) : lockMeal(id);
    });
  body.querySelectorAll("[data-open]").forEach(el =>
    el.onclick = () => openRecipe(+el.dataset.open));
}

// aisle grouping for the grocery list
const AISLES = [
  ["Produce", ["onion","garlic","tomato","lettuce","spinach","broccoli","potato","carrot","pepper","zucchini","lemon","lime","cilantro","parsley","arugula","cabbage","slaw","mushroom","asparagus","kale","corn","cucumber","jalapeno","poblano","shallot","green onion","celery","chive","basil","thyme","rosemary","sage","ginger","apple","pear","mango","pineapple","edamame","snap pea","snow pea","bean","brussels","broccolini","romaine","grape","fig","dill","scallion"]],
  ["Meat & Seafood", ["chicken","beef","steak","sirloin","pork","sausage","bacon","ham","shrimp","salmon","fish","mahi","trout","yellowtail","scallop","turkey","pepperoni","ground"]],
  ["Dairy & Cheese", ["cheese","milk","butter","cream","sour cream","feta","mozzarella","parmesan","cheddar","swiss","gouda","brie","creme","tzatziki","ranch"]],
  ["Bakery & Bread", ["bun","roll","bread","tortilla","flatbread","pita","hoagie","brioche","panko","breadcrumb","couscous","pasta","spaghetti","linguine","penne","orzo","fettuccine","campanelle","rice","cornmeal","pastry","cracker","tempura"]],
  ["Pantry & Sauces", ["sauce","seasoning","oil","vinegar","mayonnaise","mustard","honey","sugar","jam","pesto","glaze","broth","concentrate","salt","pepper","paprika","rub","spice","wine","sriracha","hoisin","teriyaki","gochujang","sesame","soy","salsa","guacamole","hummus","chickpea","caper","nuts","almond","walnut","pecan","pine nut","peanut","flour","adobo","chipotle","bbq","buffalo","tonkatsu","marinara","pizza","tartar","remoulade","balsamic","dijon","za'atar","herbes","old bay","jerk","cajun","blackening"]],
];
function aisleFor(name) {
  const n = name.toLowerCase();
  for (const [aisle, kws] of AISLES) if (kws.some(k => n.includes(k))) return aisle;
  return "Other";
}

function renderGrocery() {
  const body = document.getElementById("body");
  if (locked.length === 0) {
    body.innerHTML = `<div class="empty"><i class="ti ti-shopping-cart" style="font-size:40px;color:var(--skip)"></i>
      <p>No meals locked in yet.<br>Go to Matches and lock in your picks —<br>the shopping list builds itself.</p></div>`;
    return;
  }
  const lockedRecipes = RECIPES.filter(r => locked.includes(r.id));
  // merge ingredients by name
  const merged = {};
  lockedRecipes.forEach(r => r.ingredients.forEach(i => {
    const key = i.name;
    if (!merged[key]) merged[key] = { name: i.name, qtys: [], specialty: i.specialty };
    if (i.qty) merged[key].qtys.push(i.qty);
    if (i.specialty) merged[key].specialty = true;
  }));
  // group by aisle
  const groups = {};
  Object.values(merged).forEach(item => {
    const a = aisleFor(item.name);
    (groups[a] = groups[a] || []).push(item);
  });
  const order = ["Produce","Meat & Seafood","Dairy & Cheese","Bakery & Bread","Pantry & Sauces","Other"];
  const bought = new Set(JSON.parse(localStorage.getItem(boughtKey()) || "[]"));

  body.innerHTML = `<div class="sheet">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <p style="color:var(--muted);font-size:14px;margin:0">${lockedRecipes.length} meals · ${Object.keys(merged).length} items</p>
      <button class="bigbtn alt" style="width:auto;margin:0;padding:9px 14px;font-size:13px" id="copyBtn"><i class="ti ti-copy"></i> Copy list</button>
    </div>
    <p style="font-size:12px;color:var(--muted);margin:0 0 16px"><span class="star" style="color:var(--accent)">★</span> = specialty item, plan ahead</p>
    ${order.filter(a => groups[a]).map(a => `
      <div class="grocery-group">
        <h3>${a}</h3>
        ${groups[a].map(item => {
          const done = bought.has(item.name);
          const q = [...new Set(item.qtys)].join(" + ");
          return `<div class="grocery-item${done?" done":""}" data-item="${encodeURIComponent(item.name)}">
            <span class="chk"></span>
            <span>${item.specialty?'<span class="star">★</span> ':""}${item.name}</span>
            <span class="q">${q}</span></div>`;
        }).join("")}
      </div>`).join("")}
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--line)">
      <p style="font-size:12px;color:var(--muted);text-align:center;margin:0 0 10px">This week's meals · tap to view recipe</p>
      ${lockedRecipes.map(r => `
        <div class="mealrow" data-open="${r.id}">
          <span>${r.title}</span>
          <i class="ti ti-chevron-right" style="color:var(--muted)"></i>
        </div>`).join("")}
    </div>
  </div>`;
  body.querySelectorAll("[data-open]").forEach(el =>
    el.onclick = () => openRecipe(+el.dataset.open));

  body.querySelectorAll("[data-item]").forEach(el =>
    el.onclick = () => {
      const name = decodeURIComponent(el.dataset.item);
      const b = new Set(JSON.parse(localStorage.getItem(boughtKey()) || "[]"));
      b.has(name) ? b.delete(name) : b.add(name);
      localStorage.setItem(boughtKey(), JSON.stringify([...b]));
      render();
    });
  document.getElementById("copyBtn").onclick = () => {
    const lines = ["🛒 Grocery list", ""];
    order.filter(a => groups[a]).forEach(a => {
      lines.push(a.toUpperCase());
      groups[a].forEach(i => lines.push(`  • ${i.name}${i.qtys.length?` — ${[...new Set(i.qtys)].join(" + ")}`:""}${i.specialty?" ★":""}`));
      lines.push("");
    });
    lines.push("MEALS: " + lockedRecipes.map(r => r.title).join(", "));
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast("List copied ✓"));
  };
}

// ── Toast ──
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}
