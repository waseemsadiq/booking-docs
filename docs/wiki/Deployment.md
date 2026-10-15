# Deployment

This covers deploying WFCS Booking to a **LAMP server** (Apache, PHP, MySQL) with the app at the domain root, using SFTP for files and phpMyAdmin for the database.

`build.sh` makes two separate things:

- **`dist/`** — the app files. You upload the contents of this folder.
- **`db-export/`** — a database installer for phpMyAdmin. It contains customer data, so it stays on your computer: you import it from your browser and never upload it to the server.

---

## Prerequisites

- PHP 8.1 or newer with `pdo_mysql`, `mbstring`, `curl`, `openssl` and `zip`
- MySQL 8 (or MariaDB 10.6+)
- Apache with `mod_rewrite`, and `AllowOverride All` for the web root (so `.htaccess` works)
- phpMyAdmin and an SFTP client (e.g. FileZilla)
- Galvani running locally (the database export reads the local database)

---

## Step 1 — Build

From the booking folder on your computer:

```bash
bash build.sh
```

Choose:

- **1) App files** — `dist/` only. Use this for code updates.
- **2) Database export** — `db-export/booking-mirror-<date>.sql.gz` only.
- **3) Full mirror** — app files, uploaded images and the database export. Use this for the first install.

What the build does:

1. Copies the app into `dist/` (everything in `.distignore` is left out: `.env`, docs, tests, dumps, logs, dev scripts).
2. Creates `dist/config/env.php` with a fresh `APP_KEY` and `JWT_SECRET`. On later builds it keeps the `dist/config/env.php` you've already edited.
3. Adds the `uploads/`, `storage/` and `logs/` folders with their `.htaccess` protection, plus the uploaded images for a full mirror.
4. For the database export, makes a temporary copy of the local database and cleans it:
   - removes the test accounts (`@test.local`), the audit log and the cache
   - removes the Stripe, JustGiving and SMTP credentials (they're encrypted with your local `APP_KEY`, so they couldn't be read on the server anyway)
   - leaves email in **Test** mode, so testing on the new server can't email customers: only the allowlist (e.g. `@wellfoundation.org.uk`) receives email, and everyone else's goes to the test inbox

   The installer takes its table structure from `database/schema.sql` and the data from that cleaned copy. Your local database isn't changed.

---

## Step 2 — Edit `dist/config/env.php`

This is the only config file to edit. Fill in:

```php
$_ENV['APP_URL'] = 'https://yourdomain.com';

$_ENV['DB_HOST'] = 'localhost';
$_ENV['DB_PORT'] = '3306';
$_ENV['DB_NAME'] = 'your_database';
$_ENV['DB_USER'] = 'your_database_user';
$_ENV['DB_PASS'] = 'your_database_password';
```

`APP_KEY` and `JWT_SECRET` are already filled in with random values. Keep them private, and don't change `APP_KEY` once you've saved credentials in Settings: they're encrypted with it.

---

## Step 3 — Import the database

1. In your hosting control panel, create an empty MySQL database and user (`utf8mb4`, collation `utf8mb4_unicode_ci`).
2. Open phpMyAdmin and select that database.
3. Choose **Import**, pick the `.sql.gz` file from `db-export/` on your computer, and select **Import**. phpMyAdmin reads `.gz` files directly.
4. Check you see about 40 tables.

The installer drops and recreates every table, so importing it again resets the database to the export.

Once the import has worked, delete the export from your computer.

---

## Step 4 — Upload the files

Upload the **contents** of `dist/` (not the folder itself) to the web root over SFTP. Make sure hidden files are included: `.htaccess` at the root and in `uploads/`, `storage/` and `logs/`.

```
public_html/
├── .htaccess
├── index.php
├── app/
├── config/
│   └── env.php        (your database login and secrets)
├── css/
├── images/
├── js/
├── uploads/
├── storage/
└── logs/
```

The app works out its own path, so it also runs from a subfolder if you ever need that.

---

## Step 5 — Permissions

PHP must be able to write to `uploads/`, `storage/` and `logs/`. On most hosts `755` folders owned by your account work; if image uploads fail, check the folders belong to the user PHP runs as.

---

## Step 6 — Check it works

1. Visit `https://yourdomain.com/` — you should see the welcome page.
2. Check the protected paths are refused: `https://yourdomain.com/config/env.php` and `https://yourdomain.com/logs/` should both give **403 Forbidden**. If they don't, `.htaccess` isn't being read: ask your host to enable `AllowOverride All`.
3. Log in as an admin.

---

## Step 7 — Re-enter credentials

The export leaves out anything encrypted with your local `APP_KEY`. Re-enter them:

- **Settings → Stripe**: publishable key, secret key, webhook signing secret, and the JustGiving details
- **Settings → Email**: the SMTP password

Then register the Stripe webhook in the Stripe dashboard:

- Endpoint URL: `https://yourdomain.com/api/payments/stripe/webhook`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`

Make a test booking with a Stripe test card (`4242 4242 4242 4242`).

---

## Step 8 — Launch day

Email is in Test mode. When you're ready, choose **Live** under **Settings → Email → Delivery** and select **Save delivery**. The server must have `APP_ENV` set to `production` in `config/env.php` (the template does), or Live behaves as Test.

If the database was installed before this release, run `database/migrations/2026_10_15_mail_test_mode.sql` first: it replaces the old on/off switch with the delivery modes.

---

## Updating after a code change

1. Pull the latest code locally and run `bash build.sh`, option **1**.
2. Upload the changed files from `dist/`. Your server's `config/env.php` isn't overwritten as long as you don't upload `dist/config/env.php` over it (the build keeps your edited copy in `dist/` anyway).
3. If the release includes a file in `database/migrations/`, run it in phpMyAdmin (**SQL** tab) before or straight after uploading.

Don't re-import a mirror export once the site is live: it replaces all live data.

---

## Troubleshooting

### "Your session expired. Please try again." on login

This appears when the CSRF cookie is missing — typically because the browser was closed and reopened between loading the login page and submitting the form. The page reloads with a fresh cookie and the next submit succeeds.

### A page shows "500" with no details

PHP errors are never shown to visitors unless `APP_DEBUG` is `'true'` in `config/env.php`. Look in the host's PHP error log instead.
