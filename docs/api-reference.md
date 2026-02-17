# WFCS Booking — REST API Reference

**Branch:** `feature/4-spa-to-mvc`
**Base path:** `/booking/api` (dynamic — never hardcoded; strips `$basePath` prefix set from `$_SERVER['SCRIPT_NAME']`)

---

## Galvani-Specific Quirks

These constraints are enforced at the runtime level and affect all callers:

| Quirk | Detail |
|---|---|
| **DELETE bodies are stripped** | Galvani (and RFC 9110-compliant proxies/CDNs) discard DELETE request bodies. Pass all params via query string and read from `$_GET`. |
| **CSRF token delivery** | Custom headers are dropped on multipart/DELETE requests. Append `_csrf_token` as a query param using `csrfUrl()`. Server checks: `X-CSRF-Token` header → `_csrf_token` POST field → `_csrf_token` query param. |
| **Auth token** | HTTP-only `auth_token` cookie (SameSite=Strict). JSON API requests may also pass `Authorization: Bearer <token>`. Controller checks cookie first, then header. |
| **Content-Type** | All JSON API endpoints return `Content-Type: application/json`. |

### CSRF helper (JavaScript)

```js
function csrfUrl(path) {
    const token = getCookie('csrf_token') || '';
    return path + (path.includes('?') ? '&' : '?') + '_csrf_token=' + encodeURIComponent(token);
}
```

HTML forms must include:

```html
<input type="hidden" name="_csrf_token" value="<?= htmlspecialchars($csrfToken) ?>">
```

---

## Common Response Shapes

**Success**

```json
{ "field": "value", ... }
```

**Error**

```json
{ "error": true, "message": "Human-readable message" }
```

---

## 1. Authentication

All auth endpoints verify the CSRF token via `Controller::verifyCsrf()`.

### `POST /api/auth/register`

Register a new customer account. On success, auto-logs in and sets the `auth_token` cookie.

**Auth required:** None (public)
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Must be unique |
| `password` | string | Yes | Min 8 characters |
| `first_name` | string | Yes | |
| `last_name` | string | Yes | |
| `phone` | string | No | |
| `terms_conditions` | boolean | Yes | Must be `true` |
| `privacy_policy` | boolean | Yes | Must be `true` |
| `data_processing` | boolean | Yes | Must be `true` |
| `marketing` | boolean | No | Optional opt-in |

**Success:** `201 Created`

```json
{
  "id": 42,
  "email": "user@example.com",
  "first_name": "Jane",
  "last_name": "Smith",
  "token": "<jwt>",
  "user": { "id": 42, "role": "customer", ... }
}
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Missing required fields` |
| `400` | `You must accept Terms & Conditions, Privacy Policy, and Data Processing` |
| `400` | Email already in use (from AuthService) |

---

### `POST /api/auth/login`

Authenticate and receive a session cookie.

**Auth required:** None (public)
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |

**Success:** `200 OK`

```json
{
  "token": "<jwt>",
  "expires_in": 86400,
  "user": { "id": 5, "role": "customer", "first_name": "Jane", ... }
}
```

Sets `auth_token` HTTP-only cookie.

**Errors**

| Status | Message |
|---|---|
| `400` | `Email and password are required` |
| `401` | Invalid credentials (from AuthService) |

---

### `POST /api/auth/logout`

Clear the session cookie.

**Auth required:** None
**CSRF required:** Yes

**Success:** `200 OK`

```json
{ "message": "Logged out successfully." }
```

---

### `GET /api/auth/verify-token`

Check whether a token is still valid.

**Auth required:** Bearer token (header or cookie)
**CSRF required:** No

**Success:** `200 OK`

```json
{ "valid": true, "user": { "id": 5, "role": "customer", ... } }
```

**Errors**

| Status | Message |
|---|---|
| `401` | `No token provided` |
| `401` | `Invalid or expired token` |

---

### `GET /api/user/profile`

Get the authenticated user's profile.

**Auth required:** customer / any role

**Success:** `200 OK`

```json
{
  "id": 5,
  "email": "customer@booking.local",
  "first_name": "Jane",
  "last_name": "Smith",
  "role": "customer",
  "phone": "07700900000",
  "account_type": "individual"
}
```

---

### `PUT /api/user/profile`

Update the authenticated user's profile.

**Auth required:** customer / any role
**CSRF required:** Yes (via query param on AJAX)

**Request body (JSON):** same fields as profile response (except `id`, `email`, `role`)

**Success:** `200 OK` — updated profile object

---

## 2. Activities

### `GET /api/activities`

List published activities with optional filters. Room-hire activities are included (filter by `space_type` client-side if needed).

**Auth required:** None (public endpoint, but in practice accessed by authenticated customers)

**Query params**

| Param | Type | Notes |
|---|---|---|
| `status` | string | e.g. `published`, `draft`, `all` |
| `activity_type_id` | integer | Filter by type |
| `venue_id` | integer | Filter by venue |
| `category` | string | Free-text category |
| `search` | string | Full-text search on title/description |
| `min_price` | float | |
| `max_price` | float | |
| `min_age` | integer | |
| `max_age` | integer | |
| `page` | integer | Default `1` |
| `per_page` | integer | Default `20` |

**Success:** `200 OK`

