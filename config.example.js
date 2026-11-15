/*
 * Tattoo House: runtime config example.
 * Real config.js is generated and NOT committed:
 *   locally:  python3 tools/make_config.py   (reads .env)
 *   deploy:   .github/workflows/pages.yml    (reads GitHub Secrets)
 * Without config.js the site runs in demo mode (built-in data, forms saved in the browser).
 */
window.TH_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
