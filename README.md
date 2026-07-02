# What's for Dinner 🍽️

A two-person meal picker. You and your partner each swipe through your Home Chef
recipes, and the app shows which ones you *both* liked. Lock in 5, and it builds
your grocery list automatically. No more "so what do you want for dinner" texts.

## Stack (all free)
- **Frontend:** plain HTML/CSS/JS — no build step
- **Hosting:** Vercel
- **Backend / live sync:** Supabase (Postgres + realtime)

## One-time setup

### 1. Supabase (the backend)
1. Go to [supabase.com](https://supabase.com) → sign in with GitHub → **New project**
2. Name it `meal-app`, pick a region, let it generate a DB password, wait ~2 min
3. **Settings → API** → copy the **Project URL** and the **anon public** key
4. Paste both into `config.js`
5. **SQL Editor → New query** → paste all of `supabase-schema.sql` → **Run**

### 2. Deploy to Vercel (the link)
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project**
3. Import the repo → **Deploy** (no settings needed — it's static)
4. You get a link like `meal-app.vercel.app`. Both of you bookmark it.

## How it works
- One shared "room" — no codes, no per-week setup
- Each person taps **I'm Grace** / **I'm Partner** once (remembered on their phone)
- **Pick** tab: swipe through recipes, like or skip
- **Matches** tab: recipes you both liked; tap **Lock in** for the week
- **List** tab: grocery list auto-built from locked meals, grouped by aisle,
  ★ = specialty item to plan ahead. Tap items to check them off. "Copy list"
  for pasting into Notes/Messages.
- **Refresh icon** (top right): "New week" — clears likes + locked meals for both

## Files
| File | What it is |
|---|---|
| `index.html` | app shell |
| `app.js` | all the logic |
| `styles.css` | styling |
| `config.js` | **your Supabase keys go here** |
| `recipes.json` | all 123 recipes |
| `supabase-schema.sql` | run once in Supabase |
| `data/parse_recipes.py` | regenerates recipes.json from the RTF files |
| `serve.py` | local test server (`python3 serve.py` → localhost:5173) |

## Demo mode
If `config.js` still has placeholder keys, the app runs in **demo mode**: it
simulates a partner locally so you can try the whole flow on one device. It
switches to real two-phone sync automatically once real keys are in.