```json
{
  "data": [ { "id": 1, "title": "Yoga", "slug": "yoga", "price_per_session": 8.00, ... } ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

---

### `GET /api/activities/{id}`

Get a single activity by numeric ID or slug.

**Auth required:** None

**Success:** `200 OK` — activity object

**Errors**

| Status | Message |
|---|---|
| `404` | `Activity not found` |

---

### `GET /api/activities/{slug}/availability`

Check availability for a date. For room-hire activities returns free time slots; for regular activities returns session availability.

**Auth required:** None

**Query params**

| Param | Type | Required | Notes |
|---|---|---|---|
| `date` | string (YYYY-MM-DD) | Yes | |

**Success (room-hire):** `200 OK`

```json
{
  "date": "2026-03-01",
  "slots": [
    { "start_time": "09:00", "end_time": "10:00", "available": true },
    ...
  ]
}
```

**Success (regular activity):** delegates to `ActivityController::checkAvailability` — returns session list with available spots.

**Errors**

| Status | Message |
|---|---|
| `400` | `Invalid date` |

---

### `GET /api/activities/{id}/sessions`

Get all sessions for an activity.

**Auth required:** None

**Query params**

| Param | Type | Notes |
|---|---|---|
| `status` | string | Filter by session status (e.g. `scheduled`) |

**Success:** `200 OK`

```json
{
  "data": [
    { "id": 10, "session_date": "2026-03-05", "start_time": "09:00:00", "end_time": "10:00:00", "available_spots": 3 }
  ]
}
```

---

### `GET /api/activities/{activityId}/sessions/{sessionId}`

Get details for a single session including availability.

**Auth required:** None

**Success:** `200 OK` — session detail object

---

### `POST /api/admin/activities`

Create a new activity.

**Auth required:** admin / super_admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | Yes | |
| `description` | string | No | |
| `activity_type_id` | integer | No | |
| `bookable_space_id` | integer | Yes | |
| `instructor_id` | integer | No | |
| `price_per_session` | float | Yes | |
| `capacity` | integer | Yes | |
| `min_age` | integer | No | |
| `max_age` | integer | No | |
| `frequency` | string | Yes | `weekly` or `single` |
| `start_date` | string | No | YYYY-MM-DD |
| `end_date` | string | No | YYYY-MM-DD |
| `start_time` | string | No | HH:MM |
| `end_time` | string | No | HH:MM |
| `allow_waiting_list` | integer | No | `0` or `1` |
| `status` | string | No | `draft` or `published` |
| `pricing_type` | string | No | `per_booking` or `per_hour` |

**Success:** `201 Created` — created activity object

---

### `PUT /api/admin/activities/{id}`

Update an existing activity.

**Auth required:** admin / super_admin
**CSRF required:** Yes

**Request body:** same fields as create

**Success:** `200 OK` — updated activity object

---

### `DELETE /api/admin/activities/{id}`

Delete an activity. Fails if bookings exist.

**Auth required:** admin / super_admin
**CSRF required:** Yes — pass `_csrf_token` as query param

**Success:** `200 OK`

```json
{ "message": "Activity deleted successfully" }
```

---

### `POST /api/admin/activities/{id}/sessions`

Generate future sessions for a weekly activity.

**Auth required:** admin / super_admin

**Success:** `200 OK` — list of generated session IDs

---

### `POST /api/admin/activities/{id}/images`

Upload an image for an activity (multipart/form-data).

**Auth required:** admin / super_admin

**Form fields**

| Field | Type | Notes |
|---|---|---|
| `image` | file | jpg/png/webp, max 5 MB |

**Success:** `201 Created` — image record

---

### `PUT /api/admin/activities/{activityId}/images/{imageId}/thumbnail`

Set a specific image as the activity thumbnail.

**Auth required:** admin / super_admin

**Success:** `200 OK`

---

### `DELETE /api/admin/activities/{activityId}/images/{imageId}`

Delete an activity image.

**Auth required:** admin / super_admin
**CSRF required:** Yes — `_csrf_token` query param

**Success:** `200 OK`

---

## 3. Bookings

### `POST /api/bookings`

Create a booking for a session. Handles credit deduction and Stripe payment intent creation in one atomic server-side request.

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `activity_id` | integer | Yes | |
| `participant_id` | integer or `"self"` | Yes | Pass `"self"` to auto-resolve/create the account-holder participant |
| `session_id` | integer | No | Single session booking |
| `session_ids` | array of integers | No | Pre-resolved session IDs for block booking |
| `recurrence_start` | integer | No | Session ID to start block from |
| `weeks` | integer | No | Number of consecutive weeks (max 12); triggers block booking when `> 1` |
| `booking_type` | string | No | `individual` (default) or `block` |
| `booking_date` | string | No | Room-hire only — YYYY-MM-DD |
| `start_time` | string | No | Room-hire only — HH:MM |
| `duration` | float | No | Room-hire only — hours (0.5–3, in 0.5-hour steps) |
| `purpose` | string | No | Room-hire only — `meeting`, `training`, `event`, `interview`, `other` |
| `attendee_count` | integer | No | Room-hire only |
| `organisation` | string | No | Room-hire only |
| `requirements` | string | No | Room-hire only |

**Success (waitlist):** `201 Created`

```json
{
  "is_waiting_list": true,
  "booking_ids": [123],
  "message": "Added to waitlist"
}
```

**Success (free/credit-paid):** `201 Created`

```json
{
  "booking_ids": [123],
  "total_price": 8.00,
  "credit_applied": 8.00,
  "stripe_required": false
}
```

**Success (Stripe required):** `201 Created`

```json
{
  "booking_ids": [123],
  "total_price": 8.00,
  "credit_applied": 0.00,
  "stripe_required": true,
  "stripe_amount": 8.00,
  "payment": {
    "payment_intent_id": "pi_xxx",
    "client_secret": "pi_xxx_secret_yyy",
    "amount": 8.00
  }
}
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Missing required fields: participant_id, activity_id` |
| `400` | Session full / booking conflict / any BookingService exception |

---

### `GET /api/user/bookings`

Get all bookings for the authenticated user.

**Auth required:** customer

**Query params**

| Param | Type | Notes |
|---|---|---|
| `status` | string | Filter by booking status |

**Success:** `200 OK`

```json
{
  "data": [
    {
      "id": 123,
      "activity_title": "Yoga",
      "session_date": "2026-03-05",
      "booking_status": "confirmed",
      "payment_status": "paid",
      "amount_paid": 8.00
    }
  ],
  "total": 1
}
```

---

### `GET /api/bookings/{id}`

Get details for a single booking. Ownership is enforced — customers can only view their own bookings.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "id": 123,
  "user_id": 5,
  "activity_id": 1,
  "booking_type": "individual",
  "booking_status": "confirmed",
  "payment_status": "paid",
  "amount_paid": 8.00,
  "sessions": [
    { "session_date": "2026-03-05", "start_time": "09:00:00", "end_time": "10:00:00" }
  ],
  "block_info": { "is_block": false }
}
```

