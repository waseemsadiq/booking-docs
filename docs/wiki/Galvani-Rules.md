# Galvani Rules

Galvani is an **async, multi-threaded PHP runtime** with an embedded MariaDB. It keeps PHP in memory across requests and uses a connection pool shared across threads. This makes it fast, but it has hard constraints that differ from a standard PHP-FPM + MySQL setup.

Violating these rules causes **silent bugs** — data that appears to save but is invisible to other requests, queries that corrupt dates, or routes that disappear entirely.

---

## Rule 1 — No explicit transactions

**NEVER** call `beginTransaction()`, `commit()`, or `rollBack()`. Use autocommit only.

**Why it matters**: Galvani runs multiple threads sharing the same singleton DB connection. A `beginTransaction()` in one thread holds a lock that blocks all other threads. Data committed inside a transaction is invisible to other threads until the transaction closes. The Database class must not define these methods at all.

Correct pattern — each query autocommits immediately and is visible across threads:

```php
$db->query("INSERT INTO bookings ...", $bookingParams);
$db->query("INSERT INTO payments ...", $paymentParams);
```

If you need multiple dependent writes to succeed together, do them in a single request handler — they run on the same thread and connection, giving logical atomicity without explicit transactions.

---

## Rule 2 — Singleton DB always

Use `Database::getInstance()` everywhere. **Never** `new Database()`.

**Why it matters**: Galvani uses a connection pool. Every `new Database()` opens a fresh connection that is never returned to the pool, exhausting it and causing the server to hang.

```php
// Correct
$db = \App\Models\Database::getInstance();
$result = $db->query("SELECT ...");
```

Repositories receive the singleton via their constructor or call `getInstance()` directly.

---

## Rule 3 — Emulated prepares only

The `Database` constructor must set `PDO::ATTR_EMULATE_PREPARES => true`.

**Why it matters**: Galvani's long-running singleton connection uses a MariaDB protocol version where native prepared statements corrupt `DATE` and `TIME` column values — dates become `0000-00-00`, times become `00:00:00`. Emulated prepares work correctly.

```php
// Correct — in Database constructor:
$this->pdo = new PDO($dsn, $user, $pass, [
    PDO::ATTR_EMULATE_PREPARES => true,
    PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
]);
```

---

## Rule 4 — No PHP booleans in SQL

Use integer literals `0` and `1`. Never PHP `true`/`false`, and never SQL `TRUE`/`FALSE` literals.

**Why it matters**: With emulated prepares, PHP `false` is cast to an empty string `''` before binding. Inserting `''` into a `TINYINT(1)` column produces unexpected results silently. SQL `TRUE`/`FALSE` literals are also unreliable across MySQL versions with emulated prepares.

```php
// Correct
$db->query("UPDATE activities SET allow_waiting_list = ? WHERE id = ?", [1, $id]);
$db->query("UPDATE activities SET allow_waiting_list = ? WHERE id = ?", [0, $id]);
```

---

## Rule 5 — LIMIT and OFFSET must be interpolated

Use string interpolation for `LIMIT` and `OFFSET` values, not `?` placeholders.

**Why it matters**: With emulated prepares, PDO quotes bound parameters. `LIMIT ?` with value `10` becomes `LIMIT '10'` in the final SQL — a syntax error in MySQL/MariaDB. Casting to `int` and interpolating is safe because there is no injection risk with a numeric value.

```php
// Correct
$sql = "SELECT * FROM bookings LIMIT " . (int)$limit . " OFFSET " . (int)$offset;
$db->query($sql);

// Wrong — produces: LIMIT '10' OFFSET '0' (syntax error)
// $db->query("SELECT * FROM bookings LIMIT ? OFFSET ?", [$limit, $offset]);
```

---

## Rule 6 — READ COMMITTED isolation

The `Database` constructor must set the session isolation level to `READ COMMITTED`.

**Why it matters**: Galvani's singleton connection is long-lived. The default `REPEATABLE READ` isolation causes stale reads — once a snapshot is taken, the connection sees old data even after other threads have committed new rows. `READ COMMITTED` forces each query to see the latest committed data.

```php
// Correct — in Database constructor, after connecting:
$this->pdo->exec("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED");
```

---

## Rule 7 — Restart Galvani after PHP class changes

