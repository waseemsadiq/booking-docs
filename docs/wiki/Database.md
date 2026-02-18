# Database

## Overview

The database is **MariaDB** (embedded in Galvani for development; standard MySQL on your LAMP host). The schema uses InnoDB with `utf8mb4_unicode_ci` throughout. All SQL lives in Repository classes — never in Controllers or Services.

Schema file: `database/schema.sql`
Seed data: `database/seeds.sql`

---

## SQL Access Patterns

All database queries must go through Repository classes in `app/Repositories/`. Never call `Database::getInstance()` directly in Services, Controllers, Route files, or Views.

**Pattern:**
1. Find the appropriate Repository for the table (e.g. users → `UserRepository`, bookings → `BookingRepository`)
2. Add a method to the Repository if one does not exist
3. Call the Repository method from your Service or Controller

**AppSettings access:** Use `AppSettingsRepository::get($key)` / `::set($key, $value)` instead of querying `app_settings` directly. Use `getMultiple($keys[])` to fetch several settings in one query.

**NotificationSubscriptions access:** Use `NotificationSubscriptionRepository` for all reads and writes to `user_notification_subscriptions`. Do not query this table from Services or Controllers.

**Quick reference:**

| Table | Repository |
|---|---|
| `app_settings` | `AppSettingsRepository` |
| `user_notification_subscriptions` | `NotificationSubscriptionRepository` |
| `bookings` | `BookingRepository` |
| `payments`, `account_credit_transactions` | `PaymentRepository` |
| `sessions` | `SessionRepository` |
| `users`, `participants` | `UserRepository` |
| `activities` | `ActivityRepository` |
| `venues` | `VenueRepository` |
| `bookable_spaces` | `SpaceRepository` |
| `attendance_logs` | `AttendanceRepository` |
| `gift_aid_declarations`, `gift_aid_claims` | `GiftAidRepository` |
| `audit_logs` | `AuditLogRepository` |
| `notification_logs`, `notification_broadcasts` | `NotificationRepository` |
| `withdrawal_requests` | `WithdrawalRepository` |

---

## Reset the database

```bash
./galvani db-init.php
```

This is a **destructive operation**. It drops the `booking_app` database, recreates it, imports `schema.sql`, then imports `seeds.sql` (test accounts, sample activities, etc.).

Run this from the git root (`well-booking/`).

---

## Tables

### Core user tables

#### `users`
The central user record. One row per person who has registered.

| Column | Type | Notes |
|---|---|---|
| `id` | int AUTO_INCREMENT | internal only — never exposed in URLs |
| `email` | varchar(255) UNIQUE | login identifier |
| `password_hash` | varchar(255) | bcrypt |
| `first_name`, `last_name` | varchar | |
| `phone` | varchar(20) | |
| `date_of_birth` | date | |
| `account_type` | enum | `individual` or `parent` |
| `role` | enum | `customer`, `instructor`, `admin`, `super_admin` |
| `account_credit` | decimal(10,2) | current balance in GBP |
| `email_verified` | tinyint(1) | `0`/`1` |

#### `participants`
A participant is the person who actually attends an activity — either the user themselves (`relationship = 'self'`) or a child/dependent they manage.

| Column | Notes |
|---|---|
| `user_id` | FK → `users.id` (the account holder) |
| `relationship` | `self`, `child`, `dependent` |
| `parental_consent` | tinyint(1) required for minors |
| `medical_notes` | free text |
| `emergency_contact_name/phone` | |

#### `gdpr_consents`
Records each consent given at registration (or later). One row per consent type per user.

| Column | Notes |
|---|---|
| `consent_type` | `terms_conditions`, `privacy_policy`, `marketing`, `data_processing` |
| `consent_given` | tinyint(1) |
| `consent_version` | version string for future re-consent |
| `ip_address`, `user_agent` | GDPR audit trail |

---

### Activity and session tables

#### `venues`
Physical locations. The Well Foundation has two: the registered address in Bellshill and the operating site at Eurocentral.

| Column | Notes |
|---|---|
| `name` | e.g. "Eurocentral Sports Hub" |
| `address`, `postcode` | |
| `image_path` | single image, stored in `uploads/venues/` |

