#!/usr/bin/env python3
"""
Tattoo House: supabase/seed.sql із lib/seed-data.js (один джерельний файл даних).

    python3 tools/make_seed.py

seed.sql вставляє стартові дані з `on conflict do nothing`: повторний запуск
не перезапише те, що адмін уже змінив в адмінці.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "lib", "seed-data.js")
OUT = os.path.join(ROOT, "supabase", "seed.sql")


def load_seed():
    text = open(SRC, encoding="utf-8").read()
    m = re.search(r"window\.TH_SEED\s*=\s*(\{.*\})\s*;\s*$", text, re.S)
    if not m:
        raise SystemExit("lib/seed-data.js: не знайдено window.TH_SEED = {...};")
    return json.loads(m.group(1))


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, list):
        return "array[" + ", ".join(lit(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, dict):
        return lit(json.dumps(v, ensure_ascii=False)) + "::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def insert(table, rows, cols):
    out = []
    for r in rows:
        vals = ", ".join(lit(r.get(c)) for c in cols)
        out.append(f"insert into {table} ({', '.join(cols)}) values ({vals}) on conflict (id) do nothing;")
    return "\n".join(out)


def main():
    d = load_seed()
    parts = [
        "-- Tattoo House: стартові дані (згенеровано tools/make_seed.py з lib/seed-data.js, не редагувати вручну).\n"
        "-- Виконати після schema.sql: Supabase → SQL Editor → вставити → Run.\n"
        "-- Дані вигадані (демо-салон). Повторний запуск нічого не перезапише.\n"
        "begin;",
        insert("services", d["services"], ["id", "name", "icon", "price", "unit", "text", "visible", "sort"]),
        insert("masters", d["masters"], ["id", "name", "nick", "style", "tags", "exp", "price", "about", "photo", "photo_pos", "visible", "sort"]),
        insert("gallery", d["gallery"], ["id", "src", "w", "h", "alt", "style", "master_id", "visible", "sort"]),
        insert("reviews", d["reviews"], ["id", "text", "author", "caption", "visible", "sort"]),
        insert("settings", [{"id": "info", "data": d["info"]}, {"id": "giveaway", "data": d["giveaway"]}], ["id", "data"]),
        "commit;",
        "",
    ]
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n\n".join(parts))
    print("supabase/seed.sql:", sum(len(d[k]) for k in ("services", "masters", "gallery", "reviews")) + 2, "рядків")


if __name__ == "__main__":
    main()
