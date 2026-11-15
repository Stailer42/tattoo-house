/*
 * Tattoo House: стартові дані сайту (вигадані, як і весь демо-сайт).
 * 1) Запасний варіант: сайт показує їх, якщо Supabase не налаштовано або недоступний.
 * 2) Джерело для supabase/seed.sql: python3 tools/make_seed.py
 * Між "window.TH_SEED = " і ";" має лишатися чистий JSON (його читає make_seed.py).
 */
window.TH_SEED = {
  "services": [
    {
      "id": "tattoo",
      "name": "Тату",
      "icon": "dagger",
      "price": 1500,
      "unit": "",
      "text": "Від мініатюри до рукава. Ескіз погоджуємо до сеансу, а не під машинкою.",
      "visible": true,
      "sort": 1
    },
    {
      "id": "piercing",
      "name": "Пірсинг",
      "icon": "star",
      "price": 600,
      "unit": "",
      "text": "Вуха, ніс, брова, губа. Титанові прикраси імплант-класу вже в ціні.",
      "visible": true,
      "sort": 2
    },
    {
      "id": "coverup",
      "name": "Перекриття",
      "icon": "flame",
      "price": 3000,
      "unit": "",
      "text": "Ховаємо старе або невдале тату під нову роботу, якої не соромно.",
      "visible": true,
      "sort": 3
    },
    {
      "id": "sketch",
      "name": "Ескіз на замовлення",
      "icon": "bolt",
      "price": 800,
      "unit": "",
      "text": "Унікальний малюнок тільки під вас. Два раунди правок без доплат.",
      "visible": true,
      "sort": 4
    },
    {
      "id": "correction",
      "name": "Корекція",
      "icon": "horns",
      "price": 1200,
      "unit": "",
      "text": "Оновлюємо вицвілі контури та колір, виправляємо чужі помилки.",
      "visible": true,
      "sort": 5
    },
    {
      "id": "removal",
      "name": "Лазерне видалення",
      "icon": "skull",
      "price": 900,
      "unit": "/сеанс",
      "text": "Видалення або висвітлення старого тату під перекриття. Ціна за сеанс.",
      "visible": true,
      "sort": 6
    }
  ],
  "masters": [
    {
      "id": "ostap",
      "name": "Остап Коваль",
      "nick": "Шрам",
      "style": "Реалізм ч/б",
      "tags": [
        "Реалізм",
        "Портрети",
        "Чорно-сіре"
      ],
      "exp": 12,
      "price": "1 200 ₴/год",
      "about": "Портрети, тварини, кінематографічні сюжети. Працює з тінню так, що тату виглядає як фото на шкірі.",
      "photo": "assets/masters/master-1.jpg",
      "photo_pos": "top",
      "visible": true,
      "sort": 1
    },
    {
      "id": "solomiia",
      "name": "Соломія Гнатюк",
      "nick": "Ніч",
      "style": "Графіка / дотворк",
      "tags": [
        "Графіка",
        "Дотворк",
        "Орнамент"
      ],
      "exp": 8,
      "price": "1 000 ₴/год",
      "about": "Орнаменти, ботаніка, сакральна геометрія. Чисті лінії та крапкова тінь, що гарно старіє разом з вами.",
      "photo": "assets/masters/master-2.jpg",
      "photo_pos": "top",
      "visible": true,
      "sort": 2
    },
    {
      "id": "taras",
      "name": "Тарас Мельник",
      "nick": "Борода",
      "style": "Олдскул / неотрад",
      "tags": [
        "Олдскул",
        "Неотрад",
        "Колір"
      ],
      "exp": 10,
      "price": "1 500–6 000 ₴",
      "about": "Ластівки, кинджали, троянди, пантери. Жирний контур і насичений колір: класика, яка не виходить з моди.",
      "photo": "assets/masters/master-3.jpg",
      "photo_pos": "top",
      "visible": true,
      "sort": 3
    },
    {
      "id": "alex",
      "name": "Алекс Мороз",
      "nick": "Вайпер",
      "style": "Пірсинг / мініатюри",
      "tags": [
        "Пірсинг",
        "Мініатюри",
        "Fine line"
      ],
      "exp": 6,
      "price": "від 600 ₴",
      "about": "Проколи будь-якої складності та тонкі мініатюри. Стерильність, яку можна перевірити: усе відкривається при вас.",
      "photo": "assets/masters/master-4.jpg",
      "photo_pos": "wide",
      "visible": true,
      "sort": 4
    },
    {
      "id": "iryna",
      "name": "Ірина Савчук",
      "nick": "Лисиця",
      "style": "Акварель / колір",
      "tags": [
        "Акварель",
        "Колір",
        "Ботаніка"
      ],
      "exp": 7,
      "price": "1 100 ₴/год",
      "about": "Розмиті кольорові плями, квіти, тварини в акварельній техніці. Контур підбирає так, щоб колір не поплив з роками.",
      "photo": "assets/masters/master-5.jpg",
      "photo_pos": "wide",
      "visible": true,
      "sort": 5
    },
    {
      "id": "dana",
      "name": "Дана Остапчук",
      "nick": "Кобра",
      "style": "Леттеринг / каліграфія",
      "tags": [
        "Леттеринг",
        "Каліграфія",
        "Шрифти"
      ],
      "exp": 9,
      "price": "900–4 000 ₴",
      "about": "Написи будь-якою мовою, власні шрифти, готичний і чикано-леттеринг. Перевіряє кожну літеру перед сеансом.",
      "photo": "assets/masters/master-6.jpg",
      "photo_pos": "wide",
      "visible": true,
      "sort": 6
    },
    {
      "id": "bohdan",
      "name": "Богдан Яремчук",
      "nick": "Тінь",
      "style": "Перекриття / корекція",
      "tags": [
        "Перекриття",
        "Корекція",
        "Блекворк"
      ],
      "exp": 14,
      "price": "1 300 ₴/год",
      "about": "Рятує те, що здавалося безнадійним: старі наколки, розпливлі контури, невдалі написи. Перекриває так, що старого не видно.",
      "photo": "",
      "photo_pos": "top",
      "visible": true,
      "sort": 7
    },
    {
      "id": "vlad",
      "name": "Влад Данилюк",
      "nick": "Голка",
      "style": "Японський стиль",
      "tags": [
        "Ірезумі",
        "Великі проєкти",
        "Рукави"
      ],
      "exp": 11,
      "price": "від 2 500 ₴/сеанс",
      "about": "Дракони, коі, хвилі та маски ханья. Веде великі проєкти на спину чи рукав від ескізу до останнього сеансу.",
      "photo": "",
      "photo_pos": "top",
      "visible": true,
      "sort": 8
    }
  ],
  "gallery": [
    {
      "id": "g-01",
      "src": "assets/tattoos/tattoo-01.jpg",
      "w": 722,
      "h": 775,
      "alt": "Чорно-біле тату: кошеня, що сидить у кедах",
      "style": "Графіка",
      "master_id": "solomiia",
      "visible": true,
      "sort": 1
    },
    {
      "id": "g-02",
      "src": "assets/tattoos/tattoo-02.jpg",
      "w": 506,
      "h": 805,
      "alt": "Реалістичне чорно-сіре тату кошеняти з бляшанкою на передпліччі",
      "style": "Реалізм",
      "master_id": "ostap",
      "visible": true,
      "sort": 2
    },
    {
      "id": "g-03",
      "src": "assets/tattoos/tattoo-03.jpg",
      "w": 506,
      "h": 900,
      "alt": "Гострий графічний орнамент від передпліччя до пальців",
      "style": "Графіка",
      "master_id": "solomiia",
      "visible": true,
      "sort": 3
    },
    {
      "id": "g-04",
      "src": "assets/tattoos/tattoo-04.jpg",
      "w": 506,
      "h": 900,
      "alt": "Тату на кисті: готичний хрест із зірками та колючими лініями",
      "style": "Блекворк",
      "master_id": "bohdan",
      "visible": true,
      "sort": 4
    },
    {
      "id": "g-05",
      "src": "assets/tattoos/tattoo-05.jpg",
      "w": 543,
      "h": 900,
      "alt": "Гілка сакури та англійські написи на плечі",
      "style": "Fine line",
      "master_id": "dana",
      "visible": true,
      "sort": 5
    },
    {
      "id": "g-06",
      "src": "assets/tattoos/tattoo-06.jpg",
      "w": 506,
      "h": 900,
      "alt": "Передпліччя: ангел, хрест і каліграфічний напис",
      "style": "Леттеринг",
      "master_id": "dana",
      "visible": true,
      "sort": 6
    },
    {
      "id": "g-07",
      "src": "assets/tattoos/tattoo-07.jpg",
      "w": 745,
      "h": 900,
      "alt": "Японський дракон із блискавками на всю спину",
      "style": "Ірезумі",
      "master_id": "vlad",
      "visible": true,
      "sort": 7
    },
    {
      "id": "g-08",
      "src": "assets/tattoos/tattoo-08.jpg",
      "w": 675,
      "h": 900,
      "alt": "Птах і колючі орнаменти на плечі та грудях",
      "style": "Графіка",
      "master_id": "ostap",
      "visible": true,
      "sort": 8
    },
    {
      "id": "g-09",
      "src": "assets/tattoos/tattoo-09.jpg",
      "w": 720,
      "h": 900,
      "alt": "Рукав із японським драконом і квітами сакури",
      "style": "Ірезумі",
      "master_id": "vlad",
      "visible": true,
      "sort": 9
    },
    {
      "id": "g-10",
      "src": "assets/tattoos/tattoo-10.jpg",
      "w": 605,
      "h": 807,
      "alt": "Реалістичний кольоровий орел на лобі",
      "style": "Реалізм",
      "master_id": "ostap",
      "visible": true,
      "sort": 10
    }
  ],
  "reviews": [
    {
      "id": "r-1",
      "text": "Робила перше тату в Соломії. Боялася до тремтіння, а вийшла з посмішкою. Пів року минуло, лінії як у перший день.",
      "author": "Олена, 24",
      "caption": "графіка на передпліччі",
      "visible": true,
      "sort": 1
    },
    {
      "id": "r-2",
      "text": "Перекрили армійську наколку, яку я ховав п’ятнадцять років. Тепер на плечі ворон, і я знову ходжу у футболках.",
      "author": "Андрій, 38",
      "caption": "перекриття у Богдана",
      "visible": true,
      "sort": 2
    },
    {
      "id": "r-3",
      "text": "Проколов хрящ у Алекса. Все стерильно, швидко, детально пояснили догляд. Загоїлось без жодних проблем.",
      "author": "Максим, 19",
      "caption": "пірсинг вуха",
      "visible": true,
      "sort": 3
    }
  ],
  "info": {
    "address": "вул. Городоцька, 47",
    "city": "Львів",
    "address_note": "Вхід з вулиці, чорні двері з неоном",
    "map_query": "Horodotska St 47, Lviv, Ukraine",
    "phone": "+380 32 247 47 47",
    "phone_note": "Дзвінки щодня з 11:00",
    "hours": "Вт–Нд: 11:00–21:00",
    "hours_note": "Понеділок вихідний",
    "opening_hours": "Tu-Su 11:00-21:00",
    "instagram": "https://instagram.com/tattoohouse.lviv",
    "telegram": "https://t.me/tattoohouse_lviv",
    "stats": {
      "rating": 4.9,
      "reviews": 1200,
      "clients": 5000,
      "years": 10
    }
  },
  "giveaway": {
    "enabled": true,
    "ends_at": "2026-12-31T23:59:00+02:00",
    "prize": "5 000 ₴",
    "announce": "31 грудня о 20:00",
    "prize_note": "Сертифікат дійсний 6 місяців після розіграшу.",
    "winner": null
  }
};
