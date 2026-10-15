# WFCS Booking — Developer Guide

A complete reference for developers working on the WFCS Booking system. Read this before touching any code.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Prerequisites and Local Setup](#2-prerequisites-and-local-setup)
3. [Project Structure](#3-project-structure)
4. [Request Lifecycle](#4-request-lifecycle)
5. [Architecture Layers](#5-architecture-layers)
6. [The 13 Galvani Rules](#6-the-13-galvani-rules)
7. [Database](#7-database)
8. [Key Business Flows](#8-key-business-flows)
9. [Frontend Patterns](#9-frontend-patterns)
10. [Security](#10-security)
11. [Testing](#11-testing)
12. [MCP Servers](#12-mcp-servers)
13. [Build and Deploy](#13-build-and-deploy)
14. [Scheduled Tasks (Cron Jobs)](#14-scheduled-tasks-cron-jobs)

---

## 1. Project Overview

**WFCS Booking** is the activity and resource booking system for **The Well Foundation** (Scottish Charity SC040105), a community sports and wellbeing organisation based in Bellshill and Eurocentral, Scotland.

The system lets members book fitness classes and community activities, hire meeting rooms, and manage their accounts. Admins manage bookings, payments, Gift Aid, waitlists, and notifications.

### What it does

- Customer-facing booking for sports/fitness sessions (individual and block), with waitlisting
- Meeting room hire with time-slot-based availability
- Stripe payment integration with account credit priority
- Gift Aid declaration and HMRC-claim tracking
- Email notifications via SMTP or Resend (driver-switchable; SMTP uses stream_socket_client, no Composer dep)
- Admin/instructor portal for attendance, refunds, GDPR, and reporting

### Who uses it

| Role | What they do |
|---|---|
| customer | Browse activities, book sessions, manage account, pay via Stripe or credit |
| instructor | View their assigned sessions, mark attendance, track stats |
| admin | Manage bookings, users, resources, attendance |
| super_admin | Everything admin can do, plus payments, settings, Stripe keys, email config |

### Tech stack

| Layer | Technology |
|---|---|
| PHP runtime (dev) | Galvani — async multi-threaded, embedded MariaDB |
| PHP runtime (prod) | shared LAMP — Apache, PHP 8+, MySQL/MariaDB |
| Language | PHP 8.0+ |
| Database | MariaDB (via Galvani embedded socket / LAMP MySQL) |
| Frontend | HTML + TailwindCSS v4 + Vanilla JS |
| Payments | Stripe (PHP SDK via Composer, keys stored encrypted in DB) |
| Email | SMTP (`stream_socket_client`, core PHP) or Resend HTTP API — driver-switchable via admin UI |
| CSS build | TailwindCSS CLI via npm |
| Tests | PHPUnit 10 (unit tests only, no DB integration tests) |

### Dual-deploy strategy

The codebase runs in two environments with different characteristics:

**Local development (Galvani):** Long-running multi-threaded PHP process. Embedded MariaDB accessed via Unix socket. PHP classes cached in memory between requests — restart required after editing PHP class files. Views are re-read on each request, no restart needed.

**Production (LAMP):** Standard Apache + PHP-FPM. TCP connection to MySQL. No long-running singleton issues — each request gets a fresh PHP process. Runs the same `Database.php` (emulated prepares, explicit `sql_mode`), connecting over TCP because `config/env.php` sets `DB_HOST`.

`build.sh` packages the app (`dist/`) and exports the database for phpMyAdmin (`db-export/`). See section 13.

---

## 2. Prerequisites and Local Setup

### What you need

- **Galvani binary** — place the `galvani` binary in the git root (`booking/`). It is not committed to the repo. Obtain it separately.
- **Node 20+** — for the TailwindCSS CLI build
- **PHP 8.0+** — Galvani bundles this, but PHP also needs to be on `$PATH` for `composer` and `phpunit`
- **Composer** — for PHP dependencies (PHPUnit, Stripe SDK). Installed at the git root, not inside `booking/booking/`

### Clone and install

```bash
git clone <repo-url> booking
cd booking/booking   # all project files live in the app subfolder

# Install PHP dependencies (PHPUnit + Stripe SDK)
composer install

# Install Node dependencies (TailwindCSS)
npm install
```

### Environment file

`booking/booking/.env` is gitignored. Copy and fill in:

```
# Galvani runtime (local dev only — ignored on LAMP)
GALVANI_MYSQL=1
GALVANI_MYSQL_DATADIR=/absolute/path/to/booking/data/mysql
GALVANI_MYSQL_SOCKET=/absolute/path/to/booking/data/mysql.sock

# App
APP_ENV=development
APP_DEBUG=true
APP_KEY=your_64_char_hex_key_here      # 32 random bytes, hex-encoded
JWT_SECRET=your_jwt_secret_here

# Database (leave DB_HOST blank to use socket on Galvani)
DB_NAME=booking_app
DB_USER=root
DB_PASS=
DB_HOST=
DB_PORT=3306

REALTIME_ENABLED=true
```

The Galvani MySQL paths must be **absolute** and point to the git root's `data/` directory. This is because `./galvani` loads the app's `.env` (not the git root's), and relative paths would resolve to the wrong directory.

To generate `APP_KEY`:
```bash
php -r "echo bin2hex(random_bytes(32)) . PHP_EOL;"
```

### First-time database setup

```bash
# From the git root (parent of booking/)
./galvani booking/db-init.php   # Wipe + reimport schema + seeds
./galvani                       # Start server — app at http://localhost:8080/booking/
```

### Confirm it works

```
http://localhost:8080/booking/ → Login page
http://localhost:8080/booking/activities → Activities list (after login)
http://localhost:8080/booking/admin → Admin dashboard
```

Test accounts (all password: `password123`):

| Email | Role |
|---|---|
| customer@booking.local | customer |
| customer2@booking.local | customer |
| parent.alex@booking.local | customer |
| instructor@booking.local | instructor |
| admin@booking.local | admin |
| superadmin@booking.local | super_admin |

---

## 3. Project Structure

```
booking/                          # Git root (local Galvani workspace — not pushed to GitHub)
├── galvani                       # Galvani binary (gitignored — obtain separately)
├── .env                          # Galvani thread count only (gitignored)
├── data/                         # Embedded MariaDB data files (gitignored)
├── EXAMPLE-CLAUDE.md             # Template for new Galvani projects
│
└── booking/                      # THE APP — its own GitHub repo when deployed
    ├── index.php                 # Single entry point — all requests arrive here
    ├── db-init.php               # Full DB reset (run via ./galvani booking/db-init.php)
    ├── composer.json             # PHP deps: Stripe SDK, PHPUnit
    ├── phpunit.xml               # PHPUnit config
    ├── package.json              # Node deps: TailwindCSS CLI
    ├── build.sh                  # Builds dist/ for LAMP deployment
    ├── .env                      # App vars + Galvani MySQL paths (gitignored)
    ├── .htaccess                 # Apache rewrite rules for LAMP
│   │
│   ├── app/
│   │   ├── Controllers/          # HTTP layer — thin orchestrators
│   │   │   ├── Controller.php    # Abstract base (auth, json(), redirect(), verifyCsrf())
│   │   │   ├── ActivityController.php
│   │   │   ├── AdminController.php
│   │   │   ├── AuthController.php
│   │   │   ├── BookingController.php
│   │   │   ├── InstructorController.php
│   │   │   └── RealtimeController.php
│   │   │
│   │   ├── Services/             # Business logic — call repositories, no direct SQL
│   │   │   ├── ActivityService.php
│   │   │   ├── AppStorage.php    # Thread-safe in-memory key-value store (Galvani)
│   │   │   ├── AttendanceService.php
│   │   │   ├── AuthService.php
│   │   │   ├── BookingService.php
│   │   │   ├── GiftAidService.php
│   │   │   ├── JWT.php           # HS256 JWT encode/decode
│   │   │   ├── NotificationService.php  # Orchestrates email (SMTP or Resend) + in-app
│   │   │   ├── ParticipantService.php
│   │   │   ├── PaymentService.php       # Stripe + account credit
│   │   │   ├── ReportService.php
│   │   │   ├── ResendService.php        # Email via Resend HTTP API
│   │   │   ├── SmtpService.php          # Email via SMTP (stream_socket_client, STARTTLS/SSL)
│   │   │   ├── RoomHireService.php
│   │   │   ├── SessionService.php
│   │   │   ├── UploadService.php        # Image upload validation + move
│   │   │   └── WebSocketService.php     # Real-time (Galvani only)
│   │   │
│   │   ├── Repositories/         # All SQL lives here — SELECT/INSERT/UPDATE/DELETE
│   │   │   ├── ActivityRepository.php
│   │   │   ├── AppSettingsRepository.php
│   │   │   ├── AttendanceRepository.php
│   │   │   ├── AuditLogRepository.php
│   │   │   ├── BookingRepository.php
│   │   │   ├── GdprConsentRepository.php
│   │   │   ├── GiftAidRepository.php
│   │   │   ├── NotificationRepository.php
│   │   │   ├── NotificationSubscriptionRepository.php
│   │   │   ├── ParticipantRepository.php
│   │   │   ├── PaymentRepository.php
│   │   │   ├── RoomHireRepository.php
│   │   │   ├── SessionRepository.php
│   │   │   ├── SpaceRepository.php
│   │   │   ├── SpaceReservationRepository.php
│   │   │   ├── UserRepository.php
│   │   │   ├── VenueRepository.php
│   │   │   └── WithdrawalRepository.php
│   │   │
│   │   ├── Models/
│   │   │   └── Database.php          # PDO singleton for Galvani (socket) and LAMP (TCP)
│   │   │
│   │   ├── Helpers/              # Global functions loaded on every request
│   │   │   ├── auth.php          # getAuthUser(), setAuthCookie(), getCsrfToken(), buildNavForRole()
│   │   │   ├── calendar_helper.php
│   │   │   ├── config.php        # config() helper + env() wrapper
│   │   │   ├── date_helper.php
│   │   │   ├── environment.php   # isGalvani(), isLAMP(), isDevelopment()
│   │   │   ├── gift_aid_helper.php
│   │   │   ├── helpers.php       # e(), encryptSetting(), decryptSetting()
│   │   │   ├── validation.php    # isValidEmail(), isValidPhoneNumber(), isValidPostcode()
│   │   │   └── view.php          # render() helper
│   │   │
│   │   ├── Routes/               # Page routing — includes views for matched paths
│   │   │   ├── admin.php         # /admin/* page routes
│   │   │   ├── customer.php      # /activities, /bookings, /account/* routes
│   │   │   └── instructor.php    # /instructor/* routes
│   │   │
│   │   ├── Views/
│   │   │   ├── layouts/app.php       # Main layout shell (nav, shared dialogs)
│   │   │   ├── partials/             # Sub-components included by views
│   │   │   │   ├── head.php
│   │   │   │   ├── header.php
│   │   │   │   ├── footer.php
│   │   │   │   ├── scripts.php
│   │   │   │   └── atoms/            # Small reusable fragments
│   │   │   ├── shared/               # Global dialogs — already in layout, do NOT re-include
│   │   │   │   ├── alert-dialog.php
│   │   │   │   ├── confirm-dialog.php
│   │   │   │   ├── prompt-dialog.php
│   │   │   │   ├── cancel-booking-dialog.php
│   │   │   │   └── room-booking-dialog.php
│   │   │   ├── admin/            # Admin views
│   │   │   ├── customer/         # Customer views
│   │   │   ├── instructor/       # Instructor views
│   │   │   └── errors/404.php
│   │   │
│   │   └── Router.php            # API router (GET/POST/PUT/PATCH/DELETE)
│   │
│   ├── config/
│   │   ├── app.php               # App config (timezone, JWT expiry, feature flags)
│   │   ├── database.php          # DB config (auto-detects socket path for Galvani)
│   │   ├── stripe.php            # Stripe config (keys now in DB, this is a stub)
│   │   ├── smtp.php              # Email from-address config stub
│   │   └── env-shared.example.php        # Template for the server's config/env.php (the only file edited there)
│   │
│   ├── css/
│   │   ├── tailwind.css          # TailwindCSS source (input)
│   │   └── output.css            # Compiled CSS (output — checked in for convenience)
│   │
│   ├── uploads/                  # User-uploaded images (gitignored contents)
│   │   ├── activities/
│   │   └── venues/
│   │
│   ├── storage/sessions/         # PHP session files (gitignored)
│   └── logs/                     # Runtime logs (gitignored)
│       └── emails.log            # Email log when no driver is configured
│
├── database/
│   ├── schema.sql                # MariaDB schema — source of truth
│   ├── seeds-customers.sql       # Fictional customer seed data (committed)
│   └── seeds-wfcs-data.sql       # Real staff/activity/venue data (gitignored — never commit)
│
├── tests/
│   ├── bootstrap.php             # PHPUnit bootstrap (sets JWT_SECRET, APP_KEY)
│   └── Unit/                     # Pure unit tests (no DB)
│       ├── AuthHelperTest.php
│       ├── CsvSafeTest.php
│       ├── DateHelperTest.php
│       ├── GiftAidHelperTest.php
│       ├── HelpersTest.php
│       ├── JWTTest.php
│       ├── RoomHireServiceTest.php
│       ├── SlugGeneratorTest.php
│       └── ValidationHelperTest.php
│
└── docs/
    ├── dev-guide.md              # This file
    ├── admin-guide.md
    ├── api-reference.md
    ├── wiki/
    └── plans/
```

### Key files explained

**`booking/booking/index.php`** — The single entry point for all web requests. Responsibilities:
1. Calculates `$basePath` from `$_SERVER['SCRIPT_NAME']`
2. Loads `.env` and all helper files
3. Registers the PSR-4 autoloader
4. Handles a small set of "bare" routes directly: login, logout, register, forgot-password, reset-password, terms, privacy
5. Detects route type (customer / instructor / admin / API) and delegates
6. Page routes go to `app/Routes/{role}.php` (which includes views)
7. API routes go to `Router.php` and then Controllers

**`booking/booking/app/Router.php`** — Lightweight API router. Registers named routes with path patterns (`/api/bookings/:id`), matches method + path regex, extracts parameters, and calls the handler. All API routes are registered in a `createRouter()` function.

**`booking/build.sh`** — Builds `dist/` for LAMP deployment and/or a phpMyAdmin installer in `db-export/` (schema.sql structure + a cleaned copy of the local data). See section 13.

**`booking/db-init.php`** — Wiping and re-seeding the local database. Preserves `app_settings` (Stripe keys etc.) before wipe. Run via `./galvani db-init.php`.

---

## 4. Request Lifecycle

### Full journey for a page request

```
Browser GET /booking/admin/bookings
         |
         v
booking/booking/index.php
  1. basePath = "/booking"          (from SCRIPT_NAME)
  2. Load .env -> $_ENV
  3. Require all Helpers/*.php
  4. Register spl_autoload
  5. Strip basePath -> request_uri = "/admin/bookings"
  6. Detect route type -> $isAdminRoute = true
  7. getAuthUser() -> verify JWT cookie -> get user row
  8. Cache-Control: no-store (prevent bfcache on auth pages)
  9. buildNavForRole($user['role'], $request_uri)
 10. include app/Routes/admin.php
         |
         v
app/Routes/admin.php
  - Match $request_uri against route strings
  - requireAuthRole('admin')        (redirects if wrong role)
  - Instantiate controller
  - Call controller method
         |
         v
AdminController::bookings()
  - requireVerifiedRole('admin')    (token decode + DB verify)
  - Call BookingService::getAllBookings($filters)
         |
         v
BookingService::getAllBookings()
  - Validate/apply filters
  - Call BookingRepository::findAll($filters)
         |
         v
BookingRepository::findAll()
  - Build SQL query
  - $this->db->query($sql, $params)
         |
         v
Database::getInstance()->query()
  - PDO prepare + execute
  - Return array of rows
         |
         v (back up through layers)
AdminController::bookings()
  - render('admin/bookings', ['bookings' => $data, ...])
         |
         v
app/Views/admin/bookings.php
  - include layouts/app.php
  - Output HTML
         |
         v
HTTP response -> Browser
```

### Full journey for an API request

```
Browser POST /booking/api/bookings   (JSON body, auth cookie)
         |
         v
index.php
  - Strips basePath -> "/api/bookings"
  - Not a customer/instructor/admin page route
  - Falls through to Router dispatch
         |
         v
Router::dispatch('POST', '/api/bookings')
  - Match pattern -> call handler
         |
         v
BookingController::createBooking()
  - requireAuth()           -> verifyCsrf() + JWT decode + password invalidation check
  - getJsonBody()
  - bookingService->createBooking(...)
  - paymentService->applyCredit(...)
  - json($result, 201)
```

### basePath calculation

```php
// index.php
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';   // e.g. "/booking/index.php"
$basePath = rtrim(dirname($scriptName), '/\\'); // e.g. "/booking"
```

This works for both Galvani (served from `/booking/`) and LAMP (`/booking/` or bare `/`). Never hardcode `/booking` anywhere — always prefix URLs with `$basePath`.

### Auth token flow

1. Login: `AuthService::login()` verifies bcrypt, issues JWT via `JWT::encode()`
2. `setAuthCookie($token)` writes `auth_token` cookie: HttpOnly, SameSite=Strict, Secure on HTTPS
3. Subsequent requests: `getAuthUser()` (views) or `requireAuth()` / `requireVerifiedRole()` (API) reads cookie
4. JWT payload: `{user_id, email, role, iat, exp}`
5. Password invalidation: if `users.password_changed_at > JWT.iat`, token is rejected immediately
6. Token expiry: 120 minutes; rolling refresh — each page navigation resets the clock; JS idle timer logs out after 120 minutes of inactivity
7. Logout: `GET /logout` calls `clearAuthCookie()` then redirects to `/`

---

## 5. Architecture Layers

The codebase enforces a strict 3-layer architecture. Violating the layer boundaries creates coupling that is painful to maintain and test.

### Controllers — the HTTP layer

**Rules:**
- Extend `Controller` and always call `parent::__construct()`
- Never put auth checks in the constructor — the Router instantiates ALL controllers at registration. An `exit()` in a constructor kills every route.
- Auth in methods: `requireAuth()` for any authenticated user, `requireVerifiedRole('admin')` for role-restricted endpoints
- Keep controllers thin — under ~200 lines ideally. If a method grows beyond 30 lines, most of that logic belongs in a Service
- Return JSON with `$this->json($data)` or `$this->jsonError($msg)`, redirect with `$this->redirect($url)`, or render a view with `render('path/to/view', $data)`

**What belongs in a controller:**
- Parsing request input (`getJsonBody()`, `$_POST`, `$_GET`)
- Calling one or more Services
- Deciding what response to return
- Error handling at the boundary (catch exceptions, return appropriate HTTP status)

```php
// Correct: thin controller
public function createBooking(): void
{
    try {
        $userId = $this->requireAuth();              // auth check
        $body   = $this->getJsonBody();              // parse input
        $result = $this->bookingService->createBooking(...); // delegate
        $this->json($result, 201);                   // respond
    } catch (\Exception $e) {
        $this->jsonError($e->getMessage(), 400);
    }
}
```

```php
// Wrong: business logic in controller
public function createBooking(): void
{
    $userId = $this->requireAuth();
    $db = Database::getInstance();               // NO: direct DB in controller
    $activity = $db->queryOne('SELECT ...');     // NO: SQL in controller
    if ($activity['capacity'] <= ...) { ... }   // NO: business logic in controller
}
```

### Services — the business logic layer

**Rules:**
- No direct `$this->db->query()` in Services. All data access goes through Repositories.
- Services call Repositories and other Services. They enforce business rules, validate constraints, and coordinate multi-step operations.
- One Service per domain: `BookingService`, `PaymentService`, `AuthService`, etc.

**What belongs in a Service:**
- Eligibility checks (age restrictions, duplicate bookings, capacity)
- Price calculation
- Orchestrating multi-step operations (e.g. create booking + apply credit + notify)
- Domain exceptions (`throw new \Exception('Already booked for this session')`)

```php
// Correct: business logic in service
class BookingService
{
    public function createBooking(int $userId, int $participantId, ...): array
    {
        $activity = $this->activityService->getActivityById($activityId);  // via service
        if (!$this->activityService->isEligible($activityId, $participantId)) {
            throw new \Exception('Participant does not meet age requirements');  // domain rule
        }
        $bookingId = $this->bookingRepo->create([...]);  // via repository
        return ['booking_id' => $bookingId, ...];
    }
}
```

### Repositories — the data layer

**Rules:**
- ALL SQL lives in Repositories. No SQL in Controllers or Services.
- Each Repository owns one domain: `BookingRepository` handles the `bookings` table.
- Use `Database::getInstance()` — never `new Database()`.
- Return plain arrays. No domain objects.

**What belongs in a Repository:**
- SELECT queries
- INSERT / UPDATE / DELETE
- Filtering, pagination, JOIN queries
- Never business logic — just data retrieval and mutation

```php
// Correct: SQL in repository
class BookingRepository
{
    public function findByUser(int $userId, array $filters = []): array
    {
        $sql = 'SELECT b.*, a.title FROM bookings b
                JOIN activities a ON b.activity_id = a.id
                WHERE b.user_id = ?';
        $params = [$userId];

        if (!empty($filters['status'])) {
            $sql .= ' AND b.booking_status = ?';
            $params[] = $filters['status'];
        }

        return $this->db->query($sql, $params);
    }
}
```

```php
// Wrong: SQL in service
class BookingService
{
    public function getUserBookings(int $userId): array
    {
        // NO: SQL does not belong in a service
        return $this->db->query('SELECT * FROM bookings WHERE user_id = ?', [$userId]);
    }
}
```

**Notable repositories:**

| Repository | Table(s) | Notes |
|---|---|---|
| `AppSettingsRepository` | `app_settings` | Key-value store for admin-configurable settings. Use `get($key)`, `set($key, $value)`, `getMultiple($keys[])`. All Stripe keys, mail driver and SMTP credentials go through this class. |
| `NotificationSubscriptionRepository` | `user_notification_subscriptions` | CRUD for per-user event notification preferences. Manages activity/session-specific subscriptions for admins and instructors. |
| `BookingRepository` | `bookings` | Core booking CRUD, filters, block-booking queries. |
| `PaymentRepository` | `payments`, `account_credit_transactions` | Payment records and credit ledger writes. |
| `SessionRepository` | `sessions` | Session generation, availability queries. |
| `UserRepository` | `users`, `participants` | User and participant CRUD, role lookups. |

### Views — the display layer

**Rules:**
- Views display data. They do not contain business logic.
- Never call Services or Repositories from a view.
- Use the `e()` helper for all output: `<?= e($user['name']) ?>`
- Use `$basePath` for all internal links: `href="<?= $basePath ?>/bookings"`
- TailwindCSS classes only — no `style=""` attributes, ever
- No `innerHTML` / `outerHTML` — use DOM methods in JavaScript (see Section 9)
- All dialogs use the Popover API — see Section 9

---

## 6. The 13 Galvani Rules

Galvani is a long-running multi-threaded PHP process. PHP classes are cached in memory between requests. The database connection is a singleton that persists across the lifetime of a thread. These facts make certain common PHP patterns silently dangerous.

Each rule below includes the failure mode if violated.

---

### Rule 1: No Explicit Transactions

**The rule:** Never call `beginTransaction()`, `commit()`, or `rollBack()`. Do not define these methods on `Database`. Use autocommit for all writes.

**Why it breaks:** In a multi-threaded runtime, a transaction opened on thread A is only visible to thread A until it commits. Because the singleton connection persists across requests, a transaction from request 1 on thread A remains open when request 2 arrives on thread A. Data committed in the transaction appears committed on thread A but is invisible to threads B, C, D — producing phantom bugs where writes appear to succeed but data is missing when read back.

```php
// Correct
$this->db->execute('INSERT INTO bookings ...', [...]);
$this->db->execute('UPDATE users SET credit = ? WHERE id = ?', [...]);

// Wrong
$this->db->beginTransaction();
$this->db->execute('INSERT INTO bookings ...');
$this->db->commit();
```

---

### Rule 2: Singleton DB Always

**The rule:** Use `Database::getInstance()` everywhere. Never `new Database()`.

**Why it breaks:** Galvani has a fixed-size connection pool. Each `new Database()` consumes one connection permanently. Under load, the pool exhausts and all requests block indefinitely waiting for a free connection.

```php
// Correct
class BookingRepository
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }
}

// Wrong
$db = new Database();   // exhausts connection pool
```

---

### Rule 3: Emulated Prepares Only

**The rule:** The Galvani `Database.php` sets `PDO::ATTR_EMULATE_PREPARES => true`. Do not change this. Do not set `ATTR_EMULATE_PREPARES => false` in the Galvani version.

**Why it breaks:** Galvani's embedded MySQL driver corrupts `DATE` and `TIME` column values when native prepared statements are used. Dates come back as `0000-00-00` or blank. This is a driver-level bug in the embedded MariaDB that emulated prepares work around by converting everything to strings before sending.

The same class runs on LAMP: emulated prepares are safe on standard MySQL, and shipping the tested configuration means values come back as strings everywhere, as the code expects.

```php
// Correct (Galvani Database.php)
$this->connection = new PDO($dsn, $username, $password, [
    PDO::ATTR_EMULATE_PREPARES => true,
]);

// Wrong
$this->connection = new PDO($dsn, $username, $password, [
    PDO::ATTR_EMULATE_PREPARES => false,  // corrupts DATE/TIME on Galvani
]);
```

---

### Rule 4: No PHP Booleans in SQL Parameters

**The rule:** Use integer literals `1` and `0` in SQL parameter arrays. Never pass PHP `true` or `false`.

**Why it breaks:** With emulated prepares, PHP `false` is cast to the empty string `''` before being sent to MySQL. Inserting `''` into a `TINYINT(1)` column produces `0`, but the real problem is querying: `WHERE is_waiting_list = ''` matches nothing and is not a valid comparison. No SQL `TRUE`/`FALSE` literals either — MariaDB may interpret them unexpectedly with emulated prepares.

```php
// Correct
$this->db->execute(
    'INSERT INTO bookings (is_waiting_list) VALUES (?)',
    [1]   // integer 1
);

// Wrong
$this->db->execute(
    'INSERT INTO bookings (is_waiting_list) VALUES (?)',
    [true]   // becomes '' with emulated prepares
);

// Also wrong
$this->db->execute(
    'INSERT INTO bookings (is_waiting_list) VALUES (TRUE)'  // avoid SQL booleans too
);
```

---

### Rule 5: LIMIT and OFFSET Must Be Interpolated

**The rule:** Build `LIMIT` and `OFFSET` clauses by string interpolation with an explicit `(int)` cast. Never pass them as `?` parameters.

**Why it breaks:** Emulated prepares quote every parameter as a string. MySQL receives `LIMIT '10'` which is a syntax error — `LIMIT` does not accept quoted values. The query fails silently (PDO exception logged, empty result returned).

```php
// Correct
$limit  = (int)($params['limit']  ?? 20);
$offset = (int)($params['offset'] ?? 0);
$sql = 'SELECT * FROM bookings WHERE user_id = ? '
     . 'LIMIT ' . $limit . ' OFFSET ' . $offset;
$results = $this->db->query($sql, [$userId]);

// Wrong
$sql = 'SELECT * FROM bookings WHERE user_id = ? LIMIT ? OFFSET ?';
$results = $this->db->query($sql, [$userId, 20, 0]);  // LIMIT '20' = syntax error
```

---

### Rule 6: READ COMMITTED Isolation Level

**The rule:** The `Database.php` constructor must execute:

```php
$this->connection->exec('SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED');
```

**Why it matters:** MariaDB's default isolation level is REPEATABLE READ. In a long-running process, the first `SELECT` on a connection establishes a consistent read snapshot — subsequent SELECTs on the same connection see the same snapshot even if other threads commit new data. This means a Galvani thread serving request 2 might read stale data that was already updated by request 1. READ COMMITTED ensures each SELECT sees the latest committed rows.

---

### Rule 7: Restart Galvani After PHP Class Changes

**The rule:** After editing any PHP class file (Controllers, Services, Repositories, Models, Helpers that contain classes), stop and restart Galvani with `./galvani`. View files (`.php` in `Views/`) are re-read on every request and do not require a restart.

**Why it breaks:** Galvani loads and caches PHP class definitions in memory on startup. Changes to class files are invisible until the process restarts. Editing `BookingService.php` and testing immediately will still run the old code. This is a common source of confusion — the change appears correct but has no effect.

```bash
# After editing any Controller, Service, Repository, or Model:
# Stop Galvani (Ctrl+C), then restart:
./galvani

# After editing a View file only:
# No restart needed — just refresh the browser
```

---

### Rule 8: Minimum 4 Threads

**The rule:** Always run Galvani with at least 4 threads. The default `./galvani` uses the default thread count which is sufficient. Never use `--threads 1`.

**Why it breaks:** Some operations use internal async callbacks that require a free thread to complete. With only 1 thread, these operations deadlock — the current thread is blocked waiting for a callback that can never execute because there are no other threads to handle it.

---

### Rule 9: No Auth in Controller Constructors

**The rule:** Never put authentication checks (especially any that call `exit()` or `header('Location: ...')`) in a controller's `__construct()` method.

**Why it breaks:** `createRouter()` in `Router.php` instantiates every registered controller at startup. If `BookingController::__construct()` calls `exit()` because the user is not authenticated, all routes registered after `BookingController` are never registered. The server serves a blank page for all those routes.

```php
// Correct — auth in each method
class BookingController extends Controller
{
    public function __construct()
    {
        parent::__construct();  // safe — no auth
        $this->bookingService = new BookingService();
    }

    public function createBooking(): void
    {
        $userId = $this->requireAuth();  // auth check here, in the method
        // ...
    }
}

// Wrong — auth in constructor
class BookingController extends Controller
{
    public function __construct()
    {
        parent::__construct();
        $userId = $this->requireAuth();  // kills all routes if not authenticated
    }
}
```

---

### Rule 10: Multi-Step Writes in the Same Request

**The rule:** When a business operation requires multiple INSERT/UPDATE statements that depend on each other (e.g. create booking, then create payment record linking to that booking), do all of them in a single request handler. Do not split them across separate API calls.

**Why it breaks:** Galvani routes requests to threads non-deterministically. Two requests from the same browser may land on different threads. Because there are no transactions, there is no guarantee of atomicity across requests. Cross-request dependencies silently fail when the dependent write arrives before the first write is visible to that thread.

```php
// Correct — both writes in one handler
public function createBooking(): void
{
    $bookingId = $this->bookingService->createBooking(...);   // write 1
    $this->paymentRepo->linkToBooking($intentId, $bookingId); // write 2 — same request
    $this->json(['booking_id' => $bookingId], 201);
}

// Wrong — split across requests
// Request 1: POST /api/bookings -> creates booking
// Request 2: POST /api/payments -> tries to link payment, but booking may not be visible yet
```

---

### Rule 11: DELETE Bodies Are Stripped

**The rule:** Never send data in the body of a DELETE request. Pass parameters as query string (`?id=123`) and read them from `$_GET` on the server.

**Why it matters:** RFC 9110 explicitly states that DELETE request bodies have no defined semantics and intermediaries SHOULD NOT send them. Proxies, CDNs, WAFs, and Galvani itself follow the spec and silently discard DELETE bodies. Any data you put in a DELETE body will not arrive at the handler.

```php
// Correct
// Client sends: DELETE /api/bookings/123?_csrf_token=abc
// Server reads:
$bookingId = (int)($_GET['id'] ?? 0);

// Wrong
// Client sends: DELETE /api/bookings with JSON body {"id": 123}
// Body is silently stripped — bookingId will be 0
```

---

### Rule 12: CSRF Token via Query Parameters

**The rule:** Use the `csrfUrl()` JavaScript helper to append the CSRF token to all API URLs. HTML forms use a hidden `_csrf_token` field. Do not rely on custom request headers for CSRF — Galvani drops custom headers on multipart and DELETE requests.

**Why it matters:** The standard approach (custom `X-CSRF-Token` header) fails for multipart form uploads and DELETE requests because Galvani follows the spec and does not forward custom headers for those request types.

```javascript
// Correct — CSRF token in query param
function csrfUrl(path) {
    const token = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
    return path + (path.includes('?') ? '&' : '?') + '_csrf_token=' + encodeURIComponent(token);
}

// Usage in a fetch call:
fetch(csrfUrl('/api/bookings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
});
```

```html
<!-- Correct — HTML form includes hidden field -->
<form method="POST" action="<?= $basePath ?>/admin/activities/create">
    <input type="hidden" name="_csrf_token" value="<?= e($csrfToken) ?>">
    <!-- other fields -->
</form>
```

The server validates in priority order: `X-CSRF-Token` header then `_csrf_token` POST field then `_csrf_token` query param.

---

### Rule 13: Socket Path Depends on Who Is Running

**The rule:** The Galvani MySQL socket is at `data/mysql.sock` relative to the **git root**. The correct path depends on where PHP's `getcwd()` points:

| Context | `getcwd()` result | Correct socket path |
|---|---|---|
| Web request | `booking/booking/` (app subfolder) | `dirname(getcwd()) . '/data/mysql.sock'` |
| CLI (db-init.php etc.) | `booking/` (git root) | `getcwd() . '/data/mysql.sock'` |

**Why it breaks:** Using `dirname(dirname(getcwd()))` in a web request goes two levels up (past the git root) and produces "No such file or directory". Using `getcwd() . '/data/mysql.sock'` in a web request points to `booking/booking/data/mysql.sock` which does not exist.

The `config/database.php` file handles this automatically:

```php
// config/database.php — automatic socket detection
'socket' => (basename(getcwd()) === 'booking' && basename(dirname(getcwd())) === 'booking')
    ? dirname(getcwd()) . '/data/mysql.sock'  // Web: booking/booking/ -> go up to git root
    : getcwd() . '/data/mysql.sock',          // CLI: already at git root
```

---

## 7. Database

### Connection classes

One `Database.php` serves both environments. It connects over TCP when `DB_HOST` is set (LAMP, via `config/env.php`) and over the Unix socket otherwise (Galvani). On every connection it sets `READ COMMITTED` and an explicit `sql_mode` (`STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`), so MySQL 8's stricter defaults (`ONLY_FULL_GROUP_BY`, `NO_ZERO_DATE`) don't change how queries behave. `groups` is a reserved word in MySQL 8: always write the table as `` `groups` ``.

### Database methods

```php
$db = Database::getInstance();

// Return all matching rows as array of associative arrays
$rows = $db->query('SELECT * FROM bookings WHERE user_id = ?', [$userId]);

// Return first row (or null if no match)
$booking = $db->queryOne('SELECT * FROM bookings WHERE id = ?', [$id]);

// Return first column of first row — for COUNT(*), SUM(), single values
$count = $db->scalar('SELECT COUNT(*) FROM bookings WHERE user_id = ?', [$userId]);

// Execute INSERT/UPDATE/DELETE — returns bool
$ok = $db->execute('UPDATE users SET credit = ? WHERE id = ?', [$amount, $userId]);

// Get auto-increment ID of last INSERT
$newId = $db->lastInsertId();
```

### Key table groups

**Users and auth:**

| Table | Purpose |
|---|---|
| `users` | User accounts. Roles: customer, instructor, admin, super_admin. Flags: `is_customer` (shows customer nav for staff), `is_global_instructor` (instructor shown on all activities/sessions) |
| `participants` | Bookable people (self + children). Linked to user |
| `gdpr_consents` | UK GDPR consent records per user per consent type |
| `audit_logs` | Login attempts, password resets, payment events |

**Activities and sessions:**

| Table | Purpose |
|---|---|
| `venues` | Physical locations (Bellshill, Eurocentral) |
| `bookable_spaces` | Rooms/pitches within venues. `space_type` includes `room_hire` |
| `activity_types` | Categories: sports, classes, outdoor, indoor, meeting_room |
| `activities` | Programmes. Has `slug` (unique), `capacity`, `price_per_session`, `allow_waiting_list`. No direct `instructor_id` — instructors managed via `activity_instructors` |
| `activity_instructors` | Junction table: activity ↔ instructor. `is_primary=1` for primary instructor, `0` for co-instructors. Global instructors (flag on `users`) appear on all sessions |
| `activity_images` | Multiple images per activity. `is_thumbnail` flag |
| `sessions` | Individual dated occurrences of an activity. No `instructor_id` column — inherited from `activity_instructors` |

**Bookings and payments:**

| Table | Purpose |
|---|---|
| `bookings` | Core booking record. `booking_type` (individual/block), `is_waiting_list`, `booking_status` |
| `payments` | Stripe payment intent records |
| `account_credit_transactions` | Credit ledger. `transaction_type`: topup, deduction, refund, admin_adjustment |
| `attendance_logs` | Attendance records per booking per session |
| `discount_codes` | Discount codes. `type`: percentage/fixed (manual entry), third_child_free/bulk_session (auto). `min_sessions` used by bulk_session for "every Nth free" calculation |
| `discount_code_restrictions` | Chip-based scope filters. `axis` (activity/activity_type/venue/account_type/staff_role/user/booking_type) + `value_id` / `value_text`. OR within an axis, AND across axes. No rows = unrestricted. A `user` or `staff_role` row makes the code auto-apply at checkout |
| `discount_code_usages` | Per-booking usage log for discount codes |

**Notifications:**

| Table | Purpose |
|---|---|
| `notification_subscriptions` | Staff/admin subscriptions to event types per activity/session |
| `notification_logs` | Sent notification history |

**Settings:**

| Table | Purpose |
|---|---|
| `app_settings` | Key-value store for admin-configurable settings. Stripe keys, email driver config (Resend API key, SMTP credentials) — sensitive values encrypted with AES-256-GCM |
| `cache` | Generic key-value cache table |

**Groups:**

| Table | Purpose |
|---|---|
| `groups` | Independent participant rosters. `activity_id` is nullable (legacy). Has `min_age`/`max_age` for auto-assignment |
| `activity_groups` | Many-to-many: activity ↔ group assignment (preferred over `groups.activity_id`) |
| `group_participants` | Many-to-many: participant ↔ group membership |
| `session_groups` | Many-to-many: session ↔ group (restricts booking to group members only) |

**Gift Aid:**

| Table | Purpose |
|---|---|
| `gift_aid_declarations` | HMRC Gift Aid declaration per user (address required) |
| `gift_aid_claims` | Per-payment Gift Aid claim tracking. `claim_status`: eligible, claimed, received |

### Database reset

```bash
# Complete wipe + reimport (from git root)
bash db-reset.sh   # from the booking directory
```

`db-reset.sh` imports `schema.sql` → `seeds-wfcs-data.sql` → `seeds-customers.sql` (or `seeds-customers-live.sql` if present) via the mysql CLI directly, with FK checks disabled. This is the only reliable reset method — `./galvani db-init.php` does not persist data to the socket-accessible database.

**Manual single-file import:**
```bash
{ printf "SET FOREIGN_KEY_CHECKS=0;\n"; cat file.sql; printf "\nSET FOREIGN_KEY_CHECKS=1;\n"; } | mysql --socket=/path/to/mysql.sock -u root --skip-ssl booking_app
```

### Schema location

`booking/database/schema.sql` is the source of truth. The `build.sh` database export uses it for the structure, so keep the local database in step with it (see `wiki/Database.md`, schema drift).

---

## 8. Key Business Flows

### Walk-in attendees

An instructor records someone who turned up without an account or booking: `POST /instructor/sessions/{slug}/{date}/walk-in` → `WalkInService::validate()` → `WalkInService::add()`.

- **Checks, all before any write (autocommit):**
  - the instructor is on the activity (`belongsToInstructor`)
  - not room hire, and the session isn't in the future
  - the group is one the instructor can see
  - age, using a matched participant's stored DOB if there is one (`effectiveDob`), else the typed DOB (`ActivityService::isEligibleByDob`)
  - an existing email must belong to a **customer** account, and the typed parent/adult first and last name must match it (`holderMatchesAccount`, case/space-insensitive)
- **Account:** the email is looked up. A new email gets `createUser()` with a NULL `password_hash` (unverified), plus `createUserPreferences()` and `applyRoleChange(null, 'customer')`, which sets up the default reminder. An existing customer account is reused, and its records are never edited from instructor input.
- **Participant:** matched by `matchParticipant()` (an adult's self-participant, or a child with the same name and DOB), otherwise created.
- **Booking:** if the participant is already booked on the session, that booking is just marked attended. Otherwise a `createSessionBooking()` with:
  - `source = 'walk_in'`, `added_by_user_id`
  - `booking_status = 'confirmed'`, `payment_status = 'unpaid_attended'`, `amount_paid = price_per_session`

  Then `AttendanceService::markAttendance()` writes `attendance_logs`, which the register reads. Because the status isn't `pending`, `markAttendance()` sends no payment request of its own. Payment goes through the basket flow (`batch-pay` accepts `unpaid_attended`).
- **Groups:** `GroupService::addMember(..., 'regular', false)`. There's no auto-enrolment until payment, when `enrollAfterPayment()` takes over.
- **Email:**
  - **New account:** `NotificationService::sendWalkInWelcome()` (template `walk_in_welcome`) with `AuthService::createInviteUrl()`, a 7-day `password_reset` JWT carrying `invite: true`. A `new_user` subscriber alert is also sent.
  - **Existing account:** `sendPaymentRequest()`.
- **Set-up page:** `/reset-password?token=…` detects invites (`AuthService::isInviteToken`) and asks for the three consents (`partials/atoms/consent-toggles.php`). `resetPassword(..., $consents)` records them. `updatePasswordHash()` already sets `email_verified = 1`, and the existing `password_changed_at > iat` check makes the link single-use. Login refuses accounts with no password.
- **Instructor messages:** only `InvalidArgumentException` messages are shown. The success message is the same whether or not the account already existed.
- **Admin:** `/admin/bookings?source=walk_in`, a Walk-in badge, "Added by" on booking detail, and `POST /admin/bookings/{id}/resend-invite` (walk-in accounts with no password only).

### Booking creation

The flow differs by booking type. All paths go through `BookingController::createBooking()` then `BookingService::createBooking()`.

**Individual session booking:**

```
Client: POST /api/bookings
  { participant_id, activity_id, session_id, booking_type: "individual" }

BookingService::createBooking()
  1. Get activity — check exists, check space_type (room_hire uses separate path)
  2. Get participant — verify belongs to user
  3. Check parental consent if participant is a child
  4. Check age eligibility (min_age / max_age on activity)
  5. Verify session exists for this activity
  6. Check no duplicate booking (same participant + session)
  6a. Group restriction: if session has groups, participant must be a member — OR be
      a first-timer (age-eligible, no group for this activity yet; group assigned post-payment)
  7. Check capacity: if full and allow_waiting_list=true -> put on waitlist
  8. INSERT INTO bookings (booking_status='pending', is_waiting_list=0/1)
  9. Return { booking_ids, total_price, is_waiting_list }

BookingController (after createBooking returns):
  - If waitlisted -> return 201, no payment
  - If free (price=0) -> confirmMultipleBookings() -> sendBookingConfirmation() -> return 201
  - If paid:
      applyCredit(userId, price, bookingId)
      If remaining=0 -> confirmMultipleBookings() -> sendBookingConfirmation() -> return 201
      If remaining>0 -> createPaymentIntent(remaining) -> linkToBooking() -> return 201 with Stripe data
```

**Block booking:**

```
Client: POST /api/bookings
  { participant_id, activity_id, recurrence_start: sessionId, weeks: 6 }

BookingService (detected by recurrence_start + weeks):
  1. sessionRepo->findConsecutiveSessions(startSessionId, 6) -> list of session IDs
  2. For each session: check duplicate, check capacity
  3. Skip already-booked sessions (don't fail — block may partially overlap)
  4. Create parent booking (block header, no session, is_waiting_list=0)
  5. Create child booking for each normal session
  6. Create waitlist child bookings for full sessions
  7. Price = price_per_session x count(normal sessions only)
```

**Room hire booking:**

```
Client: POST /api/bookings
  { activity_id (room_hire type), booking_date, start_time, duration, purpose, attendees }

BookingService -> createRoomHireBooking():
  1. Check room availability for date+time window (no overlap)
  2. Calculate price (per_hour x duration or per_booking)
  3. Create a session on-the-fly for this specific slot
  4. INSERT booking linked to new session
  5. INSERT space_reservation for the time slot (prevents double-booking)
```

### Group enrollment

Children are assigned to activity groups **after** their first paid session — not on registration. Adding a child to an account has no group side-effects.

```
PaymentService::processPayment() / processBatchPayment()
  After booking confirmed as paid:
  1. Check booking['relationship'] !== 'self'
  2. GroupService::assignToActivityGroupByAge(participantId, activityId)
       - Fetch participant DOB from DB
       - Calculate age
       - GroupRepository::findByActivityAndAge(activityId, age) — scoped to this activity only
       - For each matching group: addMember() → enrollInFutureSessions()
           enrollInFutureSessions() creates pending bookings for ALL future group sessions

  Wrapped in try/catch: booking is already committed under autocommit, so a group
  assignment failure must not break the payment response (logged, not thrown).
  processBatchPayment() deduplicates by participant+activity key across the batch.
```

**Group restriction bypass (BookingService::createBooking):**

```
if session has groups AND participant not in session group:
  - Already has a group for this activity → DENY (wrong group)
  - Not age-eligible → DENY
  - Age-eligible + no group for this activity yet → ALLOW (first-timer bypass)
    Group assignment happens after payment, not at booking time.
```

### Credit priority logic

Account credit is applied before Stripe on every paid booking. The source of truth is `PaymentService::applyCredit()`.

```
applyCredit(userId, price, bookingId, description):
  1. Fetch user's current credit balance
  2. creditToApply = min(balance, price)
  3. If creditToApply > 0:
     a. UPDATE users SET credit = credit - creditToApply WHERE id = userId
     b. INSERT INTO account_credit_transactions (deduction, creditToApply)
     c. INSERT INTO payments (payment_method='account_credit', amount=creditToApply)
  4. Return { credit_applied, remaining: price - creditToApply }

Back in BookingController:
  - If remaining = 0 -> booking confirmed, no Stripe needed
  - If remaining > 0 -> PaymentService::createPaymentIntent(remaining)
                     -> return Stripe client_secret to frontend
```

### Waitlist promotion flow

```
Admin promotes customer from waitlist:
  POST /api/admin/bookings/:id/promote

AdminController -> BookingService::promoteFromWaitlist(bookingId):
  1. UPDATE bookings SET is_waiting_list=0 WHERE id=?
     (booking_status stays 'pending', payment_status stays 'pending')
  2. NotificationService::sendWaitlistPromotionNotification(bookingId)
     -> Email customer: "A spot has opened up — pay within 48 hours"

Customer pays:
  POST /api/bookings/:id/pay

BookingController -> PaymentService (credit first, then Stripe if needed)
  -> booking confirmed

Lazy expiry (runs on each booking list read):
  BookingService::expireUnpaidPromotions()
  -> Finds promoted bookings (is_waiting_list=0, payment_status=pending,
     session has passed or >48h since promotion)
  -> Cancels them, frees the spot
```

### Notification events

All outbound notifications flow through `NotificationService`. The table below lists every event, which channels fire, and what triggers the dispatch.

| Event | Channels | Trigger |
|---|---|---|
| Email verification | Email | Registration, or resend request |
| Password reset | Email | Forgotten password request |
| Email change verification | Email | Customer updates their email address |
| Booking confirmation | Email | Payment confirmed (Stripe or credit) |
| Booking cancellation | Email | Customer cancels a booking |
| Session cancellation | Email | Admin cancels a session (fires per affected booking) |
| Session reminder | Email | Cron — 24 h before session start (see Scheduled Tasks) |
| Attendance confirmation request | Email | Cron — configurable hours before session (default 24 h, see Notification Templates) |
| Payment request | Email | Instructor marks booking attended and payment_status is pending |
| Payment reminder | Email | Post-session sweep — attended but unpaid |
| Group broadcast | Email | Admin sends message to a group |
| Staff subscriber alert | Email, In-app | New booking / cancellation / attendance reminder, if staff has a subscription for that activity |
| Test email | Email | Admin → Settings → Notification Services |

Staff subscribers receive notifications through `dispatchToSubscribers()` for `new_booking`, `cancellation`, and `attendance_reminder` events. Admins with `in_app_notifications = 1` always receive in-app alerts for those events even without a subscription.

### Notification channels

Email is the only customer notification channel (SMS/WhatsApp via Bird were removed in October 2026). Staff also get in-app toasts.

**The email toggle is honoured.** `NotificationService::dispatch()` skips email when the user's `user_preferences.email_notifications = 0` (no row or NULL = on, via `UserRepository::emailPrefAllows()`). Staff subscriber emails check the same preference. Use it to silence notification emails for an account, e.g. auto-booked sessions before go-live.

**Booking does not require email to be on.** A customer with email off can still book; they just aren't emailed.

**Toggle switches post a hidden input that is always present** (`value="0"` or `"1"`). Read them with `postFlag('field')` from `app/Helpers/helpers.php`, never `isset($_POST['field'])`.

**App-wide kill switch:** `app_settings.notifications_disabled = '1'` stops customer emails and staff subscriber emails/in-app alerts. Admin and instructor broadcasts go through the same gate (`NotificationService::sendToUser()`) and refuse with 409 while it's on.

**Staff subscription events** are listed once in `NotificationSubscriptionRepository::EVENT_LABELS` (must match the `event_type` enum; `SubscriptionEventTypesTest` enforces it). `eventTypesForRole()` drives the form and route validation. Send an event with `NotificationService::notifySubscribers($eventType, $subject, $summary, $activityId, $sessionId)`; unknown types throw. Fan-out only reaches staff (admin, super_admin, instructor).

| Event | Sent from |
|---|---|
| `new_session_booking` / `new_room_booking` | `sendBookingConfirmation()` (room hire → `new_room_booking`) |
| `cancellation` | `sendCancellationNotification()` |
| `attendance_reminder` | `sendSessionReminder()` |
| `payment_received` | `PaymentService` — Stripe single/batch and account credit |
| `payment_failed` | `StripeWebhookService` via `POST /api/payments/stripe/webhook` (signature-verified, needs `stripe_webhook_secret`) |
| `withdrawal_requested` | `BookingController::requestWithdrawal()` |
| `new_user` | `AuthService::register()` |

**Customer session reminders:** a customer's own reminder is sent only for activities in their "Booking reminders" choices (`attendance_reminder` rows; `activity_id` NULL = all). New customers get an "All" row (`addDefaultCustomerReminder()`); existing ones were backfilled by `2026_10_14_customer_reminder_default.sql`. Customer rows are never fanned out to other users.

### Email notifications

Emails are sent by either `SmtpService` or `ResendService`, selected by the `mail_driver` setting (default: `resend`). `NotificationService` reads the driver at construction time and routes all `sendEmail()` calls to the active mailer.

```
NotificationService::sendBookingConfirmation(bookingId):
  1. Fetch booking details (user email, activity, session date)
  2. Render HTML template
  3. $this->mailer->send(to, subject, html):

SmtpService path:
  a. Read smtp_host, smtp_port, smtp_username, smtp_password, smtp_encryption from app_settings
  b. If smtp_host is empty -> log to logs/emails.log (fallback)
  c. Connect via stream_socket_client(), STARTTLS (port 587) or SSL (port 465)
  d. AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT

ResendService path:
  a. Read resend_api_key from app_settings (AES-256-GCM encrypted)
  b. If no API key -> log to logs/emails.log (local dev fallback)
  c. POST to https://api.resend.com/emails via cURL
```

Settings priority: `app_settings` DB table → env var fallback → hardcoded default.

**To test emails locally (SMTP):** Run Mailpit (`brew install mailpit`, then `mailpit`). Configure in Settings: driver=SMTP, host=`localhost`, port=`1025`, encryption=`none`. Captured mail appears at `http://localhost:8025`.

**To test emails locally (Resend):** Leave `resend_api_key` unset in `app_settings`. Emails print to `logs/emails.log` instead.

### Attendance confirmation flow (soft-decline)

The attendance confirmation is a yes/no email sent to the account holder before the session. "No" is a **soft decline** — it records the response but does not cancel or refund.

```
Customer receives attendance confirmation link (via cron or manual trigger)
  ↓
Clicks YES → POST /booking/confirm-attendance?token=…&response=yes
  AttendanceConfirmationService::processResponse()
  - booking_status → 'confirmed', attendance_response = 'yes'
  - No further action (payment handled separately via AttendanceService)

Clicks NO → POST /booking/confirm-attendance?token=…&response=no
  AttendanceConfirmationService::processResponse()
  - attendance_response = 'no'
  - booking_status stays as-is (NOT cancelled, NOT refunded)
  - Returns: "Got it — you have been marked as not attending."
```

Downstream when instructor marks attendance (`AttendanceService::markAttendance()`):

```
status = 'attended' + payment_status = 'pending'
  → NotificationService::sendPaymentRequest() — asks customer to pay

status = 'absent' + payment_status = 'paid' + booking_status != 'pending'
  → BookingService::cancelBooking(..., isAdmin: true) with reason 'Absent — refund issued'
    (same refund as a cancellation: net of discount, capped for block sessions, to account credit)

status = 'absent' + booking_status = 'pending'
  → BookingRepository::cancelWithReason('Absent and booking not confirmed')
  (nothing was paid, so no refund)
```

The instructor session-detail view shows an **Unpaid** badge for any booking with `payment_status = 'pending'` (visible to both instructors and admins — not admin-only).

### Notification templates

Admins (super_admin only) can override the subject, body, and short summary for 7 notification types without a code deploy. The system checks for a DB override first and falls back to the hardcoded default if none exists.

**DB table:** `notification_templates`

| Column | Type | Notes |
|---|---|---|
| `notification_type` | varchar(50) UNIQUE | One of the 7 editable types |
| `email_subject` | varchar(255) NULL | NULL = use hardcoded default |
| `email_body` | text NULL | Plain text; newlines → `<br>` on send |
| `short_message` | varchar(500) NULL | Plain-text summary for in-app notifications and staff alert emails |
| `send_day_of_week` | tinyint NULL | Session reminder + attendance confirmation only; 1=Mon…7=Sun (ISO-8601), NULL=Monday |

**Editable types:** `booking_confirmation`, `cancellation_notification`, `session_cancellation`, `session_reminder`, `attendance_confirmation`, `payment_request`, `payment_reminder`.

**Resolution:** `NotificationService::resolveTemplate(type, ...)` queries `NotificationTemplateRepository::getByType()`. Non-null DB fields override their hardcoded counterparts; null fields fall through to the hardcoded string.

**Placeholders:** `{participant_name}`, `{activity_title}`, `{date}`, `{time}`, `{amount}`, `{venue}`, `{refund_amount}`, `{first_name}`, `{booking_id}`, `{yes_url}`, `{no_url}` — availability varies by type. Required placeholders are validated client-side and server-side on save.

**`send_day_of_week`:** Controls which day of the week reminders are batched and sent. Both cron scripts (`send-session-reminders.php`, `send-attendance-confirmations.php`) run daily, check if today matches the configured day (default Monday), then send reminders for all sessions from the following day through the next 7 days. Sessions already reminded (`reminder_sent_at IS NOT NULL`) are skipped automatically.

**Admin UI:** `GET /admin/notification-templates/{type}` (super_admin only). Left nav lists all 7 types with a dot indicator for customised ones. Right form: placeholder toolbar, email subject input, email body textarea, short summary textarea, and day-of-week dropdown for time-based types. Inputs pre-fill with the hardcoded defaults when no DB override exists. "Reset to default" button clears all fields for the current type.

**Key files:** `NotificationTemplateRepository.php`, `NotificationService::resolveTemplate()`, `app/Views/admin/notification-templates.php`, `app/Routes/admin.php` (~line 2881), `scripts/send-session-reminders.php`, `scripts/send-attendance-confirmations.php`.

---

## 9. Frontend Patterns

### TailwindCSS build

```bash
# One-time build
npm run build:css

# Watch mode during development
npm run watch:css
```

The input is `booking/booking/css/tailwind.css`. The output is `booking/booking/css/output.css`, which is loaded by the layout. The compiled `output.css` is committed to the repo so the app works without running npm.

**Mobile-first:** All layouts start with mobile styles and use `md:`, `lg:` breakpoints for larger screens. Test mobile first.

### Popover API for all dialogs

**This is non-negotiable.** No `alert()`, no `confirm()`, no `fixed inset-0 bg-black/50` overlay divs. All dialogs use the browser-native Popover API.

Before writing any dialog, check `booking/app/Views/shared/`. These are already included in `layouts/app.php` — do not re-include or rewrite them:

| File | JS to trigger |
|---|---|
| `alert-dialog.php` | `showAlert('message', { title: 'optional' })` |
| `confirm-dialog.php` | `showConfirm('Are you sure?').then(yes => { if (yes) ... })` |
| `prompt-dialog.php` | `showPrompt('Enter value:').then(val => { if (val !== null) ... })` |
| `cancel-booking-dialog.php` | Wired to cancel booking flow |
| `room-booking-dialog.php` | Wired to meeting room hire flow |

If you need a new domain-specific popover that does not fit any of the above, add a `<div popover="manual">` directly in the view file. Pattern:

```html
<!-- In your view file -->
<div id="my-action-popover" popover="manual">
    <div><!-- header -->
        <h2>Dialog Title</h2>
        <button onclick="document.getElementById('my-action-popover').hidePopover()">Close</button>
    </div>
    <div><!-- body -->
        <p>Dialog content here</p>
    </div>
    <div><!-- footer -->
        <button onclick="document.getElementById('my-action-popover').hidePopover()">Cancel</button>
        <button id="confirm-btn">Confirm</button>
    </div>
</div>

<style>
    #my-action-popover::backdrop { background: rgba(0, 0, 0, 0.5); }
</style>

<script>
document.getElementById('trigger-btn').addEventListener('click', () => {
    document.getElementById('my-action-popover').showPopover();
});
</script>
```

### No innerHTML — ever

This is a hard security rule. Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with any dynamic data. Build DOM trees with DOM methods:

```javascript
// Correct
function renderBookingRow(booking) {
    const tr = document.createElement('tr');

    const td = document.createElement('td');
    td.textContent = booking.activity_title;   // safe — escapes all HTML
    tr.appendChild(td);

    const statusTd = document.createElement('td');
    statusTd.textContent = booking.status;
    tr.appendChild(statusTd);

    return tr;
}

// To clear and repopulate a table body:
tbody.replaceChildren(...bookings.map(renderBookingRow));

// To remove a node:
row.remove();
```

The reason: any user-controlled string injected via `innerHTML` becomes executable HTML. Even if you think the value is safe, it is not safe — XSS vulnerabilities are subtle and context-dependent.

### Table sorting

Every data table that displays more than a few rows should be sortable:

```html
<table data-sortable>
    <thead>
        <tr>
            <th>Name</th>
            <th>Date</th>
            <th>Amount</th>
        </tr>
    </thead>
    <tbody>...</tbody>
</table>
```

```php
// In the view, declare the required script:
$pageScripts = ['table-sort.js'];
```

Important: numeric columns must display `0` not `-` for empty values. The sort is lexicographic unless the column type is overridden — a dash character sorts before digits, breaking numeric sort.

### Image upload

Use `UploadService::validateAndMove()` for all file uploads:

```php
// In a controller or route handler
$file = $_FILES['image'] ?? null;
if ($file) {
    $path = UploadService::validateAndMove($file, 'activities');
    // Returns: '/uploads/activities/abc123_1707400000.jpg'
}
```

Restrictions enforced by `UploadService`: jpg/jpeg/png/webp only, max 5MB, real image content verified with `getimagesize()`.

Activities support multiple images (`activity_images` table, `is_thumbnail` flag). Venues support one image (`image_path` column on `bookable_spaces`).

---

## 10. Security

### CSRF protection

Every state-changing request requires a valid CSRF token. The CSRF token is a 64-character hex string stored in a `csrf_token` cookie (SameSite=Strict, NOT HttpOnly — JavaScript must read it).

**HTML forms:** Include a hidden field.

```html
<input type="hidden" name="_csrf_token" value="<?= e($csrfToken) ?>">
```

**JavaScript API calls:** Append the token to the URL.

```javascript
function csrfUrl(path) {
    const token = document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? '';
    return path + (path.includes('?') ? '&' : '?') + '_csrf_token=' + encodeURIComponent(token);
}
```

Server validation (`validateCsrfToken()` in `auth.php`): checks `X-CSRF-Token` header, then `$_POST['_csrf_token']`, then `$_GET['_csrf_token']`. Uses `hash_equals()` for timing-safe comparison.

API routes call `$this->verifyCsrf()` inside `requireAuth()` automatically. HTML form POSTs are validated in `index.php` before reaching any route handler.

**Session expiry recovery:** The CSRF token is stored as a session cookie (expires when the browser closes). If a user loads the login/register page, closes and reopens the browser, then submits the form, the cookie is gone and validation fails. Rather than showing a dead-end error page, `index.php` redirects back to the same URL with `?csrf_retry=1`, which triggers a fresh GET that re-issues the cookie. The page then shows "Your session expired. Please try again." and the next submit succeeds.

### JWT tokens

- Algorithm: HS256 (HMAC-SHA256)
- Secret: `JWT_SECRET` environment variable
- Payload: `{ user_id, email, role, iat, exp }`
- Expiry: 120 minutes; rolling refresh on each page navigation creates a 120-minute inactivity window
- Stored in `auth_token` cookie: HttpOnly, SameSite=Strict, Secure when HTTPS

**Password invalidation:** if `users.password_changed_at > JWT.iat`, the token is rejected even if not expired. This immediately invalidates all existing sessions when a user changes their password.

### Login rate limiting

`AuthService::login()` enforces rate limiting via `audit_logs`. Failed login attempts from the same IP within a rolling window trigger a lockout. The audit log records every login attempt (success and failure) with IP address and user agent.

### Encrypted settings

Sensitive values in `app_settings` (Stripe keys, Resend API key, SMTP password) are encrypted with AES-256-GCM before storage. The encryption key is `APP_KEY` (64-char hex, 256-bit) from `.env`.

```php
// Encrypt before storing
$encrypted = encryptSetting($plaintextApiKey);
$db->execute(
    "INSERT INTO app_settings (setting_key, setting_value) VALUES ('stripe_secret_key', ?)",
    [$encrypted]
);

// Decrypt when reading
$plaintext = decryptSetting($row['setting_value']);
```

Format: `enc:<base64(12-byte-IV + 16-byte-tag + ciphertext)>`. Values not prefixed with `enc:` are treated as legacy plaintext (backward compatible).

### Input validation

- All output escaped with `e()` helper (`htmlspecialchars`)
- Validation helpers in `app/Helpers/validation.php`: `isValidEmail()`, `isValidPhoneNumber()`, `isValidPostcode()`, `isValidDate()`
- File uploads validated by content (`getimagesize()`), not just extension
- Slug generation sanitised to `[a-z0-9-]` with uniqueness suffix
- CSV exports use `csvSafe()` helper to prevent CSV injection (values starting with `=`, `+`, `-`, `@` are prefixed with a tab)

### Whitelisted column updates in repositories

Repositories that perform dynamic UPDATE queries maintain an explicit whitelist of allowed column names:

```php
// Example pattern in a repository
private array $allowedUpdateColumns = [
    'first_name', 'last_name', 'phone', 'date_of_birth', 'account_type'
];

public function updateUser(int $id, array $data): bool
{
    $sets = [];
    $params = [];
    foreach ($data as $col => $val) {
        if (!in_array($col, $this->allowedUpdateColumns)) {
            continue;  // silently skip — never trust input column names
        }
        $sets[] = "$col = ?";
        $params[] = $val;
    }
    // ...
}
```

This prevents an attacker from passing `role=super_admin` in a JSON body and having it inserted into a dynamic UPDATE statement.

---

## 11. Testing

### Setup

PHPUnit and its dependencies are installed at the **git root** (`booking/`), not inside `booking/booking/`. The `composer.json` at the git root defines the test dependency.

```bash
# Install (if not already done)
composer install

# Run all tests
vendor/bin/phpunit

# Run a specific test file
vendor/bin/phpunit tests/Unit/JWTTest.php

# Run with verbose output
vendor/bin/phpunit --testdox
```

### What is tested

All tests are pure **unit tests** — no database, no HTTP, no file system access.

| Test file | What it covers |
|---|---|
| `JWTTest.php` | JWT encode/decode, expiry, tamper detection, malformed tokens |
| `AuthHelperTest.php` | CSRF token generation and validation helpers |
| `ValidationHelperTest.php` | Email, phone, postcode, date validation |
| `HelpersTest.php` | `encryptSetting()` / `decryptSetting()` round-trips |
| `DateHelperTest.php` | Date formatting helpers |
| `GiftAidHelperTest.php` | Gift Aid calculation helpers |
| `SlugGeneratorTest.php` | Slug generation from titles |
| `CsvSafeTest.php` | CSV injection prevention |
| `RoomHireServiceTest.php` | Room hire pricing and availability logic (pure logic, no DB) |

### What is not tested (and why)

**Integration tests** (Controller to Service to Repository to DB) do not exist. Reasons:
1. Galvani's socket-based DB is not available in CI environments
2. The DB singleton makes test isolation difficult without a test container setup
3. Business logic is tested where it matters (unit level)

Controllers, views, and authentication flows are tested manually using the test accounts. See `memory/MEMORY.md` for the current manual testing checklist.

### Test bootstrap

`tests/bootstrap.php` sets the minimum required environment before tests run:

```php
$_ENV['JWT_SECRET'] = 'test-secret-key-for-phpunit';
$_ENV['APP_ENV']    = 'testing';
$_ENV['APP_KEY']    = bin2hex(random_bytes(32));  // fresh 256-bit key each run

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../booking/app/Helpers/auth.php';
require_once __DIR__ . '/../booking/app/Helpers/helpers.php';
require_once __DIR__ . '/../booking/app/Helpers/view.php';
```

---

## 12. MCP Servers

The `mcp/` directory contains a set of MCP (Model Context Protocol) servers that let AI assistants — Claude Desktop, Claude Code, or any MCP-compatible client — interact with the booking system through natural language.

### What the MCP layer is and why it exists

The MCP server is a read/write interface to the booking system's existing REST API. It requires no PHP changes and adds no new server-side code. An admin can ask Claude "Pull today's bookings" or "Give me a revenue summary for this month" and receive an accurate, structured answer. It authenticates against the PHP API using the same JWT flow as the web app.

### Directory structure

```
mcp/
├── packages/
│   ├── core/       # Shared API client + all customer-tier tools
│   ├── customer/   # Customer MCP server (stdio)
│   ├── instructor/ # Instructor MCP server (stdio)
│   └── admin/      # Admin MCP server (stdio) — all tools + 4 prompts
└── workers/        # Cloudflare Worker (HTTP transport, all three roles)
```

The packages follow a tiered model: `core` provides the base customer tools, `instructor` adds session and attendance tools on top, and `admin` adds the full set of resource management, reporting, and admin booking tools. Destructive or financial actions require `confirmed: true` in the tool call to prevent accidental execution.

### Authentication against the PHP REST API

No PHP changes are required. The MCP server authenticates using the existing login endpoint:

1. `GET /` — fetches the app home page to obtain a CSRF token
2. `POST /api/auth/login` — submits credentials to receive a JWT
3. All subsequent requests include `Authorization: Bearer <jwt>` plus the CSRF token as a query parameter for mutating calls
4. On `401 Unauthorized`, the server re-authenticates automatically

The `core` package's `ApiClient` class handles this transparently for all tools.

### Deployment options

| Option | When to use | Transport |
|---|---|---|
| Local stdio (packages/) | Development, Claude Code, per-user Claude Desktop | stdio (Node.js process) |
| Cloudflare Worker (workers/) | Production, shared team access, remote Claude Desktop | HTTPS (JSON-RPC over HTTP) |

The Cloudflare Worker caches JWTs in Cloudflare KV to avoid re-authenticating on every request. The local stdio packages cache the JWT in process memory.

### Full reference

See `docs/mcp-guide.md` for the complete guide, including:
- All 19 tools with their actions and descriptions
- The 4 admin prompts (daily-briefing, session-report, waitlist-review, revenue-summary)
- Step-by-step Claude Desktop and Claude Code setup for both local and Cloudflare
- What is not supported via MCP (image uploads, Stripe payment creation, real-time updates)
- Development guide: adding tools, building, testing locally

---

## 13. Build and Deploy

### Building for LAMP (production)

Run from the booking folder: `bash build.sh`, then choose 1 (app files), 2 (database export) or 3 (full mirror: both, plus uploaded images). The step-by-step deploy is in `wiki/Deployment.md`.

**App files (`dist/`)**

1. Rebuilds the CSS (falls back to the committed `css/output.css` if Node fails)
2. rsyncs the app into a fresh `dist/`, excluding everything in `.distignore`
3. Keeps an existing `dist/config/env.php`; otherwise creates it from `config/env-shared.example.php` with a random `APP_KEY` and `JWT_SECRET`. `config/app.php` and `config/database.php` ship unchanged: they read `$_ENV`
4. Creates `storage/`, `logs/` and `uploads/` with their `.htaccess` rules (full mirror: copies the uploaded images too)
5. Refuses to finish if any `.sql` file ended up in `dist/`

**Database export (`db-export/`)**

1. Copies `booking_app` into a temporary database: structure via `mysqldump --no-data`, data server-side with `INSERT … SELECT`
2. Cleans the copy: deletes `@test.local` accounts (their rows cascade), empties `audit_logs` and `cache`, deletes `enc:` settings (encrypted with the local `APP_KEY`), sets `notifications_disabled = 1`
3. Converts the copy's text columns to binary and dumps the data with `--hex-blob --replace`. The Galvani MySQL gives the `mysql`/`mysqldump` clients a latin1 session whatever they ask for, so text must never pass through them as text; `--replace` lets the real `notification_templates` rows overwrite the defaults `schema.sql` seeds
4. Writes `DROP TABLE IF EXISTS` for every table + `schema.sql` + the data, gzipped, to `db-export/booking-mirror-<date>.sql.gz`, and drops the temporary database

`db-export/` is gitignored and excluded from `dist/`: it contains customer data and is imported through phpMyAdmin from your computer, never uploaded.

### Environment variables reference

#### `booking/booking/.env` (application variables)

| Variable | Required | What it does | Example |
|---|---|---|---|
| `APP_ENV` | Yes | Environment name | `development` or `production` |
| `APP_DEBUG` | No | Enable verbose error output | `true` (dev) / `false` (prod) |
| `APP_URL` | Yes | Base URL of the app | `http://localhost:8080/booking` |
| `APP_KEY` | Yes | 64-char hex, 256-bit AES key for encrypted settings | 32 random bytes, hex-encoded |
| `JWT_SECRET` | Yes | Secret for signing JWT auth tokens | long random string |
| `DB_NAME` | No | Database name | `booking_app` |
| `DB_USER` | No | Database username | `root` (dev) / db user (prod) |
| `DB_PASS` | No | Database password | empty (dev) |
| `DB_HOST` | No | MySQL host — leave blank for Galvani socket | `localhost` (LAMP) |
| `DB_PORT` | No | MySQL port | `3306` |
| `REALTIME_ENABLED` | No | Enable WebSocket real-time features | `true` |
| `RESEND_API_KEY` | No | Fallback Resend key (DB setting takes priority) | `re_...` |
| `MAIL_DRIVER` | No | Active email driver: `smtp` or `resend` | `resend` |
| `SMTP_HOST` | No | SMTP server hostname | `smtp.office365.com` |
| `SMTP_PORT` | No | SMTP port | `587` |
| `SMTP_USERNAME` | No | SMTP username (full email address) | — |
| `SMTP_PASSWORD` | No | SMTP password / app password | — |
| `SMTP_ENCRYPTION` | No | `tls`, `ssl`, or `none` | `tls` |
| `MAIL_FROM_ADDRESS` | No | Fallback from address (DB setting takes priority) | `noreply@wellfoundation.org.uk` |
| `MAIL_FROM_NAME` | No | Fallback from name | `WFCS Booking` |

#### Settings stored in `app_settings` table (via Admin UI)

| Key | What it does |
|---|---|
| `stripe_secret_key` | Stripe secret key (encrypted) |
| `stripe_public_key` | Stripe publishable key (encrypted) |
| `resend_api_key` | Resend email API key (encrypted) |
| `mail_driver` | Active email driver (`resend` or `smtp`) |
| `smtp_host` | SMTP server hostname |
| `smtp_port` | SMTP port (default `587`) |
| `smtp_username` | SMTP username |
| `smtp_password` | SMTP password (encrypted) |
| `smtp_encryption` | Encryption mode: `tls`, `ssl`, or `none` |
| `mail_from_address` | Email from address |
| `mail_from_name` | Email from display name |

#### `booking/.env` (Galvani runtime — minimal)

| Variable | What it does |
|---|---|
| `SERVER_PORT` | Port for Galvani to listen on (default 8080) |
| `GALVANI_THREADS` | Number of worker threads (minimum 4) |

---

---

## 14. Scheduled Tasks (Cron Jobs)

Two PHP scripts in `scripts/` must be scheduled on the production server. Both follow the same pattern as the existing payment reminder script: load the framework, run the service method, mark records sent, log output.

### Session reminders — `scripts/send-session-reminders.php`

Finds all `scheduled` sessions starting within the next 24 hours that have not yet had a reminder sent (`sessions.reminder_sent_at IS NULL`), sends email to every confirmed booking on that session, then stamps `reminder_sent_at` on the session row to prevent duplicates.

**Recommended schedule:** hourly, so reminders fire as close to the 24-hour mark as possible.

```cron
# Session reminders — run every hour
0 * * * * php /var/www/html/booking/scripts/send-session-reminders.php >> /var/log/booking-session-reminders.log 2>&1
```

### Payment reminders — `scripts/send-payment-reminders.php`

Finds bookings with `booking_status = unpaid_attended` where the last payment reminder was sent more than `payment_reminder_days` (per activity) ago, sends a reminder, then stamps `payment_reminder_sent_at` on the booking.

**Recommended schedule:** daily at 09:00.

```cron
# Payment reminders — run daily at 09:00
0 9 * * * php /var/www/html/booking/scripts/send-payment-reminders.php >> /var/log/booking-payment-reminders.log 2>&1
```

### Adding cron jobs on IONOS (or cPanel-based LAMP host)

1. Log in to the IONOS control panel (or cPanel)
2. Navigate to **Hosting → Cron jobs** (cPanel) or **Scheduled Tasks** (IONOS Managed Hosting)
3. Add each job above — adjust the path to match the actual `public_html` document root
4. Verify by tailing the log file after the first scheduled run:
   ```bash
   tail -f /var/log/booking-session-reminders.log
   ```

### Schema note

`sessions.reminder_sent_at` (DATETIME, nullable) was added by migration `database/migrations/2026_03_19_sessions_reminder_sent_at.sql`. Ensure this migration has been applied to the production database before enabling the cron.

---

*Last updated: 2026-10-14. SMS/WhatsApp removed — email is the only customer channel.*