**Errors**

| Status | Message |
|---|---|
| `401` | Not authenticated |
| `403` | `Unauthorized` (booking belongs to another user) |
| `404` | `Booking not found` |

---

### `POST /api/bookings/{id}/pay`

Pay for a promoted waitlist booking. Applies account credit first, then creates a Stripe intent for any remainder.

**Auth required:** customer (must own the booking)
**CSRF required:** Yes

**Success (credit-only):** `200 OK`

```json
{
  "stripe_required": false,
  "credit_applied": 8.00,
  "booking_id": 123,
  "message": "Booking confirmed with account credit."
}
```

**Success (Stripe required):** `200 OK`

```json
{
  "stripe_required": true,
  "credit_applied": 2.00,
  "stripe_amount": 6.00,
  "payment": { "payment_intent_id": "pi_xxx", "client_secret": "pi_xxx_secret_yyy" },
  "booking_id": 123
}
```

**Errors**

| Status | Message |
|---|---|
| `404` | `Booking not found` |
| `403` | `Unauthorized` |
| `422` | `This booking is not awaiting payment` |

---

### `DELETE /api/bookings/{id}`

Cancel a booking. Automatically refunds to account credit.

**Auth required:** customer (must own the booking)
**CSRF required:** Yes — `_csrf_token` query param (Galvani strips DELETE bodies)

**Query params**

| Param | Type | Notes |
|---|---|---|
| `cancel_entire_block` | `1` or empty | If `1`, cancels all future sessions in a block booking |
| `_csrf_token` | string | Required |

**Note:** `cancellation_reason` cannot be sent in the body (Galvani strips it). Pass via query param if needed.

**Success:** `200 OK`

```json
{
  "booking_id": 123,
  "sessions_cancelled": 1,
  "refund_amount": 8.00
}
```

**Errors**

| Status | Message |
|---|---|
| `400` | Any BookingService exception (e.g. already cancelled) |

---

## 4. Participants

### `GET /api/user/participants`

Get all participants (self + children/dependents) for the authenticated user.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "data": [
    { "id": 10, "first_name": "Jane", "last_name": "Smith", "relationship": "self", "date_of_birth": "1985-06-15" }
  ],
  "total": 1
}
```

---

### `GET /api/user/participants/{id}`

Get a single participant. Ownership enforced.

**Auth required:** customer

**Success:** `200 OK` — participant object

**Errors**

| Status | Message |
|---|---|
| `404` | `Participant not found` |

---

### `POST /api/user/participants`

Add a child/dependent participant.

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `first_name` | string | Yes | |
| `last_name` | string | Yes | |
| `date_of_birth` | string | Yes | YYYY-MM-DD |
| `relationship` | string | Yes | `child`, `dependent`, etc. |
| `medical_notes` | string | No | |
| `emergency_contact_name` | string | No | |
| `emergency_contact_phone` | string | No | |

**Success:** `201 Created` — participant object

---

### `PUT /api/user/participants/{id}`

Update a participant. Ownership enforced.

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON):** same fields as create

**Success:** `200 OK` — updated participant object

---

### `DELETE /api/user/participants/{id}`

Delete a participant.

**Auth required:** customer
**CSRF required:** Yes — `_csrf_token` query param

**Success:** `200 OK`

```json
{ "message": "Participant deleted successfully" }
```

---

### `POST /api/user/participants/{id}/consent`

Record parental consent for a child participant.

**Auth required:** customer
**CSRF required:** Yes

**Success:** `200 OK`

```json
{ "message": "Consent recorded successfully" }
```

**Also available as an in-route handler:** `POST /api/participants/{id}/consent` (inside `customer.php`, identical behaviour)

---

## 5. Payments

### `GET /api/payments/stripe/config`

Retrieve the Stripe publishable key for client-side initialisation.

**Auth required:** Any authenticated user

**Success:** `200 OK`

```json
{ "publishable_key": "pk_live_xxx" }
```

---

### `POST /api/payments/stripe/intent`

Create a Stripe PaymentIntent. Use when the caller needs a raw intent without a booking (e.g., credit top-up UI).

**Auth required:** Any authenticated user
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | float | Yes | GBP amount |
| `metadata` | object | No | Arbitrary key/value pairs passed to Stripe |

**Success:** `201 Created`

```json
{
  "payment_intent_id": "pi_xxx",
  "client_secret": "pi_xxx_secret_yyy",
  "amount": 10.00
}
```

---

### `POST /api/payments/stripe/confirm`

Confirm a Stripe payment server-side after the client has authorised it. Handles both booking payments and credit top-ups. **Server-recorded amount is used — the client amount is ignored** (security measure).

**Auth required:** Any authenticated user
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `payment_intent_id` | string | Yes | |
| `booking_id` | integer | No | Omit for credit top-up flow |
| `amount` | float | No | Ignored — server verifies its own recorded amount |

**Success (booking payment):** `200 OK`

```json
{ "confirmed": true, "booking_id": 123, "payment_status": "paid" }
```

**Success (credit top-up):** `200 OK`

```json
{ "balance": 50.00, "credited": 10.00 }
```

**Errors**

| Status | Message |
|---|---|
| `400` | `Missing parameters` |
| `404` | `Payment record not found` |
| `400` | Any PaymentService exception |

**Also available as legacy route in `customer.php`:** `POST /api/payments/stripe/confirm` — identical, delegates to `BookingController::confirmStripePayment()`.

---

### `GET /api/user/payments`

Get payment history for the authenticated user.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "data": [
    { "id": 1, "amount": 8.00, "payment_method": "card", "created_at": "2026-02-01T10:00:00Z" }
  ],
  "total": 1
}
```

