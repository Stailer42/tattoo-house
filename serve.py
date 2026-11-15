#!/usr/bin/env python3
"""
Локальний сервер для перевірки Tattoo House (сайт + адмінка). Взято з референсу admin-panel.

    python3 serve.py          http://localhost:8000
    python3 serve.py 8765     інший порт

Чому не просто `python3 -m http.server`: стандартний сервер тримає в черзі
лише 5 з'єднань і обриває решту (net::ERR_CONNECTION_RESET). Адмінка
вантажить понад десяток файлів одночасно, і час від часу якийсь не доходив.
Тут черга більша, а кеш вимкнено, щоб після правок браузер брав свіжі файли.
Нічого встановлювати не треба: лише Python 3.
"""
import http.server
import os
import sys


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # у терміналі показуємо лише помилки, а не кожен файл
    def log_request(self, code="-", size="-"):
        if isinstance(code, int) and code >= 400 or str(code)[:1] in ("4", "5"):
            super().log_request(code, size)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"Tattoo House: http://localhost:{port}")
        print(f"Адмінка:      http://localhost:{port}/admin/  (вхід: e-mail і пароль адміна в Supabase)")
        print("Зупинити: Ctrl + C")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер зупинено.")


if __name__ == "__main__":
    main()
