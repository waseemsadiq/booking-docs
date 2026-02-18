# Architecture

## Overview

WFCS Booking is a **server-rendered PHP MVC application**. There is no JavaScript framework, no SPA, no API-first design. HTML forms POST to the server; the server responds with a new page or a redirect.

The system runs identically on two runtimes:
- **Local development**: Galvani (async, multi-threaded, embedded MariaDB)
- **Production**: LAMP (standard PHP + MySQL)

---

## Directory layout

```
booking/                        # git root (local Galvani workspace, not pushed)
├── galvani                     # dev server binary (gitignored)
├── .env                        # Galvani thread count only (gitignored)
├── data/                       # Embedded MariaDB data (gitignored)
└── booking/                    # THE APP — its own GitHub repo
    ├── index.php               # single entry point
    ├── db-init.php             # full DB reset
    ├── composer.json           # PHP deps (Stripe, PHPUnit)
    ├── package.json            # Node deps (TailwindCSS)
    ├── database/
    │   ├── schema.sql
    │   └── seeds.sql
    ├── app/
    │   ├── Controllers/        # HTTP request handlers
    │   ├── Models/             # Database singleton
    │   ├── Repositories/       # ALL SQL queries live here
    │   ├── Services/           # Business logic, no direct DB access
    │   ├── Helpers/            # Pure functions (auth, validation, etc.)
    │   ├── Routes/             # Role-scoped route files
    │   ├── Views/              # PHP view files (server-rendered HTML)
    │   │   ├── layouts/        # app.php base layout
    │   │   ├── shared/         # Popover dialogs included in every page
    │   │   ├── admin/
    │   │   ├── customer/
    │   │   ├── instructor/
    │   │   └── partials/       # Reusable view fragments
    │   └── Workers/            # Background job workers
    ├── config/                 # DB credentials, Stripe config
    ├── css/                    # Tailwind source
    ├── uploads/                # User-uploaded images
    ├── storage/                # Session files
    └── logs/                   # Email + SMS mock logs
```

Served with: `./galvani` (from git root). App URL: `http://localhost:8080/booking/`.

---

## MVC layers

```
┌─────────────────────────────────────────────────────┐
│                     Browser                         │
│              HTML form POST / GET                   │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP request
                      ▼
┌─────────────────────────────────────────────────────┐
│                  index.php                          │
│  - Calculates $basePath dynamically                 │
│  - Loads .env, helpers, autoloader                  │
│  - Handles auth, CSRF on page-level POSTs           │
│  - Dispatches to: Routes/customer.php               │
│                   Routes/admin.php                  │
│                   Routes/instructor.php             │
│                   Router.php (API)                  │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Routes/*.php (page routing)            │
│  Plain PHP if/elseif chains on $request_uri.        │
│  Instantiate services, render views directly.       │
│  OR                                                 │
│              Router.php (API routing)               │
│  Regex-based REST router → Controller methods.      │
└──────┬──────────────────────────────────┬───────────┘
       │ page routes                      │ API routes
       ▼                                  ▼
┌─────────────┐                  ┌─────────────────────┐
│  Views/     │                  │  Controllers/       │
│  *.php      │                  │  *Controller.php    │
│             │                  │  extend Controller  │
│  Server-    │                  │  base class         │
│  rendered   │                  └────────┬────────────┘
│  HTML       │                           │
└─────────────┘                           ▼
                                 ┌─────────────────────┐
                                 │  Services/          │
                                 │  *Service.php       │
                                 │  Business logic     │
                                 │  only — no direct   │
                                 │  DB access          │
                                 └────────┬────────────┘
                                          │
                                          ▼
                                 ┌─────────────────────┐
                                 │  Repositories/      │
                                 │  *Repository.php    │
                                 │  ALL SQL lives here │
                                 └────────┬────────────┘
                                          │
                                          ▼
                                 ┌─────────────────────┐
                                 │  Models/Database.php│
                                 │  PDO singleton      │
                                 │  Database::getInstance()│
                                 └─────────────────────┘
```

### Repository index

All SQL is exclusive to Repository classes in `app/Repositories/`. Services and Controllers never call `Database::getInstance()` directly.

Key repositories to know:

| Repository | Owns |
|---|---|
| `AppSettingsRepository` | `app_settings` key-value store. Use `get($key)` / `set($key, $value)` / `getMultiple($keys[])` for Stripe keys, mail driver, SMTP/Bird credentials, and other admin-configurable settings. |
| `NotificationSubscriptionRepository` | `user_notification_subscriptions`. CRUD for per-user event notification preferences (activity/session-specific subscriptions for admins and instructors). |
| `BookingRepository` | `bookings` — core booking CRUD and availability queries. |
| `PaymentRepository` | `payments` and `account_credit_transactions`. |
| `SessionRepository` | `sessions` — generation and availability. |
| `UserRepository` | `users` and `participants`. |

