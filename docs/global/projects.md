# Global Project Rules

Rules that apply across all Galvani/PHP MVC projects but don't belong in CLAUDE.md.

---

## Forms

Layout: `grid grid-cols-1 md:grid-cols-2 gap-6`
Labels: `font-medium` — NEVER uppercase (uppercase is nav only)
All server writes use `<form method="POST">` — never JS fetch

---

## File Naming

NEVER underscore-prefixed filenames (`_foo.php`) — signals dead/backup code
Active partials use plain names: `notification-channel-toggles.php` not `_notification-channel-toggles.php`

---

## Image Uploads

Use `UploadService::validateAndMove($file, $subdir)` — handles jpg/png/webp, 5MB limit, `getimagesize()` check
Activities: multiple images via `activity_images` table
Venues: single `image_path` column

---

## URL Patterns

No numeric IDs in browser URLs — slugs only
Activity slugs: auto-generated from title, numeric suffix for uniqueness (`yoga-2`)
Customer URLs use slugs; instructor session URLs use `{slug}/{date}`

---

## CSRF Token & Fetch Responses

For JSON API requests with `fetch()`:
```javascript
const response = await fetch(csrfUrl(basePath + '/api/endpoint'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _csrf_token: getCsrfToken(), ...payload })
});
const data = await response.json();
if (!response.ok) throw new Error(data.message || 'Request failed');
```

**Critical:** Call `.json()` BEFORE checking `response.ok` — this allows error responses with JSON messages to be properly extracted. If you check `.ok` first and it fails on an error page (HTML), `.json()` will throw a parse error.

- CSRF token sent as query param via `csrfUrl()` or in request body
- Always parse JSON before checking HTTP status
- Reference: `activity-detail.php` and `bookings.php` payment flows

---

## Popover Pattern

Reference implementation: `activity-detail.php`
Structure: header / body / footer, `::backdrop` CSS, `showPopover()` / `hidePopover()`
Full pattern notes: `memory/popover-pattern.md`