After editing any PHP class file (Controllers, Services, Models, Repositories, Helpers), stop Galvani and start it again.

**Why it matters**: Galvani loads PHP class files into memory at startup. Edits to class files are not picked up until the process restarts.

**Exception**: View files (`app/Views/**/*.php`) are re-read on every request. No restart is needed for view-only changes.

---

## Rule 8 — Minimum 4 threads

Always start Galvani with at least 4 threads. The default `./galvani` is fine. Do not use `--threads 1`.

**Why it matters**: With a single thread, any request that opens a DB connection and waits for a second query from the same connection will deadlock — both operations need the same thread.

---

## Rule 9 — No auth checks in controller constructors

Authentication logic (`exit()`, redirects) must not be placed in controller constructors. Auth checks belong in individual controller methods.

**Why it matters**: The router instantiates **all registered controllers** at startup time when registering routes. If a constructor calls `exit()` due to a failed auth check, it kills the entire Galvani process and removes all routes from memory.

```php
// Wrong — kills ALL routes for all users at startup
class BookingController extends Controller {
    public function __construct() {
        parent::__construct();
        $user = $this->getAuthUser();
        if (!$user) exit; // do not do this
    }
}

// Correct — check auth inside each method
class BookingController extends Controller {
    public function createBooking(): void {
        $user = $this->getAuthUser();
        if (!$user) {
            $this->json(['error' => 'Unauthorised'], 401);
            return;
        }
        // ... handler logic
    }
}
```

---

## Rule 10 — Multi-step writes in a single request

When two or more database writes depend on each other (e.g. insert a booking, then insert a payment linked to that booking), do both writes in one request handler.

**Why it matters**: Cross-request dependencies silently fail. Each request may run on a different thread. There is no guarantee that data written in one request is immediately visible to a subsequent request on a different thread.

The correct pattern is to perform the booking insert and the payment insert in the **same** route handler, so they run on the same thread with the same connection.

---

## Rule 11 — DELETE request bodies are stripped

Never send data in the body of a `DELETE` request. Pass parameters via query string and read from `$_GET`.

**Why it matters**: RFC 9110 specifies that DELETE request bodies have undefined semantics. Galvani follows the spec and discards DELETE bodies. Proxies, CDNs, and WAFs in the wild also strip them. This is standard HTTP behaviour, not a Galvani quirk.

JavaScript side — pass data via query string, not request body:

```javascript
const url = csrfUrl('/api/bookings/' + id + '?reason=' + encodeURIComponent(reason));
fetch(url, { method: 'DELETE' });
```

PHP handler side — read from `$_GET`:

```php
$reason = $_GET['reason'] ?? '';
```

---

## Rule 12 — CSRF via query parameters

Use the `csrfUrl()` helper to append the CSRF token as a query parameter on API calls. Do not rely on custom request headers for CSRF.

**Why it matters**: Galvani drops custom headers on multipart form data and DELETE requests. The CSRF token must travel as `_csrf_token=...` in the query string or as a POST field, not as an `X-CSRF-Token` header.

```javascript
function csrfUrl(path) {
    const token = getCookie('csrf_token') || '';
    return path + (path.includes('?') ? '&' : '?') + '_csrf_token=' + encodeURIComponent(token);
}
```

For HTML forms, include a hidden field:

```html
<input type="hidden" name="_csrf_token" value="<?= htmlspecialchars($csrfToken) ?>">
```

The server checks for the token in this order: `X-CSRF-Token` header, then POST field, then query parameter.

---

## Rule 13 — Socket path is exactly one level up from cwd

The MariaDB socket path depends on where the code is executing from.

**Why it matters**: Web requests run with `cwd` set to the `booking/` subdirectory. The socket lives one level up in `data/mysql.sock`. CLI scripts (e.g. `db-init.php`) run with `cwd` set to the git root, so the socket is in the current directory.

```php
// Web request (cwd = well-booking/booking/)
// One level up — correct:
$socket = dirname(getcwd()) . '/data/mysql.sock';

// CLI script (cwd = well-booking/)
// Same directory — correct:
$socket = getcwd() . '/data/mysql.sock';
```

Do **not** call `dirname()` twice — that goes two levels up and produces a path that does not exist, causing a "No such file or directory" error.