---

## 6. Account Credit

### `GET /api/user/account-credit`

Get current credit balance.

**Auth required:** customer

**Success:** `200 OK`

```json
{ "user_id": 5, "balance": 50.00 }
```

---

### `POST /api/user/account-credit/topup`

Add credit to account after a Stripe payment has been completed on the client side.

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | float | Yes | |
| `payment_intent_id` | string | Yes | |

**Success:** `201 Created`

```json
{ "balance": 60.00, "credited": 10.00 }
```

---

### `POST /api/user/account-credit/withdraw`

Request a withdrawal of credit back to a payment card (creates a pending withdrawal request for admin approval).

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `amount` | float | Yes | Must be > 0 and ≤ current balance |

**Success:** `200 OK`

```json
{
  "message": "Withdrawal request submitted successfully",
  "request_id": 7,
  "amount": 20.00
}
```

**Errors**

| Status | Message |
|---|---|
| `422` | `Withdrawal amount must be greater than zero` |
| `422` | `Insufficient credit balance` |

---

### `GET /api/user/account-credit/transactions`

Get credit transaction history for the authenticated user.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "data": [
    { "id": 1, "transaction_type": "topup", "amount": 10.00, "balance_after": 50.00, "created_at": "..." }
  ],
  "total": 5
}
```

---

### `GET /api/withdrawals/{id}`

Get details of a withdrawal request. Ownership enforced.

**Auth required:** customer (must own the request)

**Success:** `200 OK`

```json
{
  "id": 7,
  "user_id": 5,
  "amount": 20.00,
  "status": "pending",
  "requested_at": "2026-02-01T10:00:00Z",
  "requester_name": "Jane Smith"
}
```

**Errors**

| Status | Message |
|---|---|
| `404` | `Withdrawal not found` |
| `403` | `Unauthorized` |

---

## 7. Gift Aid

### `GET /api/user/gift-aid/declaration`

Get the user's active Gift Aid declaration status.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "declaration": { "id": 1, "full_name": "Jane Smith", "address_line1": "...", "status": "active" },
  "has_active_declaration": true
}
```

---

### `POST /api/user/gift-aid/declaration`

Submit a new Gift Aid declaration.

**Auth required:** customer
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `full_name` | string | Yes |
| `address_line1` | string | Yes |
| `city` | string | Yes |
| `postcode` | string | Yes |

**Success:** `201 Created` — declaration object

---

### `PUT /api/user/gift-aid/declaration/withdraw`

Withdraw (revoke) the active Gift Aid declaration.

**Auth required:** customer
**CSRF required:** Yes

**Success:** `200 OK`

```json
{ "message": "Declaration withdrawn successfully" }
```

---

### `GET /api/user/gift-aid/claims`

Get Gift Aid claim history for the authenticated user.

**Auth required:** customer

**Success:** `200 OK`

```json
{
  "data": [ { "id": 1, "tax_year": "2025-2026", "amount": 2.00, "status": "claimed" } ],
  "total": 1
}
```

---

## 8. Instructor Endpoints

All instructor endpoints authenticate via `authenticateRole('instructor')`. Instructors can only see their own sessions and activities.

### `GET /api/instructor/dashboard`

Get instructor overview: stats and next 5 upcoming sessions.

**Auth required:** instructor

**Success:** `200 OK`

```json
{
  "stats": {
    "total_sessions": 30,
    "total_activities": 2,
    "total_participants": 120,
    "attendance_rate": 87
  },
  "upcoming_sessions": [ { "id": 10, "session_date": "2026-03-05", ... } ],
  "timestamp": 1738888888
}
```

---

### `GET /api/instructor/profile`

Get the instructor's own profile.

**Auth required:** instructor

---

### `GET /api/instructor/activities`

List activities assigned to the instructor.

**Auth required:** instructor

---

### `GET /api/instructor/activities/{id}/sessions`

List sessions for an activity (instructor-scoped).

**Auth required:** instructor

---

### `GET /api/instructor/sessions/upcoming`

Get upcoming sessions for the instructor.

**Auth required:** instructor

**Query params**

| Param | Type | Notes |
|---|---|---|
| `date` | string (YYYY-MM-DD) | Optional filter date |

**Success:** `200 OK`

```json
{
  "sessions": [ { "id": 10, "session_date": "2026-03-05", "activity_title": "Yoga", ... } ],
  "total": 5,
  "timestamp": 1738888888
}
```

---

### `GET /api/instructor/sessions/past`

Get past sessions for the instructor, including attendance stats per session.

**Auth required:** instructor

**Query params**

| Param | Type | Notes |
|---|---|---|
| `date` | string (YYYY-MM-DD) | Optional filter date |

