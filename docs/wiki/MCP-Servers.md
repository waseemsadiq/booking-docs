# MCP Servers

MCP (Model Context Protocol) servers that let AI assistants — Claude Desktop, Claude Code, or any MCP-compatible client — interact with the WFCS Booking system through natural language.

Full technical guide: [docs/mcp-guide.md](../mcp-guide.md)

---

## Packages

One role-aware server that detects the user's role at login and exposes only the appropriate tools:

| Package | npm name | What it does |
|---|---|---|
| `server` | `@wellfoundation/booking-mcp` | Single role-aware server. Logs in, detects role, exposes the right tools automatically. |

No need to choose a package — role is detected from your login credentials.

---

## All tools

### Customer tools (all roles)

| Tool | What it does |
|---|---|
| `verify_connection` | Check API connection and show user info |
| `search_activities` | Browse activities, check availability, view sessions |
| `my_bookings` | List, view, create, cancel, and pay for bookings |
| `my_participants` | Manage child/dependent participants |
| `my_credit` | View balance, transactions, top up, withdraw |
| `my_gift_aid` | Gift Aid declarations and claims |
| `my_profile` | View and update profile |

### Instructor tools (instructor, admin, super_admin)

| Tool | What it does |
|---|---|
| `instructor_sessions` | View upcoming/past sessions and participants |
| `mark_attendance` | Mark attendance for a booking |
| `instructor_stats` | View attendance statistics |

### Admin tools (admin, super_admin)

| Tool | What it does |
|---|---|
| `manage_activities` | Create, update, delete activities; generate sessions |
| `manage_venues` | CRUD for venues |
| `manage_spaces` | CRUD for bookable spaces |
| `manage_users` | CRUD for users |
| `admin_bookings` | List, update, promote waitlist, refund, delete bookings |
| `admin_reports` | Booking, attendance, payment, activity reports + CSV export |
| `admin_gift_aid` | Gift Aid overview and export |
| `admin_withdrawals` | Process/reject withdrawal requests |
| `admin_settings` | Payment settings (super_admin) |
| `admin_notify` | Send ad-hoc email broadcasts to customer groups (all, by activity, by session, or individual). Two-step preview → confirm → send flow. |

> **Destructive actions** (cancel, delete, refund, withdraw) require `confirmed: true`. Without it the tool returns a summary and asks for confirmation.

---

## Admin prompts

| Prompt | What you get |
|---|---|
| `daily-briefing` | Today's bookings, sessions, pending actions |
| `session-report` | Attendance report for an activity + date range |
| `waitlist-review` | Waitlisted bookings + promotion recommendations |
| `revenue-summary` | Payment data for a period |

---

## Setup

### Standard setup — end users (Cloudflare Workers)

The MCP server is deployed to Cloudflare Workers. A developer does this once. End users (admins, instructors, customers) just configure Claude Desktop — no Node.js, no cloning repos.

**For end users:** install [Claude Desktop](https://claude.ai/download), then add this to the config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

Use `/admin`, `/instructor`, or `/customer` for the endpoint. The URL and credentials are provided by your developer.

To generate the Base64 credential string:

```bash
echo -n "your@email.com:yourpassword" | base64
```

**For developers — deploy the Worker:**

```bash
cd mcp/workers
npx wrangler kv namespace create JWT_CACHE   # paste returned ID into wrangler.toml
npx wrangler secret put WFCS_API_URL         # enter: https://your-booking-app.com/booking
npx wrangler deploy
```

Endpoints: `/customer`, `/instructor`, `/admin`.

### Developer setup — local stdio

For developing and testing tool changes only. Requires Node.js 18+ and the repo cloned locally.

```bash
cd mcp
npm install
npm run build
```

Add to Claude Desktop config or Claude Code (`.claude/settings.json`):

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

---

## What's not supported via MCP

- Image uploads — use the web UI
- Stripe payment creation — can view and refund payments, not create new intents
- Real-time updates — tools are called on demand
- Notification preferences — managed via the web UI