#### `bookable_spaces`
A space within a venue (e.g. a pitch, court, meeting room). One venue has many spaces.

| Column | Notes |
|---|---|
| `venue_id` | FK → `venues.id` |
| `space_type` | `pitch`, `court`, `classroom`, `meeting_room`, `studio`, `gym`, `outdoor`, `other`, `room_hire` |
| `capacity` | max occupants |
| `image_path` | single image |

#### `activity_types`
A classification taxonomy for activities (e.g. "Football", "Yoga", "Meeting Room Hire").

| Column | Notes |
|---|---|
| `category` | `sports`, `classes`, `outdoor`, `indoor`, `meeting_room` |

#### `activities`
A recurring programme (e.g. "Monday Evening Football"). This is the bookable unit visible to customers. Sessions are generated automatically from the activity's frequency and dates.

| Column | Notes |
|---|---|
| `slug` | UNIQUE — used in all customer-facing URLs (never numeric ID) |
| `activity_type_id` | FK → `activity_types` |
| `bookable_space_id` | FK → `bookable_spaces` |
| `instructor_id` | FK → `users` (nullable) |
| `frequency` | `single`, `weekly`, `fortnightly`, `monthly`, `annually` |
| `start_date`, `end_date` | programme date range |
| `start_time`, `end_time` | session times |
| `price_per_session` | decimal in GBP |
| `capacity` | max bookings per session |
| `allow_waiting_list` | tinyint(1) |
| `cancellation_hours` | hours notice required for cancellation (default 24) |
| `pricing_type` | `per_booking` or `per_hour` (used by meeting room hire) |
| `status` | `draft`, `published`, `archived` |

#### `activity_images`
Multiple images per activity (activities use a gallery; venues use a single `image_path`).

| Column | Notes |
|---|---|
| `activity_id` | FK → `activities` |
| `file_path` | relative path in `uploads/activities/` |
| `is_thumbnail` | tinyint(1) — which image appears on the listing card |
| `display_order` | sort order in the gallery |

#### `sessions`
A single occurrence of an activity on a specific date. Generated ahead of time by `SessionService::ensureSessionsAhead()` (called on admin dashboard load).

| Column | Notes |
|---|---|
| `activity_id` | FK → `activities` |
| `session_date` | date |
| `start_time`, `end_time` | time (may differ from activity defaults) |
| `capacity_override` | overrides activity capacity for this session |
| `status` | `scheduled`, `cancelled`, `completed` |
| `instructor_notes` | text added by instructor |

#### `space_reservations`
Prevents double-booking of a physical space. One row per (space, date, time-slot) combination.

| Unique key | `bookable_space_id` + `reservation_date` + `start_time` + `end_time` |
|---|---|

---

### Booking and payment tables

#### `bookings`
The core transactional table. One row per (participant, session) combination.

| Column | Notes |
|---|---|
| `user_id` | FK → `users` (account holder who made the booking) |
| `participant_id` | FK → `participants` (person attending) |
| `activity_id` | FK → `activities` |
| `session_id` | FK → `sessions` (null for block bookings) |
| `booking_type` | `block` (all sessions) or `individual` (one session) |
| `booking_status` | `confirmed`, `pending`, `cancelled`, `completed`, `cancellation_requested` |
| `payment_status` | `pending`, `paid`, `refunded`, `partially_refunded` |
| `amount_paid` | decimal in GBP |
| `amount_refunded` | decimal in GBP |
| `is_waiting_list` | tinyint(1) — `1` = on waitlist, `0` = booked |
| `waiting_list_position` | int |
| `attendance_status` | `pending`, `attended`, `absent`, `cancelled` |

#### `payments`
Financial transactions. Supports Stripe card payments, account credit deductions, and admin manual adjustments.

| Column | Notes |
|---|---|
| `booking_id` | FK → `bookings` (nullable — credit top-ups are not linked to a booking) |
| `payment_type` | `booking`, `credit_topup`, `refund` |
| `payment_method` | `stripe_card`, `account_credit`, `admin_manual` |
| `amount` | decimal in GBP |
| `gift_aid_eligible` | tinyint(1) |
| `stripe_payment_intent_id` | for Stripe payments |
| `stripe_charge_id`, `stripe_refund_id` | set after capture/refund |
| `payment_status` | `pending`, `completed`, `failed`, `refunded`, `partially_refunded` |