**Success:** `200 OK` — same shape as upcoming, with `attendance_stats` added to each session.

---

### `GET /api/instructor/sessions/{id}/bookings`

Get participants booked for a session by numeric session ID.

**Auth required:** instructor (must own the activity)

**Success:** `200 OK`

```json
{
  "session": { "id": 10, "session_date": "2026-03-05", ... },
  "participants": [
    { "booking_id": 123, "first_name": "John", "last_name": "Doe", "attendance_status": "not_marked" }
  ],
  "stats": { "total": 12, "attended": 0, "absent": 0, "not_marked": 12 }
}
```

---

### `GET /api/instructor/sessions/{slug}/{date}/bookings`

Get participants by activity slug and date (no numeric IDs in URLs).

**Auth required:** instructor

**Path params**

| Param | Format | Example |
|---|---|---|
| `slug` | alphanumeric-hyphens | `yoga` |
| `date` | YYYY-MM-DD | `2026-03-05` |

**Success:** Same shape as `sessions/{id}/bookings`.

**Errors**

| Status | Message |
|---|---|
| `404` | `Session not found` |

---

### `POST /api/instructor/attendance/mark`

Mark attendance for one or more participants.

**Auth required:** instructor
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `session_id` | integer | Yes | |
| `attendances` | array | Yes | Array of `{ booking_id, status }` |

Each attendance item:

| Field | Type | Values |
|---|---|---|
| `booking_id` | integer | |
| `status` | string | `attended`, `absent` |

**Success:** `200 OK`

```json
{ "marked": 12, "session_id": 10 }
```

---

### `PUT /api/instructor/sessions/{id}/notes`

Add or update instructor notes on a session.

**Auth required:** instructor
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `notes` | string | Yes |

**Success:** `200 OK`

---

### `GET /api/instructor/stats`

Get full attendance statistics for the instructor.

**Auth required:** instructor

**Success:** `200 OK`

```json
{
  "total_sessions": 30,
  "total_participants": 120,
  "attendance_rate": 87,
  "sessions": [ { "session_date": "2026-03-05", "attended": 10, "absent": 2 } ]
}
```

---

## 9. Admin Endpoints

All admin endpoints authenticate via `authenticateRole('admin')`. Some sub-routes require `super_admin` (noted inline).

### Reports

#### `GET /api/admin/dashboard`

Overall dashboard summary stats.

**Auth required:** admin / super_admin

**Success:** `200 OK` — summary object from `ReportService::getDashboardSummary()`

---

#### `GET /api/admin/reports/bookings`

**Auth required:** admin

---

#### `GET /api/admin/reports/attendance`

**Auth required:** admin

---

#### `GET /api/admin/reports/payments`

**Auth required:** admin

---

#### `GET /api/admin/reports/payments/{activityId}`

Payment detail for a single activity.

**Auth required:** admin

---

#### `GET /api/admin/reports/activities`

**Auth required:** admin

---

#### `GET /api/admin/reports/export`

Export report as CSV download.

**Auth required:** admin

**Query params**

| Param | Type | Notes |
|---|---|---|
| `type` | string | `bookings`, `attendance`, `payments`, etc. Default: `bookings` |

**Success:** `200 OK` with `Content-Type: text/csv` and `Content-Disposition: attachment`

---

### Bookings (Admin)

#### `GET /api/admin/bookings/list`

List all bookings (admin view, excludes cancelled).

**Auth required:** admin

---

#### `GET /api/admin/bookings/{id}`

Get booking + payment details.

**Auth required:** admin

**Success:** `200 OK`

```json
{
  "booking": { "id": 123, ... },
  "payment": { "id": 1, "amount": 8.00, ... }
}
```

---

#### `PUT /api/admin/bookings/{id}`

Update booking status or details.

**Auth required:** admin
**CSRF required:** Yes

---

#### `POST /api/admin/bookings/{id}/promote`

Promote a waitlist booking. Sets `is_waiting_list = 0` and notifies the customer to pay. Also available as a non-JSON form route at `POST /api/admin/bookings/{id}/promote` (in `admin.php`) which returns JSON.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

**Success:** `200 OK`

```json
{ "success": 1, "message": "Booking promoted. Customer notified to pay." }
```

**Errors**

| Status | Message |
|---|---|
| `403` | `Invalid or missing CSRF token` |
| `404` | `Booking not found or not on waiting list.` |

---

#### `POST /api/admin/bookings/{id}/refund`

Process a refund for a booking.

**Auth required:** admin
**CSRF required:** Yes

---

#### `DELETE /api/admin/bookings/{id}`

Delete/cancel a booking as admin.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

#### `GET /api/admin/refundable-bookings`

List bookings eligible for refund (paid, not yet refunded).

**Auth required:** admin

---

#### `GET /api/admin/refunded-bookings`

List bookings that have been refunded.

**Auth required:** admin

---

### Users (Admin)

#### `GET /api/admin/users`

List all users (super_admin sees all roles; admin sees all except super_admin).

**Auth required:** admin

---

#### `POST /api/admin/users`

Create a user.

**Auth required:** admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `email` | string | Yes |
| `password` | string | Yes |
| `first_name` | string | No |
| `last_name` | string | No |
| `phone` | string | No |
| `role` | string | No — defaults to `customer`; only super_admin can set `super_admin` |

**Success:** `201 Created`

---

#### `PUT /api/admin/users/{id}`

Update a user. Cannot escalate to `super_admin` unless you are `super_admin`.

**Auth required:** admin
**CSRF required:** Yes

---

#### `DELETE /api/admin/users/{id}`

Delete a user. Fails if user has active bookings or is assigned as instructor.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

#### `POST /api/admin/users/{id}/refund`

