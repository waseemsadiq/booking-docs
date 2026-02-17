# Contributing

Guidelines for contributing to WFCS Booking.

---

## Before you start

1. Read [Getting Started](Getting-Started) to get the dev environment running.
2. Read [Galvani Rules](Galvani-Rules) — violations cause silent bugs and are hard to debug.
3. Check existing open issues before starting work.

---

## Branch naming

Branches follow the convention:

```
feature/N-short-description
fix/N-short-description
docs/short-description
chore/short-description
```

Where `N` is the GitHub issue number. Examples:

```
feature/4-spa-to-mvc
fix/12-waitlist-expiry-bug
docs/add-wiki-pages
chore/upgrade-tailwind
```

Create your branch from `master`:

```
git checkout master
git pull
git checkout -b feature/42-my-feature
```

---

## Commit message style

This project uses **Conventional Commits** (`type: subject`).

**Types:**

| Type | When to use |
|---|---|
| `feat` | New feature or user-visible behaviour |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change with no behaviour change |
| `test` | Adding or updating tests |
| `chore` | Tooling, config, dependencies |
| `style` | CSS/formatting changes only |

**Rules:**

- Subject line: imperative mood, no trailing period, 72 characters max.
- Use the body (after a blank line) for context — what changed and why.
- Reference issues with `closes #N` or `refs #N` in the body.

**Examples:**

```
feat: add waitlist promotion email notification

Sends an email via Resend when admin promotes a user from the waitlist.
The email includes a payment link and expires 24 hours after promotion.

closes #18
```

```
fix: restrict Settings nav to super_admin only

admin role was incorrectly seeing the Settings tab. Moved the
super_admin guard to buildNavForRole() in helpers.php.

refs #22
```

---

## Code style rules

These are **non-negotiable**. Pull requests that violate these rules will not be merged.

### PHP-first — no fetch() for server mutations

Use `<form method="POST">` for all server-side mutations (create, update, delete). Never use `fetch()` or `XMLHttpRequest` to POST data that changes server state.

`fetch()` is permitted only for:
- Reading JSON data to render in the browser (e.g. availability calendar)
- DELETE requests via the REST API (where the operation is triggered by a user action in the UI after a confirm dialog)

### No numeric IDs in URLs

All customer-facing and instructor-facing URLs use slugs, not numeric database IDs.

- Correct: `/activities/monday-evening-football`
- Wrong: `/activities/42`

Slug generation is handled automatically by `ActivityRepository` on creation.

### Popover API for all dialogs

Every dialog, confirmation, alert, and prompt must use the native **Popover API** (`<div popover="manual">`).

**Before writing any dialog, check `booking/app/Views/shared/`** — five shared partials are already included in the layout:

| File | JS call |
|---|---|
| `shared/alert-dialog.php` | `showAlert(msg, opts)` |
| `shared/confirm-dialog.php` | `showConfirm(msg, opts)` → `Promise<boolean>` |
| `shared/prompt-dialog.php` | `showPrompt(msg, opts)` → `Promise<string\|null>` |
| `shared/cancel-booking-dialog.php` | cancel booking flow |
| `shared/room-booking-dialog.php` | meeting room booking form |

Do not:
- Use `alert()`, `confirm()`, or `prompt()`.
- Use `fixed inset-0 bg-black/50` overlay divs.
- Re-include or rewrite shared dialog partials.
- Write a new `<div popover="manual">` unless the use case is genuinely not covered by the shared partials.

### No inline styles

Never use `style=""` attributes. All styling must be Tailwind utility classes or, where Tailwind is insufficient, a `<style>` block in the view file.

Tailwind classes are mobile-first (`md:`, `lg:` prefixes for larger breakpoints). Design for mobile first.

### No innerHTML with dynamic data

Never use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with dynamic data. This is a hard ban — there are no exceptions.

Use DOM methods instead:

```javascript
// Correct
const el = document.createElement('div');
el.textContent = userSuppliedValue;
parent.appendChild(el);

// To clear and repopulate a container:
container.replaceChildren();
```

### Repository pattern

All SQL queries live in `app/Repositories/`. Services contain business logic and call repositories. Controllers orchestrate services. No controller or service should call `$this->db->query()` directly.

### DRY — use existing helpers and services

Before writing new logic, check:
- `app/Helpers/` — auth, view rendering, validation, date formatting, CSRF
- `app/Services/` — booking, payment, upload, notification, session, gift aid
- `app/Views/shared/` and `app/Views/partials/atoms/` — reusable UI fragments

### SVG icons only

No emoji icons, no icon font libraries, no AI-generated icon images. Use inline SVG from [Heroicons](https://heroicons.com) or [Feather Icons](https://feathericons.com).

### Form layout

Use the standard form grid:

```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
        <label class="font-medium">Field label</label>
        <input ...>
    </div>
</div>
```

Labels use `font-medium`, not uppercase. (Uppercase is reserved for navigation items.)

---

## CSS build

The app uses TailwindCSS v3. The source is in `booking/css/`. The compiled output is `booking/dist/app.css` (not committed to git for Galvani dev, but included in the build for production).

```bash
# Install dependencies (once)
npm install

# Build once
npm run build:css

# Watch mode during development
npm run watch:css
```

Run the watch command in a separate terminal while working on views.

---

## Pull request checklist

Before opening a PR:

- [ ] All Galvani rules followed (no transactions, singleton DB, etc.)
- [ ] No `style=""` attributes anywhere in the diff
- [ ] No `alert()`, `confirm()`, `innerHTML`, or custom overlay divs
- [ ] No numeric IDs in any URL
- [ ] PHP POST forms for server mutations, not fetch()
- [ ] CSS rebuilt if Tailwind classes were added (`npm run build:css`)
- [ ] Galvani restarted and manually tested
- [ ] Mobile layout checked (resize browser to ~375px)
- [ ] Commit messages follow Conventional Commits format

---

## Asking for help

If you are unsure about the Galvani runtime behaviour, check [Galvani Rules](Galvani-Rules) first — most common bugs are documented there with before/after examples.

For architecture questions, see [Architecture](Architecture).