#### `account_credit_transactions`
Audit log for every change to a user's `account_credit` balance.

| Column | Notes |
|---|---|
| `transaction_type` | `topup`, `deduction`, `refund`, `admin_adjustment` |
| `balance_after` | snapshot of credit balance after this transaction |
| `reference_type` | `payment`, `booking`, `refund`, `manual` |

#### `withdrawal_requests`
Requests from customers to withdraw their account credit as a Stripe refund.

| Column | Notes |
|---|---|
| `status` | `pending`, `approved`, `rejected`, `completed` |
| `stripe_refund_id` | set when the Stripe refund is processed |

---

### Meeting room hire

#### `room_hire_booking_details`
Extended details for meeting room bookings (one-to-one with a `bookings` row).

| Column | Notes |
|---|---|
| `booking_id` | UNIQUE FK → `bookings` |
| `purpose` | `meeting`, `training`, `event`, `interview`, `other` |
| `attendee_count` | |
| `organisation` | optional company/org name |
| `requirements` | free text |

#### `room_hire_blockouts`
Admin-defined date/time blocks that prevent room hire bookings (e.g. for internal events).

---

### Gift Aid tables

#### `gift_aid_declarations`
A GDPR-compliant Gift Aid declaration from a UK taxpayer. Required before `gift_aid_claims` can be raised.

#### `gift_aid_claims`
One row per eligible payment. Linked to the declaration and tracks HMRC submission status (`eligible`, `claimed`, `received`).

---

### Notification and audit tables

#### `notifications`
A log of every notification sent (email, SMS, WhatsApp, in-app) and its delivery status.

| Column | Notes |
|---|---|
| `channel` | `email`, `sms`, `whatsapp`, `in_app` |
| `cost` | decimal(8,4) — Bird SMS/WhatsApp costs tracked per message |
| `status` | `pending`, `sent`, `failed` |
| `read_at` | timestamp set when in-app notification is read |

#### `notification_broadcasts`
Audit log of every admin-initiated broadcast email (sent via the `admin_notify` MCP tool or the notification broadcast API). One row per send action.

| Column | Notes |
|---|---|
| `sent_by_user_id` | FK → `users` (the admin who sent the broadcast) |
| `audience_type` | `all_customers`, `activity`, `session`, or `user` |
| `audience_id` | int — the activity ID, session ID, or user ID (null for `all_customers`) |
| `channel` | `email` (only channel currently supported) |
| `subject` | email subject line |
| `body` | plain text body as entered by the admin |
| `recipient_count` | number of emails successfully sent |
| `sent_at` | timestamp of the send action |

#### `user_preferences`
One row per user. Controls notification channel opt-ins and UI theme preference.

#### `user_notification_subscriptions`
Allows admins and instructors to subscribe to specific event types (e.g. "email me when a new booking is made for Yoga").

#### `audit_logs`
Immutable record of all significant actions (logins, payments, refunds, CRUD on key entities).

#### `app_settings`
Key-value store for admin-configurable settings. Stripe keys, SMTP password, Resend API key, and Bird credentials are stored encrypted with AES-256-GCM.

---

## Key relationships

```
venues
  └── bookable_spaces (many per venue)
        └── activities (many per space)
              └── sessions (one per date, generated automatically)
                    └── space_reservations (one per session — prevents double-booking)
                    └── bookings (one per participant per session)
                          └── attendance_logs (one per booking per session)
                          └── payments (one or more per booking)
                                └── gift_aid_claims

users
  └── participants (self + any children)
        └── bookings
  └── account_credit_transactions
  └── user_preferences
  └── gdpr_consents
  └── withdrawal_requests
```

---

## Slug-based URLs

Activity slugs are auto-generated from the title (`yoga-flow`, `yoga-flow-2` for duplicates). The slug is stored on the `activities` table and used in all customer-facing URLs. Numeric IDs are never exposed in the browser.

Customer session URLs: `/activities/{slug}/{date}`
Instructor session URLs: `/instructor/sessions/{slug}/{date}`