Process a refund on behalf of a user.

**Auth required:** admin

---

#### `GET /api/admin/users/{id}/participants`

List participants belonging to a user.

**Auth required:** admin

---

#### `POST /api/admin/users/{id}/participants`

Create a participant for a user.

**Auth required:** admin

---

### Participants (Admin)

#### `GET /api/admin/participants`

List all participants.

**Auth required:** admin

---

#### `DELETE /api/admin/participants/{id}`

Delete a participant.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

### Venues (Admin)

#### `GET /api/admin/venues`

**Auth required:** admin

---

#### `GET /api/admin/venues/{id}`

**Auth required:** admin

---

#### `POST /api/admin/venues`

**Auth required:** admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `address` | string | No |
| `postcode` | string | No |
| `contact_phone` | string | No |

---

#### `PUT /api/admin/venues/{id}`

**Auth required:** admin
**CSRF required:** Yes

---

#### `DELETE /api/admin/venues/{id}`

Fails if venue has linked spaces.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

#### `POST /api/admin/venues/{id}/image`

Upload a venue image (multipart/form-data).

**Auth required:** admin

---

#### `DELETE /api/admin/venues/{id}/image`

Delete venue image.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

### Bookable Spaces (Admin)

#### `GET /api/admin/spaces`

**Auth required:** admin

---

#### `GET /api/admin/spaces/{id}`

**Auth required:** admin

---

#### `POST /api/admin/spaces`

**Auth required:** admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `venue_id` | integer | Yes | |
| `name` | string | Yes | |
| `space_type` | string | Yes | `pitch`, `court`, `classroom`, `meeting_room`, `studio`, `gym`, `outdoor`, `room_hire`, `other` |
| `capacity` | integer | No | |
| `description` | string | No | |

---

#### `PUT /api/admin/spaces/{id}`

**Auth required:** admin
**CSRF required:** Yes

---

#### `DELETE /api/admin/spaces/{id}`

Fails if space has linked activities.

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

#### `POST /api/admin/spaces/{id}/image`

**Auth required:** admin

---

#### `DELETE /api/admin/spaces/{id}/image`

**Auth required:** admin
**CSRF required:** Yes — `_csrf_token` query param

---

### Activity Types (Admin)

#### `GET /api/admin/activity-types`

**Auth required:** admin

---

### Gift Aid (Admin)

#### `GET /api/admin/gift-aid`

Overview of all Gift Aid declarations and claims.

**Auth required:** super_admin

---

#### `GET /api/admin/gift-aid/export`

Export Gift Aid schedule as an `.ods` HMRC submission file.

**Auth required:** super_admin

**Query params**

| Param | Type | Notes |
|---|---|---|
| `tax_year` | string | e.g. `2025-2026`; defaults to current UK tax year |

**Success:** `200 OK` with `Content-Type: application/vnd.oasis.opendocument.spreadsheet`

---

### Payment Settings (Admin)

#### `GET /api/admin/settings/payments`

Retrieve Stripe key settings (masked in view).

**Auth required:** super_admin

---

#### `POST /api/admin/settings/payments`

Save Stripe keys (stored AES-256-GCM encrypted in `app_settings`).

**Auth required:** super_admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `stripe_publishable_key` | string | No |
| `stripe_secret_key` | string | No |
| `stripe_webhook_secret` | string | No |

---

### Withdrawals (Admin)

#### `POST /api/admin/withdrawals/{id}/process`

Approve and process a pending withdrawal — deducts amount from user's credit balance.

**Auth required:** super_admin
**CSRF required:** Yes

**Success:** redirect to `/admin/credit` with flash message

---

#### `POST /api/admin/withdrawals/{id}/reject`

Reject a pending withdrawal.

**Auth required:** super_admin
**CSRF required:** Yes

---

## 10. Notifications & Subscriptions

These are HTML form POST routes (no JSON body), but document the server-side behaviour.

