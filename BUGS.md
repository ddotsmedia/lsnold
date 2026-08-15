# Page Content Editor — Bug Diagnostic

**Date:** 14 August 2026
**Scope:** `apps/frontend/app/admin/pages/[id]/content/page.tsx`, `apps/backend/src/controllers/pageContentController.ts`,
routes in `apps/backend/src/routes/admin/pages.ts:225-230`, schema in `apps/backend/migrations/024_add_page_content_sections.sql`

## How this was tested

No application code was changed. Two methods:

1. **SQL replay.** A throwaway `postgres:16-alpine` container was loaded from a
   `pg_dump` of production, and the exact statements each handler issues were run
   against it — including the edge cases (duplicate keys, delete-then-recreate,
   restore onto a reused key, reorder with foreign ids). Production was not touched;
   the container was destroyed afterwards.
2. **Live endpoint probes** against `https://bayrotna.ae/api/v1` for auth and the
   public read path.

The admin UI itself could **not** be driven end-to-end: this session has no admin
login. Frontend findings below are from reading the code and from measurable CSS,
and each is marked with its confidence.

---

## Verdict per feature

| Feature | Status | Evidence |
|---|---|---|
| Section creation | **Works** | Insert succeeds; duplicate key raises `23505`, handler returns `409` with a readable message |
| Section editing | **Works** | Fields assigned explicitly, so clearing a title is possible; `updated_at` trigger fires (`12:41:42` → `09:12:14`) |
| Soft delete | **Works** | Sets `deleted_at`; the partial unique index then frees the key for reuse — verified by recreating `intro` after deleting it |
| Restore | **Works** | Restores the row, and correctly returns `409` when the key was reused in the meantime, telling the admin to rename the other one |
| Reorder (server) | **Works** | Single `UPDATE … FROM unnest()`, so a half-applied order is impossible. 1-based `sort_order` does not collide with create's `MAX+1` |
| Reorder (client) | **Broken on touch** | See B3 |
| Error handling | **Mostly good** | Zod → 400, `23505` → 409, missing row → 404, auth → 401 (all verified). Two gaps: B1, B2 |

The core CRUD is sound. The bugs below are around the edges of it.

---

## Confirmed bugs

### B1 — `pageId` in the URL is ignored by update, delete and restore
**Severity: Medium** · `pageContentController.ts:131, 184, 204`

The routes are `/admin/pages/:pageId/content/:sectionId`, but `updateSection`,
`deleteSection` and `restoreSection` never read `:pageId` — they match on
`sectionId` alone. A request naming page A with a section id belonging to page B
edits page B.

Reproduced: issuing the update statement for
`PUT /admin/pages/<contact-id>/content/<home-section-id>` edited the **home**
section and returned success — the returned row's `page_id` was still home's.

Not privilege escalation (every caller is already an authenticated admin), but it
means a stale browser tab or a copy-pasted id silently edits the wrong page's text,
and the 404 that should protect against it never fires.

**Fix:** add `AND page_id = $n` to all three statements, resolving `:pageId` the way
`createSection` and `reorderSections` already do.

### B2 — Reorder reports success for rows it did not touch
**Severity: Low–Medium** · `pageContentController.ts:245`

The handler returns `{ reordered: ids.length }` — the length of the *request*, not
the number of rows updated. Reordering with ids from another page updates **0 rows**
but still answers `{"reordered": 2}`, and the UI toasts "Order saved".

Reproduced: the replayed statement printed `UPDATE 0` while the response shape
would have claimed two.

**Fix:** return `result.rowCount`, and have the client warn when it comes back lower
than the number of ids sent.

