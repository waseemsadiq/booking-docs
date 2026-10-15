# MCP Server Guide — WFCS Booking

This guide covers the MCP (Model Context Protocol) server that lets AI assistants — Claude Desktop, Claude Code, or any MCP-compatible client — interact with the WFCS Booking system through natural language.

---

## Table of Contents

1. [What the MCP server is](#1-what-the-mcp-server-is)
2. [Architecture](#2-architecture)
3. [Packages overview](#3-packages-overview)
4. [All tools](#4-all-tools)
5. [Resources and prompts](#5-resources-and-prompts)
6. [Setup: End users (Cloudflare Workers)](#6-setup-end-users-cloudflare-workers)
7. [Setup: Developer (local stdio)](#7-setup-developer-local-stdio)
8. [What is not supported](#8-what-is-not-supported)
9. [Common use cases](#9-common-use-cases)
10. [Development](#10-development)

---

## 1. What the MCP server is

The MCP server exposes the WFCS Booking system to AI assistants as a set of structured tools. Instead of opening a browser, an admin can ask Claude "What bookings do we have today?" and get an immediate, accurate answer. A customer can ask "What yoga sessions are available next week?" and book one without touching the web UI.

A single server handles all roles. It logs in at startup using the credentials you supply, reads `user.role` from the JWT response, and registers only the tools that role is permitted to use. `list_tools` only ever returns what the logged-in user can access — no manual package selection is needed.

The server authenticates against the existing PHP REST API. No PHP changes are required to use MCP — it is a thin client layer on top of endpoints that already exist.

### How it works for end users

The source code lives on GitHub. A developer deploys the Cloudflare Worker once and connects it to a Claude.ai Project. End users are invited to that Project and just open it in [Claude Desktop](https://claude.ai/download) or at [claude.ai](https://claude.ai) — no config editing, no Node.js, nothing to install.

---

## 2. Architecture

```
     GitHub repo
         |
         | (developer deploys once)
         |
  Cloudflare Worker          ← end users connect here
         |
         | HTTPS (Basic auth on every request)
         |
 Claude Desktop (end user)

         OR (developer/local only)

  Local Node.js process
  (stdio via Claude Desktop or Claude Code)
         |
         | HTTP (Bearer JWT + CSRF token)
         |
WFCS Booking API (PHP)
         |
    MariaDB / MySQL
```

### Auth flow

The MCP server uses the same authentication mechanism as the web app:

1. `GET /` — fetches the app home page to obtain a CSRF token from the `Set-Cookie` response header
2. `POST /api/auth/login` — submits credentials with the CSRF token to receive a JWT
3. All subsequent requests include `Authorization: Bearer <jwt>` in the header, plus the CSRF token as a query parameter for mutating requests
4. On receiving a `401 Unauthorized`, the server discards the cached token and repeats the login flow automatically

### JWT caching

- **Local (stdio) packages** — the JWT is cached in process memory for the lifetime of the MCP server process
- **Cloudflare Worker** — the JWT is cached in Cloudflare KV (key-value store) with a TTL slightly shorter than the JWT's own expiry, so the Worker does not repeatedly re-authenticate on every request

### Monorepo structure

```
mcp/
├── packages/
│   └── server/        # Role-aware MCP server (npm: @wellfoundation/booking-mcp)
│       └── src/
│           ├── index.ts          # Login → detect role → register tools → start server
│           ├── api-client.ts     # HTTP client: CSRF fetch, login, JWT management
│           ├── config.ts         # Loads WFCS_API_URL, WFCS_EMAIL, WFCS_PASSWORD from env
│           ├── types.ts          # Shared TypeScript types
│           └── tools/            # All 14 tool files (discovery, bookings, participants, credit, gift-aid, profile, instructor, admin-*)
└── workers/           # Cloudflare Worker (HTTP transport, all three roles)
```

---

## 3. Packages overview

| Package | npm name | Description |
|---|---|---|
| `server` | `@wellfoundation/booking-mcp` | Single role-aware server. Logs in at startup, detects role from JWT response, registers only the tools that role can access. |

No need to choose a package — role is detected automatically from the login credentials you supply.

The `workers/` package is not an npm package — it is a Cloudflare Worker that bundles the tool sets for all three roles and exposes them via HTTP endpoints.

---

## 4. All tools

### Role permissions

#### Customer
Gets: `search_activities`, `my_bookings`, `my_participants`, `my_emergency_contacts`, `my_credit`, `my_gift_aid`, `my_profile`

#### Instructor
Gets all customer tools, plus:
- `instructor_sessions` (upcoming, past, get_participants, add_notes, message_participants, send_attendance_request)
- `mark_attendance`
- `instructor_stats`

#### Admin
Gets all customer tools, plus:
- `manage_activities`, `manage_venues`, `manage_spaces`, `manage_users`
- `admin_bookings`, `admin_reports`
- `admin_notify`
- `admin_groups`

**Note:** Instructor tools are also available if the admin account has `is_global_instructor` enabled or is assigned as instructor on any activity.

#### Super Admin
Gets everything above, plus:
- `admin_finance` (`admin_gift_aid`, `admin_withdrawals`)
- `admin_settings` (Stripe configuration)
- `manage_discount_codes`

---

### Customer tools (available to all roles)

These tools are defined in `mcp/packages/server/src/tools/` and are registered for every role.

| Tool | Actions | Description |
|---|---|---|
| `verify_connection` | — | Checks the API connection and returns the authenticated user's name, email, and role. Useful as a first step to confirm credentials are working. |
| `search_activities` | `list`, `get_details`, `check_availability` | Browse all published activities, retrieve full details for a specific activity by slug, or check session availability for a date range. |
| `my_bookings` | `list`, `get_details`, `create`, `cancel`, `pay` | List all bookings for the authenticated user. Create a new booking for a session. Cancel a booking (requires `confirmed: true`). Pay for a booking that was promoted from the waitlist (applies account credit first, then reports if Stripe payment is needed). |
| `my_participants` | `list`, `add`, `update`, `delete` | Manage the authenticated user's bookable participants — themselves and any children or dependants. |
| `my_credit` | `balance`, `transactions`, `top_up`, `withdraw` | View current account credit balance and transaction history, or request a withdrawal (requires `confirmed: true`). `top_up` explains that credit is topped up by card on the website. |
| `my_gift_aid` | `status`, `declare`, `update`, `history` | Check Gift Aid declaration status. Submit or update a Gift Aid declaration (requires UK address). View claim history. |
| `my_profile` | `get`, `update` | View and update the authenticated user's profile details (name, email, phone, date of birth). |

### Instructor tools (instructor, admin, super_admin)

These tools are defined in `mcp/packages/server/src/tools/instructor.ts`.

| Tool | Actions | Description |
|---|---|---|
| `instructor_sessions` | `upcoming`, `past`, `get_details` | List upcoming or past sessions assigned to the authenticated instructor. Retrieve full details for a session, including the participant list. |
| `mark_attendance` | — | Mark a booking as attended or absent for a specific session. Accepts `booking_id` and `status` (attended / absent). |
| `instructor_stats` | — | View attendance statistics across all sessions assigned to the instructor — attendance rate, total sessions, total participants. |

### Admin tools (admin, super_admin only)

These tools are defined in `mcp/packages/server/src/tools/`.

| Tool | Actions | Description |
|---|---|---|
| `manage_activities` | `list`, `get`, `create`, `update`, `delete`, `generate_sessions` | Full CRUD for activities. Generate sessions for a recurring activity up to a given date. Use `primary_instructor_id` (integer) and `co_instructor_ids` (integer array) when creating or updating — `instructor_id` is no longer used. |
| `manage_venues` | `list`, `get`, `create`, `update`, `delete` | Full CRUD for venues. |
| `manage_spaces` | `list`, `get`, `create`, `update`, `delete` | Full CRUD for bookable spaces within venues. |
| `manage_users` | `list`, `get`, `create`, `update`, `delete` | Full CRUD for user accounts. Supports role assignment. Optional flags: `is_customer` (show customer nav for staff accounts), `is_global_instructor` (instructor displayed on all activity/session pages). |
| `admin_bookings` | `list`, `get`, `update`, `promote`, `refund`, `delete` | List all bookings with optional filters (status, activity, date range). Update booking status. Promote a waitlisted booking to pending. Refund a booking (requires `confirmed: true`). Delete a booking record (requires `confirmed: true`). |
| `admin_reports` | `bookings`, `attendance`, `payments`, `activities`, `export_csv` | Pull booking, attendance, payment, and activity reports. Supports date range filtering. Export any report type as CSV data. |
| `admin_gift_aid` | `overview`, `export` | View Gift Aid declaration and claim overview. Export Gift Aid data for HMRC submission. |
| `admin_withdrawals` | `list`, `process`, `reject` | List pending and historical instructor withdrawal requests. Process (triggers Stripe refund) or reject a request (requires `confirmed: true`). |
| `admin_settings` | `get`, `update` | View and update payment settings (Stripe keys). Super admin only. Notification template management is not exposed via MCP — use the web UI at `/admin/notification-templates/`. |
| `manage_discount_codes` | `list`, `create`, `update`, `delete` | **Super admin only.** Full CRUD for discount codes. Supports all types (`percentage`, `fixed`, `bulk_session`, `third_child_free`) and all scopes (`global`, `activity`, `activity_type`, `venue`, `account_type`, `room_hire`, `staff`, `user`). Staff and user scoped codes are auto-applied — no code entry needed. `delete` deactivates if the code has been used, permanently deletes if unused (requires `confirmed: true`). |
| `admin_notify` | `preview`, `send`, `history` | Send ad-hoc email broadcasts to targeted customer groups. Two-step flow: preview shows recipient names + token, send consumes the token and emails all recipients. Supports `all_customers`, `activity`, `session`, and `user` audience types. History lists recent broadcasts. Always preview before sending. |
| `admin_groups` | `list`, `get`, `create`, `update`, `delete`, `add_member`, `remove_member`, `search_participants`, `send_message`, `preview_age_assignment`, `apply_age_assignment`, `get_session_groups`, `set_session_groups` | Manage customer groups. Groups are independent rosters assigned to activities via the activity_groups junction table (managed through activity add/edit forms or `manage_activities`). Create groups with optional initial members via `participant_names[]` (names are fuzzy-matched and resolved; ambiguous or unmatched names returned as warnings). Manage membership, bulk-assign members by age range, send messages to all group members, and control which groups are assigned to sessions. Sessions with groups assigned are restricted to members only. Children are assigned to a group automatically after their first paid session for the activity — not on registration. |

### Destructive action confirmation

Any tool action that is destructive or financial requires `confirmed: true` in the tool call. Without it, the tool returns a plain-text summary of what it would do and asks the user to confirm. This prevents accidental cancellations, deletions, or refunds.

Actions that require `confirmed: true`:

- `my_bookings` → `cancel`
- `my_credit` → `withdraw`
- `admin_bookings` → `refund`, `delete`
- `manage_activities` → `delete`
- `manage_venues` → `delete`
- `manage_spaces` → `delete`
- `manage_users` → `delete`
- `admin_withdrawals` → `process`, `reject`
- `manage_discount_codes` → `delete`

Example flow without confirmation:

```
User: "Cancel booking 42"
Claude calls: my_bookings { action: "cancel", booking_id: 42 }
Tool returns: "Are you sure you want to cancel booking #42? Set confirmed=true to proceed."
Claude: "I found booking #42. Shall I go ahead and cancel it?"
User: "Yes"
Claude calls: my_bookings { action: "cancel", booking_id: 42, confirmed: true }
Tool returns: { success: true, booking_id: 42, status: "cancelled" }
```

---

## 5. Resources and prompts

### Resources

Resources are readable data sources that an MCP client can access without making a tool call. Both the customer and admin packages expose these resources.

| URI | Description |
|---|---|
| `wfcs://status` | Live connection status and authenticated user information (name, email, role). Refreshed on each read. |
| `wfcs://role-permissions` | A structured list of everything the current role is permitted to do. Useful for Claude to orient itself at the start of a session. |

### Prompts (admin package only)

Prompts are pre-built multi-step conversation starters. They instruct Claude to call a sequence of tools and synthesise the results into a summary. Available in the admin package only.

| Prompt | Parameters | What it does |
|---|---|---|
| `daily-briefing` | None | Calls `verify_connection`, `search_activities`, `admin_bookings`, and `admin_reports` to produce a morning briefing: bookings today, sessions happening today, pending waitlist actions, and any issues. |
| `session-report` | `activity_slug`, `date_from` (optional), `date_to` (optional) | Fetches activity details and attendance data for the given slug and date range. Summarises attendance rates, no-shows, and trends. |
| `waitlist-review` | None | Lists all waitlisted bookings and checks availability for each. Recommends which customers to promote and which to keep waiting. |
| `revenue-summary` | `date_from` (optional), `date_to` (optional) | Pulls payment data for the period and summarises total revenue, breakdown by payment method (Stripe vs account credit), refunds issued, outstanding payments, and a comparison with the previous period where possible. |

---

## 6. Setup: End users (Cloudflare Workers)

This is the standard setup for admins, instructors, and customers. A developer deploys the Worker once. End users just configure Claude Desktop — no Node.js, no building from source.

The Worker runs on Cloudflare's infrastructure and is accessible from any Claude Desktop installation worldwide. It caches JWTs in Cloudflare KV so it does not re-authenticate on every request.

The Worker exposes three endpoints, one per role:

| Endpoint | Role | Tool count |
|---|---|---|
| `POST /customer` | Customer | 7 |
| `POST /instructor` | Instructor | 10 |
| `POST /admin` | Admin | 20 |
| `POST /super_admin` | Super admin | 21 (all admin tools + manage_discount_codes) |

Auth is via `Authorization: Basic base64(email:password)` on every request.

### Step 1: Deploy the Worker (developer, one-time)

The source code lives in the GitHub repo under `mcp/workers/`.

```bash
cd mcp/workers

# Create the KV namespace for JWT caching
npx wrangler kv namespace create JWT_CACHE
# Copy the returned namespace ID and paste it into wrangler.toml

# Set the booking API URL as a secret
npx wrangler secret put WFCS_API_URL
# When prompted, enter: https://your-booking-app.com/booking

# Deploy to Cloudflare
npx wrangler deploy
```

The Worker URL will be something like `https://wfcs-booking-mcp.your-subdomain.workers.dev`.

Share the Worker URL and each user's credentials with the relevant people.

### Step 2: Configure Claude Desktop (end user)

1. Install [Claude Desktop](https://claude.ai/download) if not already installed.
2. Open the config file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
3. Add the following (replace the URL and credentials with the values your developer provides):

```json
{
  "mcpServers": {
    "wfcs-booking": {
      "url": "https://wfcs-booking-mcp.your-subdomain.workers.dev/admin",
      "headers": {
        "Authorization": "Basic <base64(email:password)>"
      }
    }
  }
}
```

Use `/admin`, `/instructor`, or `/customer` depending on the user's role.

To generate the Base64 credential string:

```bash
echo -n "your@email.com:yourpassword" | base64
```

4. Save the file and restart Claude Desktop.
5. Start a new chat and type: `Use verify_connection to check the WFCS booking connection.` — Claude should respond with your name and role.

### KV namespace configuration

After creating the KV namespace, update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "your-namespace-id-here"
```

JWT tokens are cached with a TTL slightly below the JWT expiry to ensure the Worker always uses a valid token without hammering the login endpoint.

### Local development of the Worker

```bash
cd mcp/workers
npx wrangler dev
# Worker runs at http://localhost:8787
```

Test the health endpoint:

```bash
curl http://localhost:8787/
# Returns: { "name": "wfcs-booking-mcp", "endpoints": ["/customer", "/instructor", "/admin"], ... }
```

---

## 7. Setup: Developer (local stdio)

This setup is for developers only. It runs the MCP server as a Node.js process on your local machine and is useful for developing and testing tool changes.

### Prerequisites

- Node.js 18 or later
- The WFCS Booking API running locally (via `./galvani`) or accessible on a server

### Build

```bash
cd mcp
npm install
npm run build
```

This compiles the TypeScript source and writes compiled JavaScript to `packages/server/dist/`.

### Claude Desktop configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wfcs-booking": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/packages/server/dist/index.js"],
      "env": {
        "WFCS_API_URL": "http://localhost:8080/booking",
        "WFCS_EMAIL": "your@email.com",
        "WFCS_PASSWORD": "yourpassword"
      }
    }
  }
}
```

### Claude Code configuration

Add to `.claude/settings.json` or `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "wfcs-booking": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/packages/server/dist/index.js"],
      "env": {
        "WFCS_API_URL": "http://localhost:8080/booking",
        "WFCS_EMAIL": "your@email.com",
        "WFCS_PASSWORD": "yourpassword"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Description | Example |
|---|---|---|---|
| `WFCS_API_URL` | Yes | Full base URL of the booking app | `http://localhost:8080/booking` |
| `WFCS_EMAIL` | Yes | Email address to authenticate with | `admin@booking.local` |
| `WFCS_PASSWORD` | Yes | Password for the above account | `password123` |

### Verify the connection

```
Use the verify_connection tool to check the WFCS booking connection.
```

Claude should respond with the authenticated user's name and role.

---

## 8. What is not supported

Some operations cannot or should not be done via MCP.

| Feature | Why not supported |
|---|---|
| **Image uploads** | MCP tool calls do not carry binary file data. Use the web UI to upload activity and venue images. |
| **Stripe payment creation** | Creating a payment intent requires delivering a `client_secret` to a browser-based Stripe.js SDK. MCP cannot complete this loop. The tools can view payment records and issue refunds, but cannot initiate a customer payment. |
| **Real-time updates** | MCP is a request/response protocol. Users call tools on demand; there is no push/subscription mechanism for live booking notifications. |
| **Notification preferences** | The notification preference screen (email toggle per user) has no REST API endpoint. Preferences are managed via the web UI only. |

---

## 9. Common use cases

Examples of natural-language requests and the multi-step flows the agent follows to fulfil them. People don't know internal IDs — every example uses names, dates, and descriptions. Where the agent needs an ID to act, the flow shows the lookup first.

### For all users

#### search_activities
- "What activities do you offer?" → agent calls `list`
- "Tell me about the yoga class" → agent calls `get_details` using the activity slug
- "Is there space in pilates on 25th March?" → agent calls `check_availability` with slug + date
- "Show me all upcoming yoga sessions" → agent calls `get_sessions` by slug

#### my_bookings
- "Show me my upcoming bookings"
- "I'd like to book the Tuesday yoga session on 15th April" → agent searches for yoga, finds the session, then calls `create`
- "Cancel my pilates booking on 20th March" → agent lists bookings, finds the one matching pilates + date, then calls `cancel` with `confirmed: true`
- "Pay for my pending yoga booking" → agent lists bookings filtered to pending, identifies the yoga one, then calls `pay`

#### my_participants
- "Add my daughter Emma to my account — she was born on 15th August 2018" → agent calls `add`
- "Emma now has a peanut allergy — please update her medical info" → agent lists participants, finds Emma, then calls `update`
- "Record parental consent for Emma" → agent finds Emma's participant ID, then calls `update`
- "Remove my son Jack from my account" → agent lists participants, finds Jack, then calls `delete` with `confirmed: true`

#### my_emergency_contacts
- "Show me all my emergency contacts"
- "Add my mum Jane Smith as an emergency contact — her number is 07700 900123"
- "Make Jane Smith my default emergency contact" → agent lists contacts, finds Jane, then calls `update` with `is_default: true`
- "Remove my old emergency contact David Jones" → agent lists contacts, finds David, then calls `delete` with `confirmed: true`

#### my_credit
- "What's my account credit balance?"
- "Show me my last few credit transactions"
- "How do I top up my account?" → agent explains top-ups are made by card on the website
- "I'd like to withdraw £25 from my credit" → agent calls `withdraw` with `confirmed: true`

#### my_gift_aid
- "Am I signed up for Gift Aid?"
- "Sign me up for Gift Aid — I'm a UK taxpayer at 45 Church Road, London, SW1 1AA" → agent calls `declare`
- "Cancel my Gift Aid declaration"
- "Show me my Gift Aid claim history"

#### my_profile
- "What details do you have on file for me?"
- "Update my phone number to 07700 123456" → agent calls `update`
- "Change my last name to Smith" → agent calls `update`

---

### For instructors

#### instructor_sessions
- "What sessions do I have coming up this week?" → agent calls `upcoming`
- "Show me my past sessions" → agent calls `past`
- "Who's booked into my yoga class on Saturday 22nd March?" → agent looks up the session by activity + date via `get_details`, then reads the participant list
- "Add notes to my Tuesday pilates session: 'bring yoga mats, extra warm-up today'" → agent finds the session by activity slug + date, then calls `update` with the notes
- "Send a reminder to everyone in my Wednesday yoga class next week" → agent looks up the session, then messages participants
- "Send attendance confirmation requests for my Thursday morning session" → agent resolves the session, then calls `send_attendance_request`

#### mark_attendance
- "Mark Sarah Johnson as attended in today's yoga session" → agent lists session participants to find Sarah's booking ID, then calls `mark_attendance` with `status: attended`
- "John Smith didn't show up to pilates this morning" → agent resolves the booking from the session's participant list, then calls `mark_attendance` with `status: no_show`

#### instructor_stats
- "Show me my attendance statistics for this month"
- "What's my overall attendance rate?"

---

### For admins

#### manage_activities
- "Create a new yoga activity running on Monday mornings, 9–10am, £15 a session, at the Fitness Hub"
- "Change the price of the Tuesday pilates class to £20" → agent lists activities, finds pilates, then calls `update`
- "Generate sessions for the yoga class from April through to the end of June" → agent finds yoga activity ID, then calls `generate_sessions`
- "Publish the new pilates class so customers can see it" → agent finds the pilates activity by name, then calls `publish`
- "Take the Thursday swim class off the public listing for now" → agent finds it by name, then calls `unpublish`
- "Archive the Saturday boxing class — it's been cancelled permanently" → agent finds it by name, then calls `archive`
- "Block out the yoga studio on Easter Monday — all day" → agent finds the yoga activity ID, then calls `add_blockout` with `is_full_day: true`
- "Remove the blockout on 1st April for pilates" → agent lists blockouts for the activity, finds the matching one by date, then calls `delete_blockout`
- "Add a one-off yoga session on 15th April at 10:00–11:00" → agent finds the yoga activity ID, then calls `create_session`
- "Delete the outdated Aqua Aerobics activity" → agent finds it by name, sets `confirmed: true`, then calls `delete`

#### manage_venues
- "List all our venues"
- "Add a new venue called 'The Wellness Centre' at 12 Park Lane, Manchester"
- "Update the Fitness Hub address to 99 New Street" → agent lists venues, finds Fitness Hub, then calls `update`
- "Delete the old Riverside venue" → agent finds it by name, sets `confirmed: true`, then calls `delete`

#### manage_spaces
- "List all our bookable spaces"
- "Add a new studio space called 'Studio B' in the Fitness Hub with capacity 25" → agent finds the Fitness Hub venue ID first, then calls `create`
- "Change Studio A's capacity to 30" → agent finds the space by name, then calls `update`
- "Delete the old meeting room space" → agent finds it by name, sets `confirmed: true`, then calls `delete`

#### manage_users
- "List all users"
- "Create a new customer account for Alice Smith — email alice@example.com, temporary password Welcome123"
- "Make Sarah Johnson a global instructor" → agent finds user by name or email, then calls `update` with `is_global_instructor: true`
- "Suspend John Doe's account — he's violated our terms" → agent finds user by name or email, then calls `suspend`
- "Reinstate John Doe's account" → agent finds user, then calls `reinstate`
- "Show me all of Emma Clarke's children on her account" → agent finds Emma, then calls `get_with_participants`
- "List all participants registered across all users"
- "Add a child participant for Emma Clarke: Sophie Clarke, born 15th March 2018" → agent finds Emma's user ID, then calls `create_participant`
- "Delete the duplicate participant record for Jack Smith" → agent finds the participant, sets `confirmed: true`, then calls `delete_participant`
- "Revoke parental consent for Sophie Clarke under Emma Clarke's account" → agent finds Emma's user ID and Sophie's participant ID, then calls `revoke_consent`
- "Delete John Doe's account" → agent finds user by name, sets `confirmed: true`, then calls `delete`

#### admin_bookings
- "Show me all bookings for today"
- "Show me all pending bookings"
- "Get the details for Emma Clarke's yoga booking on 20th March" → agent calls `list` with name and date filters, then calls `get` on the matching booking
- "Mark Emma Clarke's booking as confirmed" → agent finds the booking, then calls `update` with `status: confirmed`
- "Refund Sarah Johnson's pilates booking from last week" → agent finds the booking, sets `confirmed: true`, then calls `refund`
- "Delete the test booking for John Smith" → agent finds it, sets `confirmed: true`, then calls `delete`

#### admin_reports
- "Show me the bookings report for March 2026" → agent calls `bookings` with `date_from: 2026-03-01` and `date_to: 2026-03-31`
- "How was attendance for the yoga class last month?" → agent calls `attendance` filtered by activity slug and date range
- "Show me payment data for the last 30 days" → agent calls `payments` with appropriate date range
- "Give me an activity-by-activity breakdown for Q1" → agent calls `activities` with Q1 date range
- "Export all booking data for March as a CSV" → agent calls `export_csv` with type `bookings` and March date range

#### admin_notify
- "Send an email to all customers about our Easter schedule changes" → agent calls `preview` with `audience: all_customers`, shows recipient count, then calls `send` after confirmation
- "Email everyone booked into the yoga class with a reminder about the venue change" → agent finds the yoga activity ID, calls `preview` with `audience: activity`, then calls `send` after confirmation using the preview token
- "Show me the history of broadcast messages we've sent" → agent calls `history`

#### admin_groups
- "List all groups"
- "Create a group called 'Monday Juniors' for ages 8–12"
- "Tell me about the Monday Juniors group" → agent finds group by name via `list`, then calls `get`
- "Add Emma Clarke's daughter Sophie to Monday Juniors" → agent finds both the group ID and Sophie's participant ID, then calls `add_member`
- "Remove Jack Smith from the Tuesday group" → agent resolves both group and participant, then calls `remove_member`
- "Search for participants named Clarke to add to a group" → agent calls `search_participants` with name query
- "Send a message to everyone in Monday Juniors about the timetable change" → agent finds the group ID, then calls `send_message`
- "Which participants in Monday Juniors are between 8 and 10 years old?" → agent finds the group ID, then calls `preview_age_assignment` with age range
- "Auto-assign all age-eligible participants to Monday Juniors" → agent finds the group ID, then calls `apply_age_assignment`
- "Which groups are running in the yoga session on 22nd March?" → agent finds the session ID via `manage_activities`, then calls `get_session_groups`
- "Assign the Beginners and Intermediate groups to the yoga session on 29th March" → agent resolves session ID and both group IDs, then calls `set_session_groups`

---

### For super admins only

#### admin_gift_aid and admin_withdrawals
- "Show me the Gift Aid overview" → agent calls `admin_gift_aid` with `action: overview`
- "Export Gift Aid data for this tax year for HMRC" → agent calls `admin_gift_aid` with `action: export` and the current tax year date range
- "Are there any pending withdrawal requests?" → agent calls `admin_withdrawals` with `action: list`
- "Process Sarah Johnson's withdrawal request" → agent lists withdrawals, finds Sarah's, then calls `process` with `confirmed: true`
- "Reject the withdrawal from John Smith and return the credit to his account" → agent finds John's withdrawal, then calls `reject` with `confirmed: true`

#### admin_settings
- "Show me the current Stripe settings" → agent calls `get`
- "Update the Stripe live publishable key" → agent calls `update` with the new key value

#### manage_discount_codes
- "List all active discount codes"
- "Create a 10% off discount code for all activities, valid until 19th April 2026" → agent calls `create` with `type: percentage`, `value: 10`, `scope: global`, and expiry date
- "Set up a bulk discount — book 3 sessions, get 1 free" → agent calls `create` with `type: bulk_session`
- "Create a staff discount of 15% that applies automatically to all staff bookings" → agent calls `create` with `type: percentage`, `scope: staff`, auto-apply enabled
- "Deactivate the Spring Sale discount code" → agent lists codes, finds Spring Sale, then calls `update` with `is_active: false`
- "Delete the old Christmas discount" → agent finds it by name, sets `confirmed: true`, then calls `delete`

---

### Multi-step flows in practice

Some requests span multiple tools. Here are two complete examples showing the full agent flow:

**"Book the Tuesday yoga session on 15th April for my daughter Emma"**
1. Agent calls `search_activities` → `list` to find the yoga activity slug
2. Agent calls `search_activities` → `get_sessions` with the yoga slug to find the 15th April session ID
3. Agent calls `my_participants` → `list` to find Emma's participant ID
4. Agent calls `my_bookings` → `create` with the session ID and Emma's participant ID
5. Agent reports back: "I've booked Emma into the Tuesday yoga session on 15th April."

**"Mark everyone who attended today's pilates class"**
1. Agent calls `instructor_sessions` → `upcoming` to find today's pilates session
2. Agent calls `instructor_sessions` → `get_details` with the session ID to get the participant list and booking IDs
3. Agent calls `mark_attendance` for each booking with `status: attended`
4. Agent reports: "Marked 8 participants as attended in today's pilates session."

---

## 10. Development

### Directory structure

```
mcp/
├── packages/
│   └── server/        # Role-aware MCP server (npm: @wellfoundation/booking-mcp)
│       └── src/
│           ├── index.ts          # Login → detect role → register tools → start server
│           ├── api-client.ts     # HTTP client: CSRF fetch, login, JWT management
│           ├── config.ts         # Loads WFCS_API_URL, WFCS_EMAIL, WFCS_PASSWORD from env
│           ├── types.ts          # Shared TypeScript types
│           └── tools/            # All 14 tool files (discovery, bookings, participants, credit, gift-aid, profile, instructor, admin-*)
└── workers/
    ├── src/
    │   ├── index.ts              # Cloudflare Worker entry point, routing, auth parsing
    │   ├── api-client.ts         # Worker-specific API client (uses KV for JWT cache)
    │   ├── protocol.ts           # JSON-RPC message handling
    │   └── tools/index.ts        # Tool set assembly per role
    ├── wrangler.toml
    └── package.json
```

### Building

```bash
# From mcp/
npm install          # install all workspace dependencies
npm run build        # compile all packages (runs tsc in each)
```

### Testing locally

The simplest way to test a local package is to point Claude Desktop or Claude Code at the compiled `dist/index.js` using the stdio config (see Section 6), then ask Claude to call tools.

For the Cloudflare Worker, run `npx wrangler dev` and test with curl:

```bash
# Call the health endpoint
curl http://localhost:8787/

# Call a tool (JSON-RPC format)
curl -X POST http://localhost:8787/admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic $(echo -n 'admin@booking.local:password123' | base64)" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "verify_connection",
      "arguments": {}
    }
  }'
```

### Adding a new tool

1. Create or edit the relevant file in `packages/server/src/tools/`
2. Export a `register*Tools(server, client)` function following the existing pattern
3. Import and call it in `packages/server/src/index.ts`, inside the appropriate role gate (`if (role === 'admin' || ...)`)
4. Rebuild with `npm run build`
5. Restart the MCP server (Claude Desktop / Claude Code) to pick up the new tool

---

*Last updated: 2026-03-19. Soft-decline attendance (no longer cancels on "No"). Notification templates (DB-overridable copy for 7 types, super_admin UI only). Attendance "Unpaid" badge now visible to instructors. Discount code management added (super_admin only): manage_discount_codes tool with list/create/update/delete. Booking discount UX: staff/user-scoped auto-discounts now apply correctly; Stripe form hidden when discount covers full cost; savings messaging shown in booking popover.*
