# Admin User Guide — The Well Foundation Booking System

This guide covers everything you can do as an administrator or super administrator of the WFCS booking platform. Whether you are managing a waitlist, processing a refund, or setting up a new activity, you will find numbered step-by-step instructions for every task.

---

## Table of Contents

1. [Overview and logging in](#1-overview-and-logging-in)
2. [Managing bookings](#2-managing-bookings)
3. [Waitlist management](#3-waitlist-management)
4. [Attendance](#4-attendance)
5. [User management](#5-user-management)
6. [Activity management](#6-activity-management)
7. [Meeting room bookings](#7-meeting-room-bookings)
8. [Venues and spaces](#8-venues-and-spaces)
9. [Payments (super admin)](#9-payments-super-admin)
10. [Settings (super admin)](#10-settings-super-admin)
11. [Account settings and notifications](#11-account-settings-and-notifications)
12. [Instructor features](#12-instructor-features)
13. [Using Claude as your AI assistant (MCP)](#13-using-claude-as-your-ai-assistant-mcp)

---

## 1. Overview and logging in

### Logging in

1. Navigate to the booking site and select **Log in**.
2. Enter your admin email address and password.
3. Select **Log in**.

You land on the admin dashboard at `/admin`.

### Dashboard orientation

The dashboard gives you an at-a-glance view of the day's activity. At the top you will find two tabs:

- **Activities** — a calendar of scheduled sessions with a toggle between Month, Week, and Day view. Each session slot shows the time, activity name, and booking count against capacity. Colour coding tells you at a glance whether a session is available (blue), full (amber), or past (grey).
- **Meeting rooms** — a horizontal timeline showing which rooms are booked and at what times for the selected date.

Below the calendar, stat cards summarise Total Users, Activities, Sessions, Active Bookings, and Waiting List count. Super admins also see Revenue and Awaiting Payment figures.

To jump to a different month or week on the calendar, use the **Prev** and **Next** arrows. A **Back to today** button appears when you have navigated away from the current period. To move to a different day in Day view, use the date navigation arrows or select **Today**.

Clicking any session slot on the calendar opens a quick-view panel showing the activity title, date, time, instructor, venue, and booking progress bar. Select **Manage session** from that panel to go to the full session detail page.

### Navigation

**Admin** role sees: Dashboard, Bookings, Users, Resources, Log out.

**Super admin** role sees: Dashboard, Bookings, Users, Payments, Resources, Settings, Log out.

Sub-tabs appear within each section:

- Bookings: Bookings, Attendance, Waitlist, Meeting rooms
- Payments: Cancellations, Payments received, Refunds, Withdrawals, Gift Aid, Credit accounts, Discount codes
- Resources: Activities, Meeting rooms, Spaces, Venues
- Settings: Stripe, Notification Services, Notification Templates, Account

---

## 2. Managing bookings

Go to **Bookings** in the top navigation. You land on the Bookings sub-tab.

### Viewing the bookings list

The bookings list shows upcoming bookings (today and future sessions) ordered by session date, most recent first. Columns show: Booking number, Participant, Activity, Session date, Amount paid, and Status. Past bookings are available in the Payments section.

Stat cards at the top of the page reflect the same upcoming-only view: Total, Confirmed, Awaiting payment, and (for super admins) Revenue and Average value.

Status badges tell you the state of each booking:

| Badge | Meaning |
|---|---|
| Confirmed (green) | Active booking, payment received |
| Awaiting payment (amber) | Booking held, payment not yet complete |
| Waiting list (blue) | On the waitlist, not yet confirmed |
| Cancellation requested (amber) | Customer has asked to cancel |
| Cancelled (red) | Booking has been cancelled |
| Expired (unpaid) (grey) | Promoted from waitlist but payment was not made before the session |

### Viewing booking details

1. Click any row in the bookings table.
2. A detail panel opens showing: participant, date of birth, booked by (account holder), activity, session, venue, booking type (Single or Block), booking date, booking and payment status, attendance status, amount paid, payment method, paid-on date, and any cancellation information.

### Walk-ins

When someone turns up to a session without an account or a booking, the instructor adds them from the session register (see *Instructor features → Adding a walk-in*). Their booking appears here like any other, with a purple **Walk-in** badge.

- **Find them:** use the **All sources → Walk-ins** filter on the bookings list.
- **Payment:** a walk-in booking is left unpaid, so it shows under **Awaiting payment**. The customer pays from their account like any outstanding booking.
- **New accounts:** someone who didn't have an account is emailed a link to set one up (valid for 7 days). On the booking's detail page you'll see who added them. While they haven't set a password yet, there's also a **Resend set-up email** button.
- **Onboarding:** add any missing details (address, medical notes, emergency contacts) from the user's edit page as usual.

### Cancelling a booking

1. Click the booking row to open the detail panel.
2. Select **Cancel this booking** (only visible for active bookings).
3. Confirm the cancellation in the prompt. The system will note the amount paid. If the booking has an unpaid balance or has already been refunded, the prompt reflects this.
4. The booking status changes to Cancelled. If the customer had paid, the amount is returned to their account credit automatically.

You can also cancel directly from the full booking detail page:

1. Navigate to **Bookings**, then click the booking row and select **Manage booking** (if a full-page link is available), or access the booking at `/admin/bookings/{id}`.
2. Select **Cancel booking** on that page and confirm.

---

## 3. Waitlist management

Go to **Bookings**, then select the **Waitlist** sub-tab.

The table lists every customer currently on a waitlist, showing: participant name, parent or carer name, activity, session date, and the date and time they joined the waitlist.

### Promoting a customer from the waitlist

When a space becomes available, you can promote a customer from the waitlist to a confirmed pending booking.

1. Find the customer in the Waitlist table.
2. Select **Promote** in the Actions column.
3. A confirmation prompt appears showing the participant's name and activity. Confirm the promotion.
4. The system moves the booking off the waitlist. The customer's booking status changes to Pending / Awaiting payment, and they receive a payment request notification.

The customer must then complete payment before the session starts. If they do not pay in time, the booking is marked as Expired (unpaid) and cleaned up automatically the next time the bookings list is loaded.

You can also promote from the full booking detail page at `/admin/bookings/{id}` by selecting **Promote from waitlist**.

---

## 4. Attendance

Go to **Bookings**, then select the **Attendance** sub-tab.

You can view attendance two ways:

- **By Activity** — one row per activity showing total sessions, total bookings, attended, absent, unmarked, and attendance rate.
- **By Session** — one row per session showing date, activity name, and the same breakdown.

Select the **By Activity** or **By Session** buttons to switch views.

Attendance rates are colour coded: green for 80% and above, amber for 60–79%, and red below 60%.

Instructors mark attendance from their own session detail pages (see [Instructor features](#12-instructor-features)). The data feeds directly into these reports.

**Note:** Marking a participant as absent cancels their booking. If the booking was paid, what they paid (less any discount) is refunded to their account credit, the same as a cancellation. If it was never confirmed (for example a group enrolment), it is simply cancelled. Marking someone as attended who hasn't paid sends them a payment request.

---

## 5. User management

Go to **Users** in the top navigation.

The table shows all users with columns for Name, Email, Role, Account credit, and Date joined. Role badges use colour coding: red for super admin, purple for admin, blue for instructor, green for customer.

### Searching and sorting users

Click any column header to sort the table by that column. The table supports ascending and descending sort. All columns are sortable.

### Creating a new user

1. Select **Add user** at the top right.
2. A panel opens. Enter the first name, last name, email address, password, phone number (optional), and role.
3. Available roles are: Customer, Instructor, Admin, and (for super admins) Super Admin.
4. Select **Save user**.

### Editing a user

1. Find the user in the table and select **Edit** in their row.
2. The edit panel opens pre-filled with their current details.
3. Update any fields. Leave the password field blank to keep their existing password.
4. Select **Save changes**.

### Resetting a user's password

1. Find the user in the table and select **Edit**.
2. Enter a new password in the Password field.
3. Select **Save changes**.

The user's password is updated immediately.

### Deleting a user

1. Find the user in the table and select **Delete** in their row.
2. Confirm the deletion in the prompt.

**Important warning:** Deleting a user cannot be undone.

### Viewing a user's account credit

Account credit is shown in the Credit column of the users table. To see the full credit history and transaction log, go to **Payments** (super admin) and then **Credit accounts** (see [Credit accounts](#credit-accounts)).

---

## 6. Activity management

Go to **Resources** in the top navigation. You land on the **Activities** sub-tab.

Activities are the core offering — yoga classes, fitness sessions, workshops, and so on. Before you can create an activity, you need at least one venue and one space. If either is missing, the system shows a setup guide directing you to create them first.

Activities are displayed as cards showing the image, status badge, price badge, frequency, time, and capacity.

### Creating an activity

1. Select **Add activity** at the top right.
2. A panel opens. Fill in:
   - **Title** (required)
   - **Primary instructor** — the instructor responsible for the activity (selected from instructor-role users)
   - **Co-instructors** — optional additional instructors who can also mark attendance
   - **Space** — select the venue and space where this activity takes place
   - **Price per session** (in pounds — enter 0 for free)
   - **Capacity** — maximum number of bookings per session
   - **Frequency** — Weekly, Fortnightly, Monthly, or One-off
   - **Status** — Draft (not visible to customers), Published, or Archived
   - **Start time** and **End time**
   - **Start date** and **End date** (optional — limits when sessions are generated)
   - **Allow waiting list** toggle — when enabled, customers can join a waitlist when a session is full
3. Select **Save activity**.

For recurring activities (weekly, fortnightly, monthly), the system automatically generates sessions up to one year ahead each time an admin logs into the dashboard.

### Editing an activity

1. Find the activity card and select **Edit**.
2. A panel opens pre-filled with the current details. You can also add or update:
   - **Description**
   - **Activity type** — categorises the activity
   - **Min age** and **Max age** — optional age restrictions
3. Update any fields and select **Update activity**.

### Managing activity images

Images can be added when editing an existing activity.

1. Open the activity edit panel.
2. Scroll to the image upload section.
3. Drag and drop an image file, or click to browse. Accepted formats: JPG, PNG, WEBP. Maximum size: 5 MB.
4. Once uploaded, the image appears in the Uploaded images grid.

To delete an image:

1. Hover over the image thumbnail.
2. Select **Delete** and confirm.

The most recently uploaded image becomes the featured image shown on the activity card.

### Deleting an activity

1. Find the activity card and select **Delete**.
2. Confirm the deletion.

**Important warning:** Deleting an activity also deletes all associated sessions and bookings. This cannot be undone.

### Managing sessions

Sessions are individual occurrences of an activity. For recurring activities, sessions are generated automatically. For one-off activities, you create sessions manually.

**Viewing sessions** — Go to **Resources**, then the **Sessions** sub-tab. A calendar shows all sessions with a toggle between Month and Week view. A **Back to today** button appears when you have navigated away from the current period. Click any session slot to navigate to that session's detail page.

**Adding a one-off session from the dashboard:**

1. On the Dashboard, click any date on the month calendar.
2. An "Add one-off session" panel opens.
3. Select the activity (only published one-off activities appear), date, start and end times.
4. Optionally set a capacity override (overrides the activity's default capacity for this session only).
5. Optionally add instructor notes.
6. Select **Add session**.

**Viewing a session's detail and participant list:**

1. Click a session slot on the dashboard or sessions calendar.
2. Select **Manage session** from the quick-view panel.
3. The session detail page shows date, time, instructor, venue, and a table of all booked participants with their attendance status.

---

## 7. Meeting room bookings

Go to **Bookings**, then select the **Meeting rooms** sub-tab.

This view lists all meeting room bookings with columns for Date, Room, Customer, Time, Amount paid, and Status.

### Viewing a meeting room booking

Click any row to open the detail panel. You can see:

- Room name, date, and time
- Customer name and email address
- Amount paid and booking status
- Purpose of booking, number of attendees, organisation, and any special requirements

There is no separate action to process or approve a meeting room booking from this screen — confirmed bookings are those where payment has been completed by the customer through the standard booking flow.

Meeting room bookings can be cancelled from the Payments received screen if a refund is needed (see [Payments received](#payments-received)).

---

## 8. Venues and spaces

Venues and spaces form the location hierarchy. A venue is a building or site. A space is a room or area within that venue. Activities are assigned to spaces.

### Creating a venue

Go to **Resources**, then the **Venues** sub-tab.

1. Select **Add venue**.
2. Enter:
   - **Name** (required)
   - **Address**
   - **Postcode**
   - **Phone**
3. Select **Save venue**.

### Editing a venue

1. Find the venue card and select **Edit**.
2. Update any details. You can also upload an image in the edit panel — drag and drop or click to browse.
3. Select **Update venue**.

### Deleting a venue

1. Find the venue card and select **Delete**.
2. Confirm the deletion.

### Adding an image to a venue

1. Open the venue edit panel.
2. Use the image upload area to upload a single image (JPG, PNG, or WEBP, maximum 5 MB).
3. Select **Update venue**.

### Creating a space

Go to **Resources**, then the **Spaces** sub-tab. You must have at least one venue before you can create a space.

1. Select **Add space**.
2. Enter:
   - **Venue** — select the venue this space belongs to (required)
   - **Name** (required)
   - **Capacity** — maximum number of people the space holds
   - **Space type** — Pitch, Court, Classroom, Meeting room, Studio, Gym, Outdoor, or Other
   - **Description** (optional)
3. Select **Save space**.

### Editing a space

1. Find the space card and select **Edit**.
2. Update any details. You can also upload an image in the edit panel.
3. Select **Update space**.

### Deleting a space

1. Find the space card and select **Delete**.
2. Confirm the deletion.

### Room hire and blockouts

If a space is configured as a meeting room (space type "Meeting room" or used with room-hire pricing), you can add blockouts to prevent bookings on specific dates or time slots.

1. Navigate to **Resources**, then **Activities**, and open the edit panel for the room hire activity.
2. Scroll to the **Blockouts** section at the bottom of the full activity form.
3. Enter the blockout date, optionally a start and end time (leave both blank for an all-day blockout), and an optional reason.
4. Select **Add blockout**.

To delete a blockout, select **Delete** in the blockout table.

---

## 9. Payments (super admin)

The Payments section is only visible to super admins. Go to **Payments** in the top navigation.

The Payments section has seven sub-tabs: Cancellations, Payments received, Refunds, Withdrawals, Gift Aid, Credit accounts, and Discount codes.

### Cancellations

This tab lists all cancelled bookings showing: Booking number, Participant, Activity, Cancellation date, Amount paid, and Amount refunded. Rows are ordered by session date, most recent first.

Use the filters at the top to narrow results by venue, space, activity, group, and year (defaults to the current year). A date range picker lets you filter by exact cancellation date. Select **All years** to see the full history.

Click any row to open the detail panel showing the full booking and cancellation information, including who processed the refund and when.

### Payments received

This tab lists all bookings where payment has been received. It shows: Booking number, Participant, Activity, Session date, Amount paid, and Status. Rows are ordered by session date, most recent first.

Use the filters at the top to narrow results by venue, space, activity, group, and year (defaults to the current year). A date range picker lets you filter by exact payment date. Select **All years** to see the full history.

Click any row to open the detail panel. From the panel you can **cancel the booking and refund the payment**:

1. Click the row to open the detail panel.
2. Verify the booking and payment details.
3. The refund section shows the full amount paid. Select **Cancel booking and refund payment**.
4. The booking is cancelled and the amount is credited back to the customer's account credit.

### Refunds

This tab lists all bookings that have been refunded. Columns show: Booking number, Participant, Activity, Refund date, and Amount refunded. Rows are ordered by session date, most recent first.

Use the filters at the top to narrow results by venue, space, activity, group, refunder, and year (defaults to the current year). A date range picker lets you filter by exact refund date. Select **All years** to see the full history.

Click any row to see the full refund detail including original payment method, paid-on date, amount refunded, and which admin processed the refund.

### Payments by activity

Go to **Payments** and you will also see a **Payments by Activity** tab. This shows a breakdown per activity of: total payment attempts, successful payments, failed payments, refunded count, and total revenue.

Click any row to drill into the payment detail for that specific activity.

### Withdrawals

Customers can request a withdrawal of their account credit balance. This tab shows all pending and historical withdrawal requests.

**Processing a withdrawal:**

1. Pending requests appear in the highlighted section at the top.
2. Select **Process** next to the request.
3. A prompt appears confirming the amount and informing you this will issue a Stripe refund to the customer's original payment method. You can optionally add notes.
4. Confirm. The system processes the Stripe refund and deducts the amount from the customer's credit balance.

**Rejecting a withdrawal:**

1. Select **Reject** next to the request.
2. Enter a reason for the rejection (required).
3. Confirm. The customer's credit balance remains unchanged.

The All Requests table below shows the full history with status, processor name, processed date, Stripe refund ID, and admin notes.

### Gift Aid

Go to **Payments**, then the **Gift Aid** sub-tab.

This page shows Gift Aid declarations made by customers and the corresponding tax relief claims.

**Stat cards** at the top show: total declarations, total claims made, and total claim value.

**Filtering by tax year:**

1. Select a tax year from the dropdown.
2. Select **Filter**.

The declarations table updates to show donors who made a declaration in that tax year.

**Downloading the ODS file:**

1. Select a tax year (or leave as All Years).
2. Select **Download ODS**.

The ODS file is formatted for submission to HMRC's Gift Aid claim process.

### Credit accounts

Go to **Payments**, then the **Credit accounts** sub-tab.

This table lists every user who holds account credit. Columns show: Name, Email, Balance, Transaction count, and any pending withdrawal request.

**Viewing a user's credit history:**

1. Click the user's name in the table.
2. A panel opens showing their current balance and a full transaction history: date, description, amount (positive for credits, negative for debits), and the running balance after each transaction.

**Processing or rejecting a withdrawal request from this page:**

If a user has a pending withdrawal request, it appears in the Withdrawal request column. You can select **Process** or **Reject** directly from this table, following the same steps as the Withdrawals tab above.

### Discount codes

Go to **Payments**, then the **Discount codes** sub-tab.

This page lists all discount codes as cards. Each card shows the code (or **AUTO** for codes that apply automatically), type, value, usage count, scope, and status.

#### Discount types

| Type | How it works |
|---|---|
| Percentage | Reduces the total by a percentage (e.g. 10%) |
| Fixed amount | Reduces the total by a fixed £ amount |
| Every Nth session free | For block bookings: one session is free for every N sessions booked in a single transaction (e.g. every 3rd session free) |
| Third child free | Applied automatically when a family books a third or later child into the same session |

#### Scopes — who the code applies to

| Scope | Behaviour |
|---|---|
| Global | Applies to all activities; customers enter the code at checkout |
| Activity | Applies to a single activity; customers enter the code at checkout |
| Activity type | Applies to all activities of a given type; customers enter the code at checkout |
| Venue | Applies to all activities at a specific venue; customers enter the code at checkout |
| Account type | Applies based on the customer's account type; customers enter the code at checkout |
| Room hire | Applies to meeting room bookings only; customers enter the code at checkout |
| Staff | Applied automatically by role — no code needed; the customer never types anything |
| Per user | Applied automatically to one or more specific users — no code needed |

Codes with **Staff** or **Per user** scope show **AUTO** instead of a code string. When a customer eligible for an auto-applied discount opens the booking popover, the discount is detected and applied immediately. If the discount covers the full session cost, the Stripe payment form is hidden and the button reads **Confirm Booking** instead of **Pay £X**.

#### Adding a discount code

1. Select **Add discount code**.
2. A panel opens. Choose the **Scope** first — this controls which other fields appear.
3. For most scopes, enter a **Code** string (e.g. `SUMMER10`). For Staff and Per user scopes the code field is hidden (auto-applied codes have no code).
4. Fill in:
   - **Name** — a plain-English label shown to customers when the discount is applied
   - **Type** — Percentage, Fixed amount, Every Nth session free, or Third child free
   - **Value** — the percentage or fixed amount (not shown for session-free types)
   - **Min sessions** — for "Every Nth session free": the N (e.g. 3 means every 3rd session is free)
   - **Max uses** — leave blank for unlimited uses
   - **Expires at** — optional expiry date; leave blank for no expiry
   - **Activity** — for Activity scope, select the specific activity
   - **Users** — for Per user scope, search and select one or more users
5. Select **Save**.

#### Editing a discount code

1. Click the **Edit** button on any card.
2. Update the fields and select **Update**.

#### Deleting a discount code

1. Click the **Delete** button on any card and confirm.

If a code has been used at least once, deleting it deactivates it rather than removing it — the usage history is preserved. Codes with zero uses are deleted immediately.

#### How customers see discounts

- **Manual codes** — a "Have a discount code?" link appears on the booking popover. The customer enters the code and the discounted price updates immediately.
- **Auto-applied discounts** — the discount appears automatically when the popover opens. A notice explains the saving (e.g. "You're booking 3 sessions — 1 session is free!" for a bulk discount, or "Staff discount applied automatically." for a staff discount). The "Amount to Pay" label changes to "Your Price". If the total drops to £0, it shows **FREE** and the payment form is hidden.

---

## 10. Settings (super admin)

Go to **Settings** in the top navigation. Settings is only visible to super admins.

### Stripe

Go to **Settings**, then the **Stripe** sub-tab.

This is where you configure the Stripe API keys used for payment processing.

1. Enter the **Stripe Publishable Key** (starts with `pk_live_` for live or `pk_test_` for test mode).
2. Enter the **Stripe Secret Key** (starts with `sk_live_` or `sk_test_`).
3. Select **Save Settings**.

The current key values are masked for security — only the last four characters are shown. Leave a field blank to keep the existing value.

**Switching between test and live mode:** Replace both keys with the corresponding test or live pair. Test keys (prefixed `pk_test_` / `sk_test_`) allow you to process payments using Stripe's test card numbers without real charges.

**Payment failure alerts (webhook):** Card payments are confirmed in the customer's browser, so the booking system only hears about a *failed* payment through a Stripe webhook. To turn on "Payment failed" alerts:

1. In the Stripe dashboard, go to **Developers → Webhooks → Add endpoint**.
2. Set the endpoint URL to `https://<your booking site>/api/payments/stripe/webhook` and select the event **payment_intent.payment_failed**.
3. Copy the endpoint's **Signing secret** (starts with `whsec_`) into the **Webhook Secret** field here and select **Save Settings**.

Do this once for test mode and once for live mode; each has its own signing secret. Until a secret is saved, the endpoint refuses every request.

### Notification Services

Go to **Settings**, then the **Notification Services** sub-tab.

**Delivery**

The card at the top decides who receives email:

- **Live** — email goes to the real recipients. Use this once the site has launched.
- **Test** — only the **Allowlist** gets email: addresses, or `@domain` for everyone at a domain (e.g. `@wellfoundation.org.uk`). Everyone else's email goes to the **Test inbox** instead, with `[TEST → their address]` at the start of the subject, so you can see every email the system would send without any customer receiving it. At most 25 are redirected per batch (one broadcast or one reminder run); the rest are not sent. Leave the test inbox empty to send them nothing.
- **Off** — nothing is sent at all, not even password resets.

Select **Save delivery**. While email isn't Live, every admin page shows a banner saying where email is going.

A server that isn't the live site (its `APP_ENV` isn't `production`) treats Live as Test, so a copy of the real data can never email customers.

**Email Driver**

The toggle at the top of the card selects the active driver — **SMTP** (default) or **Resend**. Switching the toggle shows the settings for that driver. Select **Save** to persist the driver choice along with the From address and From name.

**SMTP**

Use this for Office 365, Gmail, or any SMTP server. No external account required beyond your existing email credentials.

1. Enter the **From address** and **From name** — shown to recipients on all emails.
2. Toggle the driver to **SMTP** and select **Save**.
3. In the SMTP settings card, enter:
   - **SMTP Host** — e.g. `smtp.office365.com`
   - **Port** — `587` for TLS/STARTTLS, `465` for SSL
   - **Username** — your full email address (e.g. `info@wellfoundation.org.uk`)
   - **Password** — your account password. If MFA is enabled on Microsoft 365, generate an App Password. Leave blank to keep the existing value. Stored encrypted.
   - **Encryption** — `TLS / STARTTLS` for port 587, `SSL` for port 465
4. Select **Save SMTP Settings**.

**Resend**

Use this for cloud hosting where SMTP is blocked or unavailable.

1. Toggle the driver to **Resend** and select **Save**.
2. Enter the **Resend API Key** — obtain this from your Resend account. Leave blank to keep the existing key.
3. Select **Save Resend Settings**.

**Important note:** If using Resend, the domain `wellfoundation.org.uk` must be verified in your Resend account before going live. Until then, emails only deliver reliably from `onboarding@resend.dev`.

**No email driver configured yet?** The system handles this gracefully — if neither SMTP nor Resend has been set up, email notifications are silently skipped rather than showing errors to customers. Everything else (bookings, payments, waitlist) continues to work normally. You can configure email at any time and notifications will start sending immediately.

All API keys are encrypted at rest using AES-256-GCM. Database settings take priority over environment variables, so updates made here take effect immediately without server file access.

### Notification Templates

Go to **Settings**, then the **Notification Templates** sub-tab (super admin only).

This page lists all automated notification events — booking confirmations, payment requests, cancellations, attendance reminders, and others. For each event you can see the trigger condition described in plain English, and customise the email subject line and body, plus the short summary used for in-app notifications and staff alert emails.

**Customising a template:**

1. Find the notification event you want to edit.
2. Select **Edit**.
3. Update the **Subject** (email only) and **Body** fields.
4. Templates support placeholder tokens — these are replaced with real values when the notification is sent. The available tokens are shown beneath each field (e.g. `{{participant_name}}`, `{{session_date}}`, `{{activity_title}}`).
5. Select **Save**.

**Restoring the default:**

If you want to revert a template to the built-in default text, select **Reset to default** and confirm.

Custom templates are stored in the database and override the built-in defaults. This means notification copy can be updated without any code changes or server access.

---

## 11. Account settings and notifications

Go to **Settings**, then the **Account** sub-tab (available to all admin and super admin users).

### Updating personal details

1. Update your **First name**, **Last name**, **Email**, **Phone**, and optionally a new **Password**.
2. Leave the password fields blank to keep your current password. Enter a new password in both fields to change it.
3. Select **Save details**.

### Notification preferences

You can configure which channels you receive notifications on:

1. Use the toggles to enable or disable **Email** and **In-app** notifications.
2. Select **Save preferences**.

### Notification subscriptions

Subscriptions let you receive notifications for specific events on particular activities or sessions.

**Adding a subscription:**

1. Select **+ Add subscription**.
2. Choose the activity (and optionally a specific session), the event type you want to be notified about, and whether to receive it by email (admins can also choose in-app).
3. Select **Add subscription**.

**Editing a subscription:**

1. Find the subscription card and select **Edit**.
2. Update the settings and select **Save changes**.

**Deleting a subscription:**

1. Find the subscription card and select **Delete** (or the delete action on the card).
2. Confirm the deletion.

---

## 12. Instructor features

Instructors have their own section of the system accessible at `/instructor`. They cannot access admin pages.

### Instructor dashboard

The instructor dashboard shows stat cards for: Total Sessions, Activities, Participants, and Attendance Rate.

Below the stats is a calendar showing all sessions assigned to the instructor, with a toggle between Month and Week view. Each slot shows the activity name, time, and booking count against capacity. Full sessions are shown in red. A **Back to today** button appears when navigated away from the current period.

### Adding a walk-in

If someone turns up who isn't booked, or doesn't have an account yet, open the session's register and select **Add walk-in**. The button only appears on the day of the session or afterwards.

1. Choose **A child** or **An adult, for themselves**.
2. Enter the parent's or guardian's details (or the adult's own): first name, last name, email and mobile.
3. For a child, enter the child's first and last name.
4. Enter the date of birth (the child's, or the adult's). Walk-ins must be within the activity's age range.
5. If the session has groups, choose the group.
6. Select **Add walk-in**.

If the email already belongs to an account, the parent's (or adult's) name must match that account; otherwise you'll be asked to check the details or get an admin to help. They're marked as attended straight away and the booking is left unpaid. The account holder is emailed about payment. If they didn't have an account, the email includes a link to set one up. If anything is wrong, the form stays open with your details kept so you can fix it.

### Viewing activities

Go to **Activities** from the instructor navigation. Each activity is shown as a card with image, title, description, session count, and capacity.

Click any activity card to open a sessions panel listing all scheduled sessions for that activity, showing: date, time, booking count, and status (Scheduled, Completed, or Cancelled).

Click a session within the panel to go directly to that session's detail page.

### Managing a session

Click any session on the calendar or activity panel to open the session detail page.

At the top you will see: activity title, date, time, and four stat cards — Booked, Attended, Absent, and Not marked.

**Marking attendance:**

1. Each booked participant appears as a card showing their name, current attendance status, and (for block bookings) how many sessions they have remaining.
2. Select **Present** or **Absent** for each participant. The button highlights to confirm the selection.
3. Attendance updates immediately. There is no separate save step.

Participants with block bookings show a badge indicating how many sessions remain (e.g. "3 sessions left" or "Last session").

**Writing session notes:**

1. Scroll to the **Session Notes** section at the bottom of the page.
2. Enter your notes in the text area.
3. Select **Save notes**.

Notes are visible to the admin when they view the same session detail page from the admin panel.

### Instructor account settings

Instructors can update their personal details and notification preferences from their account settings page, accessible from the instructor navigation.

---

## 13. Using Claude as your AI assistant

The booking system has a Claude agent built for the admin role. Your developer sets it up as a Claude.ai Project and shares access with you. There is nothing to install or configure — you just open the Project and start chatting.

Some things you can ask:

- "Pull today's bookings"
- "Show me who is on the waitlist for yoga"
- "Give me a revenue summary for this month"
- "Which bookings are awaiting payment?"
- "Generate an attendance report for the pilates class"

### What Claude can do for you

Without opening a browser, Claude can:

- View and filter all bookings
- Promote a customer from the waitlist
- Cancel or refund a booking
- Generate booking, attendance, payment, and activity reports
- View Gift Aid declarations and export data
- Manage activities, venues, spaces, and user accounts
- Process or reject withdrawal requests

### Getting started

Your developer will share a link to the Claude Project with you. Open it in [Claude Desktop](https://claude.ai/download) or at [claude.ai](https://claude.ai) and start a conversation. That is all.

### The 4 built-in prompts

The Project includes four pre-built prompts. Type `/` to see them, or just describe what you want in plain English.

| Prompt | What you get |
|---|---|
| **Daily briefing** | Today's bookings, sessions running today, pending waitlist actions, and any issues needing attention. |
| **Session report** | Attendance data for an activity over a date range — rate, no-shows, and trends. |
| **Waitlist review** | Every customer on a waitlist with a recommendation on who to promote. |
| **Revenue summary** | Total revenue for a period, broken down by payment method, with refunds and outstanding payments. |

Example:

```
You: Give me the daily briefing for the booking system.
Claude: Good morning. Here is today's overview...
```

### Confirmation for destructive actions

Claude will never cancel a booking, issue a refund, delete a record, or process a withdrawal without asking you first:

```
I found booking #42 for Jane Smith (Yoga, 20 Feb). Shall I go ahead and cancel it?
```

You say yes, and only then does Claude proceed.

---

*This guide covers the WFCS booking system as of March 2026. The Well Foundation (SC040105) — info@wellfoundation.org.uk.*