### Admin Notification Subscriptions

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/admin/notification-subscriptions/create` | admin | Create subscription |
| `POST` | `/admin/notification-subscriptions/{id}/edit` | admin | Update subscription |
| `POST` | `/admin/notification-subscriptions/{id}/delete` | admin | Delete subscription |

**Subscription fields**

| Field | Type | Required | Values |
|---|---|---|---|
| `event_type` | string | Yes | `new_booking`, `cancellation`, `waitlist_join`, `payment_received`, `payment_failed`, `new_user`, `attendance_reminder` |
| `activity_id` | integer | No | Scope to specific activity |
| `session_id` | integer | No | Scope to specific session |
| `email_enabled` | checkbox | No | `0` or `1` |
| `sms_enabled` | checkbox | No | `0` or `1` |
| `whatsapp_enabled` | checkbox | No | `0` or `1` |
| `in_app_enabled` | integer | No | `0` or `1` (admin-only field) |

### Instructor Notification Subscriptions

Same pattern under `/instructor/notification-subscriptions/*`. `activity_id` is validated to ensure it belongs to the instructor.

### Customer Notification Preferences

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/account/notifications` | customer | View preferences |
| `POST` | `/account/notifications` | customer | Save preferences |

**Preference fields**

| Field | Type | Notes |
|---|---|---|
| `email_notifications` | checkbox | |
| `sms_notifications` | checkbox | |
| `whatsapp_notifications` | checkbox | |
| `bird_notification_phone` | string | E.164 format for SMS/WhatsApp |

---

## 11. Misc Admin Utility Endpoints

### `GET /admin/api/sessions-for-activity` (admin-scoped)

Return upcoming sessions for a given activity (for notification subscription form select).

**Auth required:** admin

**Query params**

| Param | Type | Required |
|---|---|---|
| `activity_id` | integer | Yes |

**Success:** `200 OK` — JSON array

```json
[
  { "id": 10, "session_date": "2026-03-05", "start_time": "09:00:00" }
]
```

---

### `GET /instructor/api/sessions-for-activity` (instructor-scoped)

Same as above but filtered to activities belonging to the authenticated instructor.

**Auth required:** instructor

---

## 12. Notification Broadcast API

Two-step preview-then-send flow for ad-hoc email broadcasts to targeted customer groups. Designed to be driven by the `admin_notify` MCP tool, but also callable directly.

**Flow:** `preview` → admin reviews recipients → `send` (token consumed, double-send prevented)

### `POST /api/admin/notifications/preview`

Resolve recipients for an audience and return a short-lived send token. Emails are **never** returned in the response — only recipient names.

**Auth required:** admin / super_admin
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required | Notes |
|---|---|---|---|
| `audience_type` | string | Yes | `all_customers`, `activity`, `session`, or `user` |
| `audience_id` | integer | Conditional | Required for `activity`, `session`, `user` — the activity ID, session ID, or user ID |
| `subject` | string | Yes | Email subject line |
| `body` | string | Yes | Plain text body — server wraps in HTML template |

**Success:** `200 OK`

```json
{
  "token": "a1b2c3d4...",
  "expires_at": 1739700000,
  "recipient_count": 12,
  "recipients": [{ "name": "Jane Smith" }, { "name": "John Doe" }],
  "subject": "Important update",
  "body_preview": "First 300 chars of body...",
  "channel": "email"
}
```

Token expires in 5 minutes. Pass it to `/send` to complete the broadcast.

**Errors**

| Status | Message |
|---|---|
| `400` | `audience_type is required` / `subject is required` / `body is required` |
| `400` | `audience_id required for type: activity` (etc.) |
| `400` | `Audience exceeds maximum of 500 recipients` |
| `404` | `No recipients found for the specified audience` |

---

### `POST /api/admin/notifications/send`

Consume a preview token and send the broadcast email to all resolved recipients. Token is deleted immediately after retrieval — calling this twice with the same token returns a 400.

**Auth required:** admin / super_admin (must be the same admin who called `preview`)
**CSRF required:** Yes

**Request body (JSON)**

| Field | Type | Required |
|---|---|---|
| `token` | string | Yes |

**Success:** `200 OK`

```json
{
  "broadcast_id": 7,
  "sent": 12,
  "failed": 0,
  "recipient_count": 12
}
```

Broadcast is logged to the `notification_broadcasts` table.

**Errors**

| Status | Message |
|---|---|
| `400` | `token is required` |
| `400` | `Invalid or expired token — run preview again` |
| `400` | `Token has expired — run preview again` |
| `403` | `Token does not belong to the current user` |

---

### `GET /api/admin/notifications/history`

Return the last 50 broadcasts (most recent first).

**Auth required:** admin / super_admin

**Success:** `200 OK`

```json
[
  {
    "id": 7,
    "audience_type": "all_customers",
    "audience_id": null,
    "channel": "email",
    "subject": "Important update",
    "recipient_count": 12,
    "sent_at": "2026-02-15 14:30:00",
    "sent_by_name": "Admin User"
  }
]
```

---

## 13. Real-time / Polling

### `GET /api/updates`

HTTP long-poll fallback for LAMP deployments. Returns notifications/updates since a given timestamp.

**Auth required:** Any authenticated user

**Query params**

| Param | Type | Notes |
|---|---|---|
| `since` | integer | Unix timestamp; returns updates after this point |

**Success:** `200 OK` — array of update objects

---

## Route Summary Table

| Method | Path | Auth | Domain |
|---|---|---|---|
| `POST` | `/api/auth/register` | public | Auth |
| `POST` | `/api/auth/login` | public | Auth |
| `POST` | `/api/auth/logout` | public | Auth |
| `GET` | `/api/auth/verify-token` | public | Auth |
| `GET` | `/api/user/profile` | customer | Auth |
| `PUT` | `/api/user/profile` | customer | Auth |
| `GET` | `/api/activities` | public | Activities |
| `GET` | `/api/activities/{id}` | public | Activities |
| `GET` | `/api/activities/{slug}/availability` | public | Activities |
| `GET` | `/api/activities/{id}/sessions` | public | Activities |
| `GET` | `/api/activities/{activityId}/sessions/{sessionId}` | public | Activities |
| `POST` | `/api/admin/activities` | admin | Activities |
| `PUT` | `/api/admin/activities/{id}` | admin | Activities |
| `DELETE` | `/api/admin/activities/{id}` | admin | Activities |
| `POST` | `/api/admin/activities/{id}/sessions` | admin | Activities |
| `POST` | `/api/admin/activities/{id}/images` | admin | Activities |
| `PUT` | `/api/admin/activities/{activityId}/images/{imageId}/thumbnail` | admin | Activities |
| `DELETE` | `/api/admin/activities/{activityId}/images/{imageId}` | admin | Activities |
| `POST` | `/api/bookings` | customer | Bookings |
| `GET` | `/api/user/bookings` | customer | Bookings |
| `GET` | `/api/bookings/{id}` | customer | Bookings |
| `POST` | `/api/bookings/{id}/pay` | customer | Bookings |
| `DELETE` | `/api/bookings/{id}` | customer | Bookings |
| `GET` | `/api/user/participants` | customer | Participants |
| `GET` | `/api/user/participants/{id}` | customer | Participants |
| `POST` | `/api/user/participants` | customer | Participants |
| `PUT` | `/api/user/participants/{id}` | customer | Participants |
| `DELETE` | `/api/user/participants/{id}` | customer | Participants |
| `POST` | `/api/user/participants/{id}/consent` | customer | Participants |
| `GET` | `/api/payments/stripe/config` | any auth | Payments |
| `POST` | `/api/payments/stripe/intent` | any auth | Payments |
| `POST` | `/api/payments/stripe/confirm` | any auth | Payments |
| `GET` | `/api/user/payments` | customer | Payments |
| `GET` | `/api/user/account-credit` | customer | Credit |
| `POST` | `/api/user/account-credit/topup` | customer | Credit |
| `POST` | `/api/user/account-credit/withdraw` | customer | Credit |
| `GET` | `/api/user/account-credit/transactions` | customer | Credit |
| `GET` | `/api/withdrawals/{id}` | customer | Credit |
| `GET` | `/api/user/gift-aid/declaration` | customer | Gift Aid |
| `POST` | `/api/user/gift-aid/declaration` | customer | Gift Aid |
| `PUT` | `/api/user/gift-aid/declaration/withdraw` | customer | Gift Aid |
| `GET` | `/api/user/gift-aid/claims` | customer | Gift Aid |
| `GET` | `/api/instructor/dashboard` | instructor | Instructor |
| `GET` | `/api/instructor/profile` | instructor | Instructor |
| `GET` | `/api/instructor/activities` | instructor | Instructor |
| `GET` | `/api/instructor/activities/{id}/sessions` | instructor | Instructor |
| `GET` | `/api/instructor/sessions/upcoming` | instructor | Instructor |
| `GET` | `/api/instructor/sessions/past` | instructor | Instructor |
| `GET` | `/api/instructor/sessions/{id}/bookings` | instructor | Instructor |
| `GET` | `/api/instructor/sessions/{slug}/{date}/bookings` | instructor | Instructor |
| `POST` | `/api/instructor/attendance/mark` | instructor | Instructor |
| `PUT` | `/api/instructor/sessions/{id}/notes` | instructor | Instructor |
| `GET` | `/api/instructor/stats` | instructor | Instructor |
| `GET` | `/api/admin/dashboard` | admin | Admin |
| `GET` | `/api/admin/reports/bookings` | admin | Admin |
| `GET` | `/api/admin/reports/attendance` | admin | Admin |
| `GET` | `/api/admin/reports/payments` | admin | Admin |
| `GET` | `/api/admin/reports/payments/{activityId}` | admin | Admin |
| `GET` | `/api/admin/reports/activities` | admin | Admin |
| `GET` | `/api/admin/reports/export` | admin | Admin |
| `GET` | `/api/admin/bookings/list` | admin | Admin |
| `GET` | `/api/admin/bookings/{id}` | admin | Admin |
| `PUT` | `/api/admin/bookings/{id}` | admin | Admin |
| `POST` | `/api/admin/bookings/{id}/promote` | admin | Admin |
| `POST` | `/api/admin/bookings/{id}/refund` | admin | Admin |
| `DELETE` | `/api/admin/bookings/{id}` | admin | Admin |
| `GET` | `/api/admin/refundable-bookings` | admin | Admin |
| `GET` | `/api/admin/refunded-bookings` | admin | Admin |
| `GET` | `/api/admin/users` | admin | Admin |
| `POST` | `/api/admin/users` | admin | Admin |
| `PUT` | `/api/admin/users/{id}` | admin | Admin |
| `DELETE` | `/api/admin/users/{id}` | admin | Admin |
| `POST` | `/api/admin/users/{id}/refund` | admin | Admin |
| `GET` | `/api/admin/users/{id}/participants` | admin | Admin |
| `POST` | `/api/admin/users/{id}/participants` | admin | Admin |
| `GET` | `/api/admin/participants` | admin | Admin |
| `DELETE` | `/api/admin/participants/{id}` | admin | Admin |
| `GET` | `/api/admin/venues` | admin | Admin |
| `GET` | `/api/admin/venues/{id}` | admin | Admin |
| `POST` | `/api/admin/venues` | admin | Admin |
| `PUT` | `/api/admin/venues/{id}` | admin | Admin |
| `DELETE` | `/api/admin/venues/{id}` | admin | Admin |
| `POST` | `/api/admin/venues/{id}/image` | admin | Admin |
| `DELETE` | `/api/admin/venues/{id}/image` | admin | Admin |
| `GET` | `/api/admin/spaces` | admin | Admin |
| `GET` | `/api/admin/spaces/{id}` | admin | Admin |
| `POST` | `/api/admin/spaces` | admin | Admin |
| `PUT` | `/api/admin/spaces/{id}` | admin | Admin |
| `DELETE` | `/api/admin/spaces/{id}` | admin | Admin |
| `POST` | `/api/admin/spaces/{id}/image` | admin | Admin |
| `DELETE` | `/api/admin/spaces/{id}/image` | admin | Admin |
| `GET` | `/api/admin/activity-types` | admin | Admin |
| `GET` | `/api/admin/gift-aid` | super_admin | Admin |
| `GET` | `/api/admin/gift-aid/export` | super_admin | Admin |
| `GET` | `/api/admin/settings/payments` | super_admin | Admin |
| `POST` | `/api/admin/settings/payments` | super_admin | Admin |
| `POST` | `/api/admin/withdrawals/{id}/process` | super_admin | Admin |
| `POST` | `/api/admin/withdrawals/{id}/reject` | super_admin | Admin |
| `POST` | `/api/admin/notifications/preview` | admin | Notifications |
| `POST` | `/api/admin/notifications/send` | admin | Notifications |
| `GET` | `/api/admin/notifications/history` | admin | Notifications |
| `GET` | `/api/updates` | any auth | Real-time |
