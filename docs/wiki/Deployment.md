# Deployment

This covers deploying WFCS Booking to **shared LAMP hosting** (LAMP: PHP + MySQL). The app is designed for a standard `public_html/` directory structure.

---

## Prerequisites

- hosting account with PHP and MySQL access
- phpMyAdmin or MySQL CLI access
- FTP/SFTP client (e.g. FileZilla) or your host's file manager
- Node.js installed locally (to build CSS)

---

## Step 1 — Run build.sh

From the git root on your local machine:

```bash
cd well-booking/booking
./build.sh
```

`build.sh` does the following automatically:

1. Runs `npm run build:css` to produce the production CSS file in `dist/`.
2. Copies all app files into `booking/dist/` (excluding `.env`, dev configs, etc.).
3. **Swaps `Database.php` for `Database-shared.php`** — the shared hosting version uses native PDO prepares (required for standard MySQL; Galvani uses emulated prepares).
4. Creates `dist/booking-install.sql` by combining `database/schema.sql` with either seed data or a live database snapshot (your choice via interactive prompt).
5. Also produces `dist/booking-install.sql.gz` (compressed for phpMyAdmin upload).
6. Creates `uploads/`, `storage/`, and `logs/` directories with appropriate `.htaccess` protection.

When prompted, choose:
- **Option 1** — seed data (fresh install with test accounts and sample activities)
- **Option 2** — live snapshot (copies the running Galvani database; also syncs `database/schema.sql` and `database/seeds.sql` from live data)

The build output is in `booking/dist/`.

---

## Step 2 — Edit config files

Before uploading, edit the three config files in `booking/dist/config/`:

### `config/env.php`

This replaces `.env` on shared hosting. It sets `$_ENV` values directly from PHP (Shared hosting does not support dotfiles in the document root).

```php
<?php
$_ENV['JWT_SECRET']             = 'your-long-random-secret';
$_ENV['APP_KEY']                = 'your-32-char-aes-key';
$_ENV['STRIPE_SECRET_KEY']      = 'sk_live_...';
$_ENV['STRIPE_PUBLISHABLE_KEY'] = 'pk_live_...';
$_ENV['STRIPE_WEBHOOK_SECRET']  = 'whsec_...';
$_ENV['BIRD_MOCK']              = 'false';
```

Leave email driver credentials (Resend API key or SMTP password) and Bird credentials blank if you are configuring them via the admin Settings page (recommended — avoids storing secrets in files).

### `config/database.php`

Set your LAMP MySQL credentials:

```php
<?php
return [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'dbname'   => 'your_db_name',
    'username' => 'your_db_user',
    'password' => 'your_db_password',
    'charset'  => 'utf8mb4',
];
```

### `config/app.php`

Set the application URL and environment:

```php
<?php
return [
    'env'      => 'production',
    'url'      => 'https://yourdomain.com',
    'debug'    => false,
];
```

---

## Step 3 — Import the database

1. Log in to phpMyAdmin.
2. Create a new database (e.g. `wfcs_booking`) if it does not exist. Set charset to `utf8mb4`, collation `utf8mb4_unicode_ci`.
3. Select the database.
4. Click **Import** → upload `dist/booking-install.sql.gz`.
   - phpMyAdmin accepts `.sql.gz` natively and this bypasses the upload size limit.
   - Alternatively, import the uncompressed `dist/booking-install.sql` via the CLI: `mysql -u user -p dbname < booking-install.sql`
5. Confirm the tables were created (you should see ~20+ tables listed).

---

## Step 4 — Upload files

Upload the **contents** of `booking/dist/` to `public_html/booking/` on your LAMP host. Do not upload the `dist/` folder itself — upload what is inside it.

Your LAMP directory structure should look like:

```
public_html/
└── booking/
    ├── index.php
    ├── .htaccess
    ├── app/
    ├── config/
    │   ├── env.php          (your production secrets)
    │   ├── database.php     (your MySQL credentials)
    │   └── app.php
    ├── dist/
    │   └── app.css          (compiled Tailwind CSS)
    ├── uploads/
    ├── storage/
    └── logs/
```

---

## Step 5 — Set directory permissions

SSH into LAMP or use the file manager to set permissions:

```
uploads/     — 755
storage/     — 755
logs/        — 755
```

PHP must be able to write to these directories. If uploads fail, check the owner/group matches the PHP process user.

---

## Step 6 — Verify the .htaccess

The `booking/.htaccess` is included in the build and handles:
- Routing all requests through `index.php` (mod_rewrite required)
- Protecting the `storage/` and `logs/` directories from direct access

If the site returns 404 or 500 errors after upload, check that **mod_rewrite is enabled** on your your hosting plan (it is enabled by default on most shared LAMP hosting plans).

---

## Step 7 — Re-save Stripe keys in Settings

After importing the database, log in as `admin@booking.local` (or your production super_admin account) and go to **Settings > Stripe**.

Re-enter your Stripe secret key, publishable key, and webhook secret, then save.

**Why**: The database dump contains Stripe keys encrypted with your local `APP_KEY`. The production server has a different `APP_KEY` in `config/env.php`, so the encrypted values from the dump cannot be decrypted. Re-saving via the UI re-encrypts them with the production key.

The same applies to Settings > Notification Services for email (SMTP or Resend) and Bird SMS/WhatsApp credentials.

---

## Step 8 — Confirm the site works

1. Visit `https://yourdomain.com/booking/` — you should see the login page.
2. Log in with the admin account.
3. Navigate to Settings > Stripe and confirm your keys are saved.
4. Make a test booking with a Stripe test card (`4242 4242 4242 4242`).

---

## Updating after a code change

1. Pull the latest code locally.
2. Re-run `build.sh` (choose option 1 or 2 depending on whether you want to sync the database).
3. Upload changed files from `dist/` to LAMP — you only need to upload modified files.
4. If the database schema changed, run the migration or re-import `booking-install.sql`.

Config files in `dist/config/` are preserved by `build.sh` on subsequent runs (it backs them up before wiping `dist/` and restores them after).

---

## Troubleshooting

### "Your session expired. Please try again." on login

This appears when the CSRF session cookie is missing — typically because the browser was closed and reopened between loading the login page and submitting the form. It is self-healing: the page reloads automatically with a fresh cookie and the next submit succeeds. No action required.

If login is failing with a blank white error instead of this message, you are running an older build — redeploy with the latest `dist/`.

## Stripe webhook setup

For Stripe payment confirmation to work on the live site, register the webhook endpoint in the Stripe dashboard:

- Endpoint URL: `https://yourdomain.com/booking/api/stripe/webhook`
- Events to listen for: `payment_intent.succeeded`, `payment_intent.payment_failed`

Copy the webhook signing secret and save it via Settings > Stripe in the admin UI.
