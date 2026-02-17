# WFCS Booking — Wiki

Online booking system for **The Well Foundation** (SC040105), a Scottish charity providing sports and community activities in the Bellshill and Eurocentral area.

- GitHub repo: [waseemsadiq/well-booking](https://github.com/waseemsadiq/well-booking)
- Organisation: info@wellfoundation.org.uk

---

## Quick start

```bash
git clone <repo-url> booking
cd booking

# Install deps (from inside the app subfolder)
cd booking && composer install && npm install && cd ..

# Reset DB and start server (from git root)
./galvani booking/db-init.php   # wipe + seed
./galvani                       # http://localhost:8080/booking/
```

Full setup instructions: [Getting Started](Getting-Started)

---

## Wiki pages

| Page | Contents |
|---|---|
| [Getting Started](Getting-Started) | Prerequisites, clone, db-init, start server, first login |
| [Architecture](Architecture) | MVC layers, request flow, basePath, dual-deploy |
| [Galvani Rules](Galvani-Rules) | 13 critical runtime rules with before/after examples |
| [Database](Database) | Tables, relationships, DB reset, schema location |
| [Deployment](Deployment) | Step-by-step LAMP deploy via build.sh |
| [Contributing](Contributing) | Branching, commit style, code rules, CSS build |
| [MCP Servers](MCP-Servers) | AI assistant integration — Claude Desktop, Claude Code, Cloudflare Workers |

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | PHP MVC, custom router |
| Dev runtime | Galvani (async, multi-threaded, embedded MariaDB) |
| Production | LAMP (standard PHP + MySQL) |
| Frontend | TailwindCSS v3, Vanilla JS |
| Payments | Stripe (PaymentIntents) |
| Email | Resend (HTTP API, no Composer dependency) |
| SMS / WhatsApp | Bird (mock-able locally) |

---

## Test accounts

All passwords are `password123`.

| Email | Role | Notes |
|---|---|---|
| `customer@booking.local` | customer | individual account, £50 credit |
| `instructor@booking.local` | instructor | |
| `admin@booking.local` | super_admin | full access incl. Settings, Payments |
| `admin2@booking.local` | admin | no Payments or Settings tabs |

---

## Organisation details

**The Well Foundation** · SC040105
Registered: 211B Main Street, Bellshill ML4 1AJ
Operating: 4 Parklands Way, Eurocentral ML1 4WR
Email: info@wellfoundation.org.uk
