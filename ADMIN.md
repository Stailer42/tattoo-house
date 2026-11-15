# Адмінка Tattoo House

Адмінка лежить у `admin/` (на сайті: `/admin/`). Через неї власник керує майстрами, галереєю, послугами й цінами, записами клієнтів, розіграшем, відгуками, контактами й статистикою. Зроблена на основі референсу `admin-panel` (папка `admin-panel копія/` у git не потрапляє).

## Як це влаштовано

```
 відвідувач (GitHub Pages)                      адмін (/admin/, будь-який пристрій)
 index / masters / gallery / booking            admin/index.html + admin/sections/*.js
        |                                               |
 lib/site-data.js  (REST без бібліотек,         lib/db-supabase.js = THDB
 кеш у браузері, запасні дані)                  (supabase-js: вхід, база, фото)
        |  читає лише видимі рядки                       |  читає й змінює все після входу
        |  пише лише через create_booking /              |
        |  join_giveaway (перевірки на сервері)          |
        v                                               v
 +----------------------------- SUPABASE --------------------------------+
 | services, masters, gallery, reviews, settings      читає будь-хто      |
 | bookings, giveaway_entries                          лише адмін          |
 | Storage "photos": фото майстрів і галереї           пише лише адмін     |
 | Auth: e-mail + пароль, таблиця admins               хто має доступ      |
 +-----------------------------------------------------------------------+
```

* **Без бази** (немає `config.js`): сайт показує стартові дані з `lib/seed-data.js`, форми зберігаються лише в браузері (демо), адмінка показує «Supabase не налаштовано».
* **Пароль** зберігає Supabase Auth на своєму сервері. У коді, у `.env` і в git пароля адміна немає.
* **Ключі.** `config.js` (адреса й anon-ключ) генерується з `.env` і в git не потрапляє. На GitHub Pages його збирає workflow з секретів репозиторію. Anon-ключ видно в браузері будь-кому: так задумано в Supabase, дані захищають правила RLS у `supabase/schema.sql`. Ключ `service_role` у проєкт не класти ніколи.

## Звідки сайт бере дані

| На сайті | Розділ адмінки | Таблиця |
|---|---|---|
| Послуги на головній, крок 1 запису, чек | Послуги й ціни | `services` |
| Майстри на головній (перші 4), masters.html, крок 2 запису | Майстри | `masters` |
| Роботи на головній (перші 8), gallery.html, лайтбокс | Галерея | `gallery` |
| Відгуки на головній (перші 3) | Відгуки | `reviews` |
| Футер, іконка телефону, карта, адреса в чеку, графік у кроці 3, лічильники, кільце, JSON-LD | Основна інформація | `settings` (`info`) |
| Блок «Розіграш»: показ, таймер, приз, переможець | Розіграш | `settings` (`giveaway`) |
| Форма запису → список записів | Записи | `bookings` |
| Форма «Взяти участь» → учасники | Розіграш | `giveaway_entries` |

## Перший запуск Supabase (один раз)

1. [supabase.com](https://supabase.com) → **New project** (регіон Frankfurt). Пароль бази збережіть у менеджері паролів, у проєкт його не потрібно.
2. **SQL Editor** → вставити весь `supabase/schema.sql` → **Run**. Потім так само `supabase/seed.sql` (стартові дані сайту).
3. **Authentication → Users → Add user → Create new user**: e-mail і пароль адміна, позначка *Auto Confirm User*. Для автоматичних перевірок створіть ще одного, тестового.
4. Дати доступ до адмінки (SQL Editor, підставити e-mail):
   ```sql
   insert into admins (user_id, name)
   select id, 'Адміністратор' from auth.users where email = 'ваш@email';
   ```
5. **Authentication → Sign In / Providers → Email**: вимкнути *Allow new users to sign up*.
6. **Project Settings → API**: скопіювати *Project URL* і *anon / publishable key* у `.env` (зразок у `.env.example`).
7. Секрети для GitHub Pages:
   ```bash
   gh secret set SUPABASE_URL      # вставити URL
   gh secret set SUPABASE_ANON_KEY # вставити ключ
   gh workflow run pages.yml
   ```

## Локальний запуск

```bash
cd "/Applications/tattoo house"
python3 tools/make_config.py   # config.js із .env
python3 serve.py               # сайт http://localhost:8000, адмінка http://localhost:8000/admin/
```

Вхід: e-mail і пароль адміна з кроку 3. Забули пароль: Supabase → Authentication → Users → акаунт → *Send password recovery*. Змінити пароль: адмінка → Налаштування.

## Перевірки

```bash
python3 serve.py 8765 &
node tests/e2e/th-site.mjs        # сайт: дані, розіграш, запис до кінця (демо або live)
node tests/e2e/th-admin.mjs       # адмінка проти моку Supabase: усі розділи + видно на сайті
LIVE=1 node tests/e2e/th-admin.mjs  # те саме проти справжнього Supabase (TEST_ADMIN_* у .env)
node tests/e2e/th-security.mjs    # правила доступу живого Supabase з anon-ключем
node tests/e2e/th-screens.mjs tmp/screens/new   # скриншоти 360/768/1440 + консоль
bash tools/check_secrets.sh       # секрети в індексі (git hook pre-push запускає це сам)
```

Після зміни `lib/seed-data.js`: `python3 tools/make_seed.py` перезбирає `supabase/seed.sql`.

## Обмеження

* Безкоштовний Supabase ставить проєкт на паузу після 7 днів без запитів. Сайт тоді показує збережені або стартові дані, а запис і розіграш повертають помилку. Відновити: Supabase → проєкт → *Restore*.
* Календар запису досі закриває понеділок і пропонує 5 фіксованих слотів. Зайнятість слотів псевдовипадкова (так вирішено), тож двоє клієнтів можуть записатися на один час: адмін узгоджує це телефоном.
* Захист від спаму: поле-пастка й ліміти в `create_booking` (3 нові записи на номер, 30 за 10 хвилин на всіх) і `join_giveaway`. Номер телефону ніхто не підтверджує, тож чужий номер можна «зайняти» трьома заявками, а скрипт може вичерпати загальний ліміт. Від цілеспрямованої атаки допоможе лише Cloudflare Turnstile (потрібна Edge Function).
* Повторне натискання «Підтвердити запис» після обриву зв'язку не створює дубль: сервер повертає номер уже створеного запису.
* Адмінка вантажить supabase-js з jsdelivr з перевіркою `integrity`. Якщо оновлюєте версію, перерахуйте хеш (`curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A`).
* Тексти з числом майстрів («Вісім людей, вісім почерків» на masters.html, «8 майстрів» у meta description) статичні: після зміни складу їх треба поправити в HTML.