### B3 — Reordering is impossible on a phone or tablet
**Severity: High** (given the project's mobile-first rule) · `content/page.tsx:212-223`

Ordering is native HTML5 drag-and-drop (`draggable` + `dragstart`/`dragover`/`drop`).
Mobile browsers do not generate those events from touch input, so on a phone or
tablet the sections simply cannot be reordered — and there is no move-up/move-down
fallback anywhere in the UI.

**Fix:** add ▲/▼ buttons per section calling the same `commitOrder(from, to)`. They
also make ordering keyboard-accessible, which drag-and-drop currently is not.

### B4 — Tap targets are 28–36px against the project's own 48px minimum
**Severity: Medium** · `components/admin/shared.tsx:262-265`

`Button` computes to roughly **28px** tall at `size="sm"` (`px-3 py-1.5 text-xs`)
and **36px** at `md` (`px-4 py-2 text-sm`). Every row action in the editor — Edit,
Hide, Delete, Restore — uses `sm`. The project's mobile checklist requires 48px.

**Fix:** raise the minimum height on both sizes, or add `min-h-11`/`min-h-12` to the
button base class. This affects every admin screen, not just this one.

### B5 — The "Content & SEO" tab edits a field nothing renders
**Severity: Medium–High (UX trap)** · `app/admin/pages/page.tsx:123, 155-157`

The page-edit modal opens on a tab named **"Content & SEO"** containing a ten-row
textarea labelled *"Page content (HTML supported)"*. It writes `pages.content`.

Nothing on the public site reads `pages.content` — the public renderer is
`PageSections`, which reads `page_content_sections` via `/pages/:slug/content`. The
real editor is behind the separate **"Text"** link in the pages list.

So the most obvious-looking box for typing a page's text is the one that does
nothing, and an admin gets no error — the save succeeds and the site is unchanged.

**Fix:** either relabel that field (it is effectively a legacy note field) and point
admins at the Text editor from inside the modal, or drop it from the modal entirely.

### B6 — Opening a second section for editing silently discards the first
**Severity: Medium** · `content/page.tsx:80-83`

`startEdit` overwrites `editingId` and `draft` unconditionally. While section A is
open with unsaved text, clicking **Edit** on section B replaces the draft — A's
changes are gone with no prompt.

**Fix:** if `editingId` is set and the draft differs from the stored values, confirm
before switching.

### B7 — "Add" can be double-submitted
**Severity: Low** · `content/page.tsx:129-144, 343`

`create()` has no in-flight flag and the button is never disabled. A double click
sends two POSTs; the first succeeds and the second fails with a `409`, so the admin
sees an error toast for a section that was in fact created.

**Fix:** the same `saving` guard the edit form already uses.

### B8 — Stale drag highlight
**Severity: Low** · `content/page.tsx:216`

`overIndex` is set on `dragover` but only cleared on `drop`/`dragend`. Dragging out
of the list and releasing outside it leaves a card ringed green.

**Fix:** add `onDragLeave` clearing `overIndex`.

### B9 — Page title lookup is capped at 100 pages
**Severity: Low** · `content/page.tsx:63, 67`

The header finds the page by scanning `/admin/pages?limit=100`. Past 100 pages the
lookup misses and the heading degrades to "Page text" with no "View page" link.
There are 9 pages today, so this is latent.

**Fix:** fetch the single page by id instead of scanning the list.

---

## Needs a device to confirm

### B10 — Rich text toolbar may not work on touch
`components/admin/RichTextEditor.tsx:87, 96, 104`

Every toolbar button binds **`onMouseDown` only**, with `preventDefault()` to keep
the contentEditable selection alive. That is the correct desktop technique. On touch
the event order differs and the selection may already be gone by the time the
synthetic `mousedown` arrives, which would make Bold/Italic/lists no-ops on a phone.

I could not test this without a device. If it does fail, the fix is to bind
`onPointerDown` instead, which covers both input types.

### B11 — `document.execCommand` is deprecated
`RichTextEditor.tsx:58, 71, 129`

Informational, not a live defect: it still works in every current browser and the
file already documents the choice. Worth knowing it has no direct replacement, so
any future migration means adopting an editor library.

---

## Not bugs (checked and ruled out)

- **Route shadowing.** `POST …/content/reorder` is registered before
  `…/content/:sectionId/restore` and there is no `POST …/content/:sectionId`, so
  `reorder` cannot be captured by a parameter route.
- **Unique index too broad.** It is partial (`WHERE deleted_at IS NULL`), which is
  what lets a deleted section's key be reused.
- **`updated_at` never changing.** A `BEFORE UPDATE` trigger maintains it; verified
  firing.
- **Clearing a title being impossible.** Fields are assigned explicitly rather than
  with `COALESCE`, so `null` is distinguishable from "unchanged".
- **XSS via section content.** Server-side allowlist sanitiser; `<script>`,
  `<style>`, `<iframe>` are stripped with their contents and only safe href schemes
  survive. `img` is not on the allowlist.
- **Public page breaking when content fails.** `listPublicSections` returns `[]` on
  error and `usePageSections` swallows failures, so a page keeps its built-in copy.
- **Auth.** `GET`/`POST`/`PUT`/`DELETE` on the admin routes all return `401 Missing
  token` unauthenticated — verified against production.

---

## Suggested order of work

1. B5 — admins are typing into a dead field today
2. B3 + B4 — the editor is not usable on a phone, against the project's own rule
3. B1 — silent wrong-page edits
4. B6 — silent data loss
5. B2, B7, B8, B9 — polish
6. B10 — confirm on a real device, then fix if it reproduces
