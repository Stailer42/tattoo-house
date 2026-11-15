#!/usr/bin/env python3
"""
Tattoo House: config.js із .env (для локального запуску).

    python3 tools/make_config.py

config.js лежить у .gitignore. На GitHub Pages його збирає workflow
.github/workflows/pages.yml із секретів репозиторію SUPABASE_URL і SUPABASE_ANON_KEY.
У config.js потрапляють лише URL і anon-ключ (публічні за задумом Supabase).
Тестовий вхід із .env сюди НЕ потрапляє.
"""
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_env(path):
    env = {}
    if not os.path.exists(path):
        return env
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def check_public_key(key):
    """config.js публічний: туди можна лише anon / publishable-ключ.
    Секретний ключ (sb_secret_..., JWT з role=service_role) дав би будь-кому повний доступ до бази."""
    if key.startswith("sb_secret_"):
        sys.exit("SUPABASE_ANON_KEY схожий на СЕКРЕТНИЙ ключ (sb_secret_). Потрібен publishable / anon.")
    if key.startswith("sb_publishable_"):
        return
    parts = key.split(".")
    if len(parts) == 3:
        try:
            pad = "=" * (-len(parts[1]) % 4)
            role = json.loads(base64.urlsafe_b64decode(parts[1] + pad)).get("role")
        except Exception:
            sys.exit("SUPABASE_ANON_KEY: не вдалося прочитати ключ.")
        if role != "anon":
            sys.exit("SUPABASE_ANON_KEY має роль %r, а потрібна anon. Секретний ключ у config.js класти не можна." % role)
        return
    sys.exit("SUPABASE_ANON_KEY не схожий на ключ Supabase (очікується sb_publishable_... або JWT anon).")


def main():
    env = read_env(os.path.join(ROOT, ".env"))
    url = os.environ.get("SUPABASE_URL") or env.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_ANON_KEY") or env.get("SUPABASE_ANON_KEY", "")
    if not url or not key:
        sys.exit("Немає SUPABASE_URL або SUPABASE_ANON_KEY (.env або змінні оточення).")
    if not url.startswith("https://"):
        sys.exit("SUPABASE_URL має починатися з https://")
    check_public_key(key)
    body = (
        "/* Згенеровано tools/make_config.py. НЕ комітити (файл у .gitignore). */\n"
        "window.TH_CONFIG = " + json.dumps({"supabaseUrl": url.rstrip("/"), "supabaseAnonKey": key}, indent=2) + ";\n"
    )
    with open(os.path.join(ROOT, "config.js"), "w", encoding="utf-8") as f:
        f.write(body)
    print("config.js готовий")


if __name__ == "__main__":
    main()