---

## How a request flows

### Example: customer books an activity session

1. **Browser** submits `POST /{app-folder}/bookings` (HTML form, CSRF token in hidden field).

2. **`index.php`** calculates `$basePath`, loads helpers, validates CSRF, checks auth cookie, sets `$user`. Matches `/bookings` prefix → includes `Routes/customer.php`.

3. **`Routes/customer.php`** matches `POST /{app-folder}/bookings` → instantiates `BookingService` and `PaymentService`, calls business logic, renders a view or redirects.

4. **`BookingService`** orchestrates: checks capacity via `BookingRepository`, applies account credit via `PaymentService::applyCredit()`, records the booking via `BookingRepository::create()`.

5. **`BookingRepository`** executes parameterised SQL via `Database::getInstance()`.

6. **Response**: redirect to `/{app-folder}/bookings` with a flash success message; next GET renders the bookings list view.

### Example: admin fetches bookings JSON

1. **Browser** sends `GET /api/admin/bookings?status=confirmed` (JS fetch from an admin view).

2. **`index.php`** falls through page routes, reaches `Router.php`.

3. **`Router`** matches `GET /api/admin/bookings` → calls `AdminController::listBookings()`.

4. **`AdminController`** calls `BookingService`, which calls `BookingRepository`, and returns `json_encode($data)`.

---

## basePath

`$basePath` is calculated once in `index.php`:

```php
$basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
```

On Galvani (`./galvani` from git root): `$basePath = '/booking'` (app is a subfolder of doc root)
On LAMP (app in `public_html/booking/`): `$basePath = '/booking'`
On LAMP (app at root): `$basePath = ''`

All view links and `header('Location: ...)` calls prefix with `$basePath`. The string `"booking"` is **never hardcoded** in PHP or JS.

---

## Dual-deploy strategy

| Aspect | Galvani (dev) | LAMP (production) |
|---|---|---|
| PHP runtime | Galvani embedded | Standard PHP |
| Database | Embedded MariaDB via Unix socket | MySQL via TCP |
| PDO prepares | `ATTR_EMULATE_PREPARES = true` (emulated) | Native prepares (`Database-shared.php`) |
| Config | `booking/.env` text file | `booking/config/env.php` (sets `$_ENV`) |
| Build step | None | Run `build.sh` → creates `dist/` folder |
| Static files | Galvani serves natively | Apache serves via `.htaccess` |
| CSS | Source in `booking/css/` | Pre-built `booking/dist/app.css` in `dist/` |

`build.sh` swaps `Database.php` for `Database-shared.php` automatically. The shared hosting version uses native prepares (compatible with standard MySQL) while the Galvani version uses emulated prepares (required to avoid date/time corruption on the long-running singleton connection).

---

## Authentication

- Sessions are JWT tokens stored in an **HttpOnly, SameSite=Strict cookie** (`auth_token`).
- `getAuthUser()` in `Helpers/auth.php` validates the token on every authenticated request.
- Controllers call `$this->getAuthToken()` which checks the Bearer header first, then the cookie (for API routes called from JS).
- Auth checks belong in **controller methods**, not constructors — the router instantiates all controllers at registration time.

---

## CSRF protection

- Every HTML form includes `<input type="hidden" name="_csrf_token" value="...">`.
- `index.php` validates the token on all page-level POSTs before routing.
- API routes call `Controller::verifyCsrf()` explicitly.
- For JavaScript API calls (fetch/DELETE), use the `csrfUrl()` helper to append `_csrf_token` as a query parameter — Galvani drops custom headers on multipart and DELETE requests.

---

## Popover dialogs

All dialogs use the native **Popover API** (`<div popover="manual">`). There are no custom overlay divs, no `alert()`, no `confirm()`.

Five shared partials are included in `layouts/app.php` and available on every page:

| File | JS function |
|---|---|
| `shared/alert-dialog.php` | `showAlert(msg, opts)` |
| `shared/confirm-dialog.php` | `showConfirm(msg, opts)` → `Promise<boolean>` |
| `shared/prompt-dialog.php` | `showPrompt(msg, opts)` → `Promise<string\|null>` |
| `shared/cancel-booking-dialog.php` | cancel booking flow |
| `shared/room-booking-dialog.php` | meeting room booking form |

Before writing any new dialog, check whether one of these already covers the use case.
