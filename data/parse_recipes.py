#!/usr/bin/env python3
"""Parse the three Home Chef RTF files into a single recipes.json."""
import json, re, os

SRC = [
    "/Users/gracemadlinger/Desktop/Recipes thorugh 40.rtf",
    "/Users/gracemadlinger/Desktop/Recipes through 80.rtf",
    "/Users/gracemadlinger/Desktop/recipes through 123.rtf",
]

def strip_rtf(text):
    # \uc0 is a control word (unicode byte count); drop control words generally later.
    # Replace \uNNNN unicode escapes with the actual char.
    text = re.sub(r"\\u(\d+)\b ?", lambda m: chr(int(m.group(1))), text)
    # Replace \'HH hex escapes (cp1252) with the char.
    text = re.sub(r"\\'([0-9a-fA-F]{2})",
                  lambda m: bytes([int(m.group(1), 16)]).decode("cp1252", "ignore"),
                  text)
    return text

def clean_line(line):
    line = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", line)   # control words
    line = line.replace("\\", "").strip()
    # strip warning emoji + variation selectors + stray braces
    for ch in ["⚠", "️", "{", "}"]:
        line = line.replace(ch, "")
    return line.strip()

def parse_file(path):
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        raw = f.read()
    raw = strip_rtf(raw)
    recipes, cur = [], None
    for ln in raw.split("\n"):
        had_warn = ("⚠" in ln)
        ln = clean_line(ln)
        if not ln:
            continue
        m = re.match(r"^#{2,3}\s*(\d+)\.\s*(.+)$", ln)
        if m:
            if cur:
                recipes.append(cur)
            title = re.sub(r"\s*\*?\(variant\)\*?", "", m.group(2), flags=re.I).strip()
            cur = {"id": int(m.group(1)), "title": title,
                   "variant": "variant" in m.group(2).lower(),
                   "subtitle": "", "time": "", "difficulty": "", "spice": "",
                   "allergens": [], "ingredients": [], "specialty": []}
            continue
        if cur is None:
            continue
        if ln.startswith("*") and "|" in ln:
            parts = [p.strip() for p in ln.split("|")]
            cur["subtitle"] = parts[0].strip("* ")
            for p in parts[1:]:
                low = p.lower()
                if "min" in low:
                    nums = re.findall(r"\d+", p)
                    cur["time"] = ("-".join(nums[:2]) + " min") if nums else p
                elif low in ("easy", "intermediate", "expert"):
                    cur["difficulty"] = p
                elif low in ("not spicy", "mild", "medium", "spicy"):
                    cur["spice"] = p
                elif low.startswith("allergen"):
                    a = p.split(":", 1)[1].strip()
                    cur["allergens"] = [x.strip() for x in a.split(",")
                                        if x.strip() and x.strip().lower() != "none"]
            continue
        if ln.startswith("-"):
            body = ln.lstrip("- ").strip()
            parts = re.split(r"\s+[—–-]\s+", body, maxsplit=1)
            name = parts[0].strip()
            qty = parts[1].strip() if len(parts) > 1 else ""
            if name:
                cur["ingredients"].append({"name": name, "qty": qty, "specialty": had_warn})
                if had_warn:
                    cur["specialty"].append(name)
            continue
    if cur:
        recipes.append(cur)
    return recipes

def categorize(r):
    t = (r["title"] + " " + " ".join(i["name"] for i in r["ingredients"])).lower()
    # remove seasoning/broth/stock mentions so "chicken broth" in a beef dish
    # doesn't mis-tag it as chicken.
    for noise in ["chicken broth", "chicken demi", "chicken stock", "chicken flavor",
                  "chicken seasoning", "beef broth", "beef demi", "beef flavor",
                  "beef stock", "rotisserie chicken seasoning", "pho beef broth"]:
        t = t.replace(noise, "")
    if any(w in t for w in ["shrimp","scallop","salmon","fish","mahi","trout","yellowtail"]):
        return "Seafood"
    if "turkey" in t: return "Turkey"
    if any(w in t for w in ["beef","steak","sirloin","burger"]): return "Beef"
    if "chicken" in t: return "Chicken"
    if any(w in t for w in ["pork","sausage","bacon","ham","pepperoni"]): return "Pork"
    return "Other"

all_recipes = []
for p in SRC:
    all_recipes.extend(parse_file(p))
for r in all_recipes:
    r["category"] = categorize(r)

out = os.path.join(os.path.dirname(__file__), "recipes.json")
with open(out, "w") as f:
    json.dump(all_recipes, f, indent=2, ensure_ascii=False)

print(f"Parsed {len(all_recipes)} recipes -> {out}")
cats = {}
for r in all_recipes:
    cats[r["category"]] = cats.get(r["category"], 0) + 1
print("Categories:", cats)
print("Missing ingredients:", [r["id"] for r in all_recipes if not r["ingredients"]])
print("Missing meta:", [r["id"] for r in all_recipes if not r["difficulty"]])
ids = [r["id"] for r in all_recipes]
print("ID range:", min(ids), "-", max(ids), "count", len(ids))
