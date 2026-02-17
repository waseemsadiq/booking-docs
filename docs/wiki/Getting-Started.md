# Getting Started

This guide walks a new developer through getting the project running locally from scratch.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Galvani binary** | The custom PHP runtime + embedded MariaDB. Must be in the git root (`./galvani`). Obtain from the project maintainer. |
| **PHP** | Galvani bundles its own PHP interpreter — no system PHP required for the dev server. |
| **Node.js + npm** | Required only to rebuild TailwindCSS. Node 18+ recommended. |
| **Git** | Standard git. |

Galvani replaces Apache/Nginx + MySQL for local development. You do **not** need MAMP, XAMPP, Docker, or a system MySQL installation.

---

## 1. Clone the repository

```bash
git clone https://github.com/waseemsadiq/well-booking.git
cd well-booking
```

The directory structure after cloning:

```
well-booking/               # git root = Galvani document root
├── galvani                 # dev server binary (executable)
├── db-init.php             # full DB reset script
├── database/
│   ├── schema.sql          # all table definitions
│   └── seeds.sql           # sample data (test accounts, activities, etc.)
└── booking/                # the web app (served at /booking/)
    ├── index.php           # single entry point for all requests
    ├── app/                # MVC source code
    ├── config/             # PHP config files
    ├── css/                # Tailwind source
    ├── js/                 # vanilla JS
    ├── uploads/            # user-uploaded images (gitignored)
    ├── storage/            # session files (gitignored)
    └── .env                # app secrets (gitignored — see below)
```

---

## 2. Create the .env files

There are two `.env` files. Neither is committed to git.

### Root `.env` (Galvani runtime settings)

Create `well-booking/.env`:

```dotenv
# Galvani dev server settings
PORT=8080
```

This file is read by Galvani itself, not by the PHP app.

### App `.env` (application secrets)

Create `well-booking/booking/.env`:

```dotenv
JWT_SECRET=any-long-random-string-here
APP_KEY=another-32-char-random-string

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

RESEND_API_KEY=re_...          # Resend driver only — or leave blank to log emails to logs/emails.log
MAIL_FROM_ADDRESS=noreply@example.com
MAIL_FROM_NAME=WFCS Booking

BIRD_MOCK=true                 # true = log SMS/WhatsApp to logs/bird-mock.log (sends only — does not show Bird settings in UI)
```

For local development, Stripe test keys and `BIRD_MOCK=true` are sufficient. Note: mock mode only intercepts outbound sends — the Bird settings UI in admin only appears when a real API key is configured. Email sending falls back to `logs/emails.log` if no driver is configured. For local SMTP testing use Mailpit (`brew install mailpit`) — configure host=localhost port=1025 encryption=none in Settings > Notification Services.

---

## 3. Initialise the database

```bash
./galvani db-init.php
```

This script:
1. Drops and recreates the `booking_app` database
2. Imports `database/schema.sql` (all tables)
3. Imports `database/seeds.sql` (test accounts, activities, venues, seed bookings)

Expected output: a list of tables created, then `Database initialised successfully.`

---

## 4. Start the dev server

```bash
./galvani
```

Galvani starts on `http://localhost:8080` by default.

The app is served at: **http://localhost:8080/booking/**

---

## 5. Confirm it works

1. Open http://localhost:8080/booking/ in a browser.
2. Log in with `customer@booking.local` / `password123`.
3. You should land on the activities list or your bookings page.
4. Log out, then log in as `admin@booking.local` / `password123` to see the admin board.

---

## Rebuilding CSS

TailwindCSS is compiled from `booking/css/` into `booking/dist/app.css`. If you change Tailwind classes in PHP views:

```bash
npm install          # first time only, from git root
npm run build:css    # one-off build
npm run watch:css    # watch mode during development
```

---

## Restarting Galvani

Galvani caches PHP **class files** (Controllers, Services, Models, Repositories) in memory. You must restart after editing any of those.

```
Ctrl+C    # stop
./galvani # start again
```

**Views are re-read on every request** — no restart needed for `.php` files in `app/Views/`.

---

## Common issues

| Symptom | Fix |
|---|---|
| `No such file or directory` on socket | Check `booking/.env` exists; run `./galvani` from git root, not from `booking/` |
| Login redirects loop | Clear cookies; check JWT_SECRET is set in `booking/.env` |
| CSS looks wrong | Run `npm run build:css` |
| DB changes not visible | Run `./galvani db-init.php` (destructive — wipes all data) |
| Code changes not taking effect | Restart Galvani if you edited a PHP class file |
