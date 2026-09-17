# Zoho Procurement — Complete Feature, Logic & Build Spec (Final)
*Compiled from Zoho Procurement's public help documentation across every module's overview page plus deep-dived creation/workflow/approval logic pages. Restated in original wording as an engineering spec for replicating the product on Zoho Catalyst.*

> Source: zoho.com/procurement/help. This is the most complete version of this spec — it supersedes earlier drafts. Where a specific mechanic wasn't documented in the pages fetched, that's flagged explicitly in Part J rather than invented.

---

# PART A — WHAT THE PRODUCT IS

Zoho Procurement is a procure-to-pay (P2P) app: request → source → order → receive → bill → pay, with budget control, configurable approvals, and vendor self-service throughout.

```
Purchase Request ──► Request for Quote ──► Award ──► Purchase Order
Purchase Request ─────────────────────────────────► Purchase Order (direct)
Purchase Order ──► Purchase Receive ──► Bill ──► Payment Made / Batch Payment
                                          └────► Vendor Credit ──► Refund or offset a future Bill
```

Supporting pillars: **Approvals**, **Budgets**, **Custom Modules/Blueprints**, **Vendor Portal**, **Analytics**, **Settings/Customization/Automation**.

---

# PART B — ORGANIZATION, ACCOUNT & NAVIGATION

## B.1 Organizations
- **Create**: Org-name dropdown → Manage → **+ New Organization** → enter business details → Save. New orgs get a **14-day free trial**; afterward you must subscribe to a paid plan (no mention of an automatic Free-plan fallback in the docs fetched — treat "subscribe or lose access" as the documented behavior).
- **Join existing org**: if you already have an org in another Zoho finance app, "Join your existing organizations" lists them; click **Join**.
- **Switch**: org-name dropdown lists every org you belong to; click to switch context.
- **Mark as Default**: org-dropdown → Manage → **More** icon next to an org → **Mark as Default** — this org auto-opens on every login.
- **Delete Organization**: **destructive, Super Admin only**. Prerequisite: strongly recommended to back up first (Settings → Developer Data → Data Management → Backup Data). Flow: org-dropdown → Manage → More → Delete → must explicitly check "Yes, I want to permanently delete this Zoho Procurement organization and its contents" → confirm via a second **Delete Organization** click. Implement as an irreversible, double-confirmed, role-gated action in your Catalyst Function (`org.delete`), and trigger an automatic backup export before hard-deleting rows.
- **Super Admin** has unique privileges beyond regular Admin (the docs reference this concept — e.g., only a Super Admin can delete the org) — model a distinct `is_super_admin` flag separate from role-based permissions, since it governs org-level irreversible actions that no configurable role/permission should be able to grant.

## B.2 Navigation shell (every screen)
Home/Dashboard tab, Sidebar module nav, global Search Bar with Advanced Search (per-module filters), Organization switcher, Quick Create (one-click record creation), Notifications (in-app alerts on transaction/approval events), Settings gear, Profile & Help menu (account info, docs, FAQs, community forum, video tutorials, migration guides), App launcher (cross-Zoho-product switcher).

---

# PART C — MASTER DATA

## C.1 Items
Fields/actions: create manually, clone, bulk import. Manage: edit, mark active/inactive, delete. Other actions: filter, export (all/current view), custom views, sort, rearrange columns, refresh. Preferences: decimal precision for quantity, duplicate-name handling, custom fields, validation rules, custom buttons/links, related lists.

## C.2 Vendors
### Add Vendor (exact fields)
`Primary Contact Name` (optional), `Company Name` (optional), `Vendor Display Name` (**required**, used everywhere downstream), `Vendor Email` (**required only if inviting to portal**), `Currency` (defaults to org base currency), `Payment Terms` (pick existing, or inline **Configure Terms** → **+ Add New** → `Term Name` + `Number of Days` → Save), `Enable Portal` toggle + `Portal Language`, `Billing Address` + `Shipping Address` (address-format governed by org preference), multiple `Contact Persons`.

### Vendor Onboarding (self-service intake — distinct from vendor-record Approvals)
- **Enable**: Settings → Vendor Portal (under Setup & Configurations) → check **"Collect vendor's organization details when they sign up for the portal"** → Save.
- **Invite**: Vendors sidebar → dropdown next to **+ New** → **Invite Vendor** → enter `Display Name` + `Email Address` → **Send Invite**. This creates an "Invited Vendor" record, not yet a full active Vendor.
- Invited vendor accepts the emailed portal link, signs up, and fills in: **Business Details**, **Address Details**, **Bank Details**, **Other Details** (see Part F.2 for the vendor-side view of this).
- **Cancel Invite**: only possible **before** the vendor accepts it (Vendors → All Vendors dropdown → Invited Vendors → open the vendor → Cancel Invite → confirm).
- **Approve**: Vendors → Invited Vendors tab → open the vendor showing **"Approval Pending"** → **Approve** → **Proceed**. If Vendor Approvals (the separate transactional gate, §C.2.1) is *also* enabled, the button becomes **"Approve and Proceed"** and routes the now-created vendor record into that approval flow instead of activating immediately. An admin can alternatively **Edit and Approve** to fix small details inline before approving. Once approved, vendor status → **Active**, vendor is emailed, and can now be used in transactions and use the portal.
- **Request More Details**: Invited Vendors → open vendor → More → **Request More Details** → type what's missing → Send. Vendor status → **Pending Review**; vendor gets an email and can resubmit (see Part F.2).
- **Reject**: open vendor → **Reject** → mandatory reason → Reject. Vendor is never activated.
- **Disable**: reverse the Settings checkbox — new vendors then require full manual entry again.

### C.2.1 Approvals for Vendors (transactional gate on an existing vendor record)
Standard pattern: configure → submit → approve/reject → resubmit-if-rejected → disable. A vendor isn't usable in transactions until approved, if enabled. (Note this is a *separate* gate from Onboarding's own approve/reject step above — an admin should decide at build time whether completing Onboarding auto-satisfies this, or whether both gates apply sequentially; the docs describe them as related but distinct settings.)

### Manage / Other actions
Edit, mark active/inactive, delete. Filter, **Merge Vendors** (dedup — re-point historical transactions from the losing record(s) to the surviving one before archiving them), attach files, comments, export, sort, rearrange columns, refresh. Preferences: duplicate display-name handling, auto vendor numbering, billing/shipping address format templates, custom fields, validation rules, custom buttons/links, related lists.

---

# PART D — THE P2P TRANSACTIONAL CHAIN

## D.1 Purchase Requests

### Exact create-form fields
`Expected Date`, `Delivery Address` (Change/Remove), `Reason`, `Notes to Approver`, `Reference#`; repeatable line table: `Item Name` (typed or picked), `Category`, `Description`, `Preferred Vendor` (optional), `Quantity`, `Estimated Rate`, `Discount %` — **+ Add Another Line** / delete-line via trash icon. Attachments: **max 5 files, 10 MB each**, added post-save via the **+** next to Documents; deletable with a confirm dialog.

### Statuses & transitions
`Draft` (freely editable) → **Submit** → `Awaiting Approval` (routes per the org's PR approval config — Hierarchical or Custom only) → **Approve** → `Approved` (or approver can **Forward** to push another approval hop without finalizing) | **Reject** → `Rejected` (editable + resubmittable, re-evaluates routing fresh). `Recall` is legal only from `Awaiting Approval`, pulls it back to submitter for edits, then resubmit. `On Hold` is a paused sub-state of `Approved` (approved in principle, blocked e.g. by budget/timing). `Processed` — set once **all** line items have been converted onward to an RFQ or PO; partial conversion should show progress, not force early "Processed." `Canceled` and `Recalled` and `Rejected` are the non-approved exits; delete should probably be restricted to `Draft` for data integrity even though the docs don't explicitly restrict it.

### Convert Requested Items
The mechanism turning approved PR lines into RFQ lines or PO lines. Must decrement a `remaining_qty` **per line**, since a single PR's items can split across multiple downstream RFQs/POs.

## D.2 Request for Quotes (RFQ) — the most complex module

### Create form — six sections, each independently save-as-draftable
1. **Basic Details**: `Title`, `Request for Quote#` (**auto-generated, not editable**), `Reference Number`, `Description`, `Currency` (vendors bid in this currency).
2. **Items** — two entry paths:
   - **Add Approved Purchase Request Items**: pick from already-approved PR lines.
   - **Add Items From the Items Module** (**Add New Item**): `Name`, `Description` (shown to vendors), `Account`, `Expected Quantity` + unit (shown to vendors), `Expected Price` (**internal only, never shown to vendors**), **Pricing Options** — two independent checkboxes: *Allow vendors to include shipping charges in the bid* and *Allow vendors to include additional charges in the bid*, `Expected Date` (shown to vendors), `Notes` (shown to vendors).
3. **Terms and Conditions** — free text, shown to vendors.
4. **Documents** — **Add New Document** → Upload File (device or connected cloud storage) → `Name` + `Description` → Add; editable/deletable; visible to vendors.
5. **Bidding Preferences**: `Bid Start Date`, `Bid End Date`, `Awarding Date` — all shown to vendors.
6. **Team**: internal collaborators. Owner is auto-added and **cannot be removed**. **+ Add User**: `Name` (selects existing user), `Email` (auto-filled), `Phone`, `Designation`, `Role` (their role *within this RFQ*, distinct from their org-wide Role), and a **"Mark user as point of contact"** checkbox — checked users' contact details become visible to bidding vendors as who-to-contact.

### RFQ Details page (once created) — top summary + 6 tabs
Top: bidding period, awarding date, a **live bid timer** (starts at publish), and the RFQ's lifecycle/current status.
Tabs: **Details** (vendor-participation summary by invite status, basic-details summary, activity log), **Items** (qty/expected date/expected unit price table), **Vendors** (added vendors + contact + invite status + latest bid), **Team**, **Vendor Responses** (bids per vendor), **Award** (awarded items, switchable between *Vendor Details* view and *Item Details* view).

### Statuses
`Draft → Awaiting Approval → Approved | Rejected` (+ `Recalled`) → **Publish** → `Published` → (bidding closes, by deadline or manual End Bidding) → award created/approved/published → `Awarded` → (all awarded qty converted to PO(s)) → manual **Close** → `Closed`. `Canceled` is a side-exit from most non-terminal states.

### Publish pipeline (exact mechanics)
1. **Add Vendors to a Request for Quote**: RFQ (Pending/Approved tab) → View Details → *Vendors* tab → **+ Add Vendor** → select → Add.
2. **Publish**: RFQ (Approved tab) → View Details → **Publish** (top right) → *Publish Request for Quote* pop-up: checkbox **"Invite vendors automatically upon publishing"** (if checked, also set **Invite Expires On**; if unchecked, invites must be sent manually afterward) → verify the bidding period → **Publish**.
3. **Invite Vendors** (manual path, if auto-invite wasn't used): Published tab → View Details → *Vendors* tab → per-vendor **Invite Vendor**, or multi-select → **Invite Vendors** → set **Expiration Date and Time** → **Send Invite**. Buyer is notified when vendors respond.
4. **Extend Bidding Period**: View Details → **Extend Bidding Period** → new **Bid End Date** → confirm.
5. **End Bidding** (manual early close): View Details → More → **End Bidding** → confirm. Vendors are notified and locked out of further submissions immediately.

### Vendor-side actions (mirrored in Part F.2 for the portal UI)
Acknowledge invite → Confirm participation (a **separate, later** step from acknowledgment) → Create a bid → Submit bid → Edit bid (only while unsubmitted, presumably) → Create additional/revised bids after submission (bids are versioned, not overwritten) → View own bid history.

### Surrogate Bids
Staff can create a bid *as* a vendor for offline/phone bidders. Enable → Create a Surrogate Bid for a Vendor → Download a Surrogate Bid (e.g. for vendor sign-off) → Disable when no longer needed. Store with an `is_surrogate` flag distinguishing it from portal-submitted bids in your data model.

### Compare & Award (exact mechanics)
- Published tab → View Details → *Vendor Responses* tab → **Compare and Award** → *Compare Bids* page.
- **Shortlist**: hover an item, click the Shortlist icon — **per (item, vendor) pair**, and multiple vendors can be shortlisted for the *same* item simultaneously.
- **Add Internal Notes** per (item, vendor) — buyer-only, never shown to vendors.
- **Compact View** (totals/summary: total cost, item name, quantity, unit price, delivery date) vs. **Expanded View** (full per-item detail: expected values, vendor notes, internal notes, item-level totals) — toggle top right.
- **Proceed to Award** → *Create Award* page: for each item, enter **Award Quantity** per vendor in the *Award Quantity* column — **quantity can be split across multiple vendors for the same item**. Enter **Notes** explaining the award decision. **Save as Draft**.
- **Edit an Award** (only before approval): Awarded tab → View Details → Award tab → More → Edit → Save as Draft.
- **Submit an Award for Approval**: Award tab → **Submit** → select approver → Submit.
- **Approve an Award**: Award tab → **Approve** → confirm.
- **Reject an Award**: Award tab → More → **Reject** → **mandatory reason** → Confirm.
- **Delete an Award**: Award tab → More → Delete → confirm.
- **Publish an Award**: Award tab → **Publish** → *Notify Vendors* pop-up with two **independent** checkboxes — "Notify the awarded vendors" and "Notify the vendors who are not awarded" — → Publish. If neither was checked at publish time, there's a standalone later action: Award tab → **Notify Vendors** → enable preferences → Save. Model notification-sent flags per vendor-invite (not per RFQ), since awarded/non-awarded vendors are notified independently and potentially at different times.
- **Create Purchase Order from Award**: Purchase Orders → More → **Awarded** → select the RFQ → **Create Purchase Order** → pick the **Vendor** (shows only that vendor's awarded items) → select which items to include → Continue → New PO form pre-filled.
- **Close** an RFQ manually once done (not automatic).

## D.3 Purchase Orders

### Exact create-form fields
`Vendor Name`, `Delivery Address` (explicit choice: **Organization** vs. **Customer** — drop-ship support), `Purchase Order#` (manual, or **Gear icon → "Continue auto-generating purchase order numbers"** → set `Prefix` + `Next Number` → Save), `Reference#` (cross-links to source RFQ/PR number), `Date`, `Delivery Date`, `Payment Terms` (dropdown, or **Configure Terms → + Add New** → `Term Name` + `Number of Days` → Save), `Shipment Preference`, item table (`Item Details` auto-populates `Account`/`Tax`/`Rate`/`Amount`, editable) — **+ Add New Row** or **+ Add Items in Bulk** (multi-select + quantities in one step).

### Three creation paths (converge on the same PO shape)
1. Blank/manual.
2. **From an Awarded RFQ**: Purchase Orders → More → Awarded → pick RFQ → Create Purchase Order → pick Vendor (their awarded items only) → select items → Continue → pre-filled New PO.
3. **From an Approved Purchase Request**: Purchase Orders → Approved tab → pick PR → Create → Purchase Order → select items → Continue → pre-filled New PO.
4. **Clone**: open existing PO → More → Clone → edit → Save.
5. **Import**: More → Import Purchase Orders → Choose/drag file → (download sample file first to check the required column format) → select Character Encoding + File Delimiter → Next → verify field mapping → Next → Import. (This 3-step upload→map→confirm importer pattern is reused identically for Items, Vendors, Bills, Purchase Receives, etc. per the docs — build one generic importer service.)

### Statuses
`Draft → Issued (sent to vendor) → Pending Approval (if enabled) → Approved → Closed`; `Canceled` if vendor rejects. `Issued` and `Approved` are **not strictly sequential** — model `approval_status` and `issuance_status` as semi-independent fields.

### Approvals, Convert, Cancel
- **Approvals**: Simple / Multi-Level / Custom / No-Approval (not Hierarchical). Configure → submit → approve/reject → resubmit → disable — same shape as everywhere else.
- **Convert**: PO → Purchase Receive (unreceived qty per line); PO → Bill (unbilled qty per line, from a Receive or directly).
- **Cancel**: whole PO, or specific **line items** within an otherwise-active PO. A fully canceled PO can be **reopened** (reverses cancellation in place, not a new record).
- **Auto-close preference** ("Close Purchase Orders"): governs whether a PO auto-closes once every line is fully billed, vs. requiring a manual close.
- **Share**: download PDF, **send PO directly to the vendor** (email), export, print.
- **Other actions**: filter, attach files, comments + full audit history, export current view, sort, rearrange columns, refresh.
- **Preferences**: close behavior, default terms/notes, approvals config, custom fields, validation rules, custom buttons/links, related lists.

## D.4 Purchase Receives (GRN)
Created standalone or **from a PO** (pulls ordered qty, editable down to what actually arrived — partial delivery is normal, a PO can spawn multiple Receives over time). Statuses: `In Transit` → `Received`, then a computed billing sub-status: `Billed` / `Partially Billed`. Manage: edit, mark In Transit/Received, delete. Other actions: export, attach files, sort, refresh. Preferences: custom fields, validation rules.
**Core invariant to enforce server-side**: a Bill line shouldn't exceed the corresponding Receive's received-but-unbilled quantity if the org wants strict "only pay for what arrived" control — make this a configurable validation rule (some orgs bill straight from a PO, skipping formal receiving).

## D.5 Bills

### Two creation paths
1. **Manual / from PO / from Receive** — standard form; **Make a Bill Recurring** turns it into a Recurring Bills template (an entry point into that module, not a separate feature); Clone; Import.
2. **Scan-to-Bill with Purchase Order Matching** (requires **Bill Reconciliation** enabled first):
   - Bills → **Uploaded Documents** tab → drag/drop or upload scanned invoice → status flips to **Processed** once OCR-scanned.
   - Hover the processed document → **Convert to Bill** → redirected to New Bill, pre-filled from the scan.
   - System matches each scanned line to a PO by item/qty/rate; matched lines show `Order Details` (PO#, qty ordered, rate) inline for visual confirmation.
   - **Mismatch handling**: unmatched lines can be explicitly **"Mark as Non-PO Item"** — an intentional, logged override for expenses that bypassed the PR/PO flow.
   - **Save as Draft**; the linked PO is associated with the resulting Bill.

### Statuses
`Draft → Pending Approval (if enabled) → Open → Overdue (computed: due_date < today) → Partially Paid → Paid`; `Void` reachable from most non-Paid states, and — unlike Cancel elsewhere — a **Void bill can be converted back to Draft** (reversible, not a dead end).

### Bill Reconciliation
A togglable check (prerequisite for PO Matching above) that **flags bills for review** — view flagged bills; disable when not needed.

### Approvals, Payment, Manage
- Approvals: standard configure/submit/approve/reject/resubmit/disable.
- **Record Payment**: offline payment, payment by check, or **apply existing Vendor Credit balance** to offset the bill — a single payment action should support a mixed cash+credit split.
- Manage: edit, void, un-void (Void→Draft), delete.
- Share: PDF, export, print. Other actions: filter, attach files, comments+history, export current view, sort, rearrange columns, refresh. Preferences: bill reconciliation toggle, approvals, custom fields, validation rules, custom buttons/links, related lists.

## D.6 Payments Made
Record a payment (against one or more bills — allocations), configure approvals, manage (edit/view), share, other actions (filter/sort/export/refresh), preferences. *(Payments Made is the one module Custom Approval explicitly cannot be applied to — see the approval matrix, Part E.)*

## D.7 Batch Payments
Pay multiple vendors/bills in one consolidated action: create a batch (select multiple bills/vendors), configure approvals, record payment for the batch, manage, other actions, preferences.

## D.8 Recurring Bills
Create a recurring template (vendor, frequency, start/end, amount, items) → system auto-generates **child bills** on schedule → record payment per child bill → manage/edit the template → other actions → preferences.

## D.9 Vendor Credits
Create a vendor credit (returns/overcharges/discounts that reduce what you owe), **Refunds for Vendor Credits** (get cash back instead of offsetting a future bill), approvals, manage, share, other actions, preferences. Applies to Bills via the mixed-payment mechanism in D.5.

---

# PART E — APPROVALS ENGINE (build this once, wire everywhere)

## E.1 Applicability matrix (exact)
| Type | PR | RFQ | PO | Receive | Bill | Payments Made | Batch Payments | Vendor Credits | Custom Modules |
|---|---|---|---|---|---|---|---|---|---|
| No Approval | – | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ |
| Simple | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Hierarchical | ✓ | ✓ | – | – | – | – | – | – | – |
| Multi-Level | – | – | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Custom | ✓ | ✓ | ✓ | ✓ | ✓ | *(unsupported)* | ✓ | ✓ | – |

Enforce this as literal config in the Settings UI (`ALLOWED_APPROVAL_TYPES[module]`) so admins can never configure an invalid combination.

## E.2 Custom Approval — the rule engine (the single most reusable piece)
- `Name`, `Description` (mandatory when Approval Type = Auto Reject — shown to the submitter *as* the rejection reason).
- **Criteria**: up to **10 conditions**, each `(field, comparator, value)`, added via **+ Add Criterion**. Combined via an explicit, **editable criteria pattern** using AND/OR with parentheses (e.g., `(1 AND 2) OR 3` — edit via the pencil icon next to *Criteria Pattern*). Implement as a small boolean-expression evaluator over numbered condition slots, not a flat AND-list.
- **Approval Type**:
  - **Auto Approve** — system approves immediately on match.
  - **Auto Reject** — system rejects immediately; `Description` becomes the shown reason.
  - **Configure Approval Flow** — ordered levels (**Level One Approver**, **Level Two Approver**, ...), each resolved via a pluggable strategy:
    - `Submits To` (default: submitter's manager per reporting hierarchy)
    - `Choose an Approver Manually` (specific named user)
    - `Project Head` (of the record's associated project)
    - `Project Heads of Purchase Request Items` (union across a PR's line-item projects — can be multiple approvers)
    - `Department Head of the Logged-in User` (submitter's own dept head)
    - `Department Head` (an admin-chosen dept, not necessarily submitter's)
    - `Choose a Designation-Hierarchy Based` (first user with a chosen title/designation found walking up the submitter's reporting chain)
    - `Choose a Lookup Field` (whichever user is referenced in a chosen custom lookup field on the record)
  - Each level can carry an optional **Note**, shown to that approver on the record's Details page (informational only, not a decision).
- **Prioritization**: when a record matches multiple Custom Approval rules simultaneously, admins explicitly reorder them (drag-to-reorder via **Change Priority**; Priority 1 = highest = applied first) — **strict first-match-wins**, not "all matching rules run."
- Full CRUD (edit/delete), and note: **Custom Approval cannot be configured for Payments Made** (E.1 matrix).

## E.3 Simple / Multi-Level / Hierarchical
- **Simple**: one static approver (or pool) per module + notification preferences (who's alerted on submit/approve/reject).
- **Multi-Level**: an explicit **ordered list of named approvers/roles** (a fixed sequence, not resolver-strategy-driven like Custom) who must each approve in order; also has its own approval + notification preferences.
- **Hierarchical**: routes purely by org reporting-line (submitter → manager → manager's manager...), no manual list, no criteria — internally implementable as a zero-criteria Custom rule using the `Submits To` resolver, if that simplifies your engine.
- **No Approval**: the module skips the approval step entirely.

## E.4 Common approval actions
`Submit for Approval → {Approve | Reject | Recall (submitter, pending-only) | Resubmit (after reject/recall)}`, plus PR-specific **Forward** (adds a hop without finalizing) and RFQ-Award-specific **Reject with mandatory reason**.

## E.5 Suggested data model
```
ApprovalConfigs(id, org_id, module, approval_type, config_json, is_active)
CustomApprovalRules(id, config_id, name, description, criteria_json, criteria_pattern, approval_type, levels_json, priority)
ApprovalInstances(id, record_type, record_id, config_id_applied, current_level, status, created_time)
ApprovalSteps(id, instance_id, level_index, resolved_approver_id, decision, decision_note, decided_time)
```
Functions: `resolveApprover(strategy, ctx)` (one branch per resolver above), `evaluateCriteria(pattern, conditions, record)` (boolean-expression evaluator), both invoked from a shared `submitForApproval(module, recordId)` Function used by every module.

---

# PART F — VENDOR PORTAL (full, from the dedicated docs)

## F.1 Purpose (documented use cases)
Vendors can: upload transaction documents for the buyer to verify/convert to bills; view RFQs, POs, invoices, and track payments received; generate a consolidated statement of accounts; add comments to collaborate on transactions.

## F.2 Sign Up
Fill in Business Details, Address Details, Bank Details, Other Details → submit. If the buyer later requests changes (**Request More Details**, Part C.2), the vendor gets a **Resubmit Requested Details** flow to update just the flagged fields and resend.

## F.3 Home
Five widgets: **Balance Summary**, **Last Payment Received**, **My Details** (the vendor's own profile as the buyer organization has it on file), **Shared Documents**, **Customer Details** (info about the buying org).

## F.4 Request for Quotes (vendor side)
Acknowledge Invitation → Confirm Participation → Create a Bid → Submit a Bid to Your Customer → Edit a Bid → Create Additional Bids (revised/versioned submissions) → View Bids (own history).

## F.5 Purchase Orders (vendor side)
View a Purchase Order → **Accept** or **Reject** it → **Upload an Invoice** against it (this is likely the vendor-side entry point feeding into the buyer's Scan-to-Bill/Uploaded-Documents flow, D.5) → Filter Purchase Orders.

## F.6 Invoices (vendor side)
View an Invoice (the vendor's view of a Bill the buyer raised against them), Filter Invoices.

## F.7 Payments Received
View a Payment Received (read-only history of what the buyer has paid them).

## F.8 Custom Modules (vendor side, if buyer has exposed one)
Create Records, Edit Records, Add Comments — these land as buyer-side-reviewable submissions per the internal Custom Modules docs (Part H): internal staff can then **Approve** or **Delete** vendor-submitted records.

## F.9 Statements
A consolidated statement of account (balance, payment history) — single page, no sub-actions documented beyond viewing it.

## F.10 Other Actions
Add a Comment (on any shared transaction, for buyer↔vendor collaboration), Download a Transaction, Print a Transaction, Change Password, Log Out.

## F.11 Catalyst implementation note
This is a fully separate authenticated surface. Use Catalyst Authentication with a distinct user pool (or a `user_type = vendor_portal` flag) and **hard row-level scoping**: every query a vendor-portal session makes must filter `vendor_id = session.vendor_id` at the Function/API layer — never rely on UI hiding alone, since this is the app's primary external-facing security boundary.

---

# PART G — BUDGETS

- Scope: category and/or department. Periods: **Monthly, Quarterly, Half-Yearly, Annual**.
- Amount entry — three modes: **Manual** per period; **Pre-fill from prior year's actuals**; **Autofill**, itself three sub-modes: fixed amount per period, adjustment amount per period (e.g. +$500/quarter), adjustment percentage per period (e.g. +5%/quarter).
- **Clone a Budget**.
- **Alerting** (from the documented worked example — a real feature, not flavor text): **warning alerts** as spend nears the limit (soft/notify-only); **blocking alerts** that **prevent Purchase Request submission** once it would exceed budget (hard stop) — implement as a server-side guard in the PR-submit Function, not a client-side disabled button.
- **Budget vs. Actuals report**: exportable, customizable, printable. Recommend rolling "actual" from **Bills** (money truly owed/committed) with a secondary "committed" figure from open POs for a fuller real-time picture, since the docs describe actual-vs-budget comparison without fully specifying the actuals source.
- Manage: edit, delete. Share: download, print.

---

# PART H — CUSTOM MODULES & BLUEPRINTS (the generic app-builder layer)

## H.1 Custom Modules
Schema-driven entities: **Fields** (typed), **Tables** (repeatable nested sub-grids within a record), **Sections** (form layout grouping), **Records**. Bulk import records and tables.
Manage: edit modules, **configure field access** (per-role read/write/hidden), edit/deactivate/reactivate/delete fields (prefer deactivate over hard-delete to preserve history), module-level role permissions, custom list views, export, delete module.
Record actions: edit, clone, download as PDF, print, send via email, sort, customize columns, refresh, delete.

## H.2 Blueprints (state-machine workflow engine)
- **States**: admin-defined stages.
- **SLA per state**: a time budget per state — pair with a Catalyst Cron scan for SLA breaches → escalation.
- **Transitions**, each with three hookable phases: **Before** (validation/gating — can block the move), **During** (field updates and other in-flight actions), **After** (notifications, webhooks, custom functions — side effects post-move).
- **Sequential transitions** (single path forward) vs. **Parallel transitions** (a state can fan out to multiple concurrent paths — implies a join condition before the record is considered to have left the state; the docs name the feature but don't detail the join semantics, so this is an inference, see Part J).
- **Publish** (author→live) vs. **Execute** (drive an actual record through the published blueprint).
- **Bulk update records** — mass-transition many records at once, running the same hooks per record rather than a special-cased bulk path.
- Other actions: edit/delete a blueprint, edit transitions/states, delete transitions, remove states.

## H.3 Custom Modules in Vendor Portal
Per-module show/hide toggle for the portal; per-field visibility/edit preferences specific to the portal (vendors may see/edit a narrower field set than internal users); vendor-submitted records land in a pending state that internal staff **Approve** or **Delete**.

## H.4 Preferences
Approvals config (see Part E — Custom Modules support No-Approval, Simple, Multi-Level, Custom, but **not Hierarchical**), general preferences (incl. vendor-portal visibility), validation rules, custom buttons, related lists, blueprint binding.

## H.5 Catalyst implementation
Schema-in-metadata pattern: `CustomModules` stores field definitions as JSON; `CustomModuleRecords` stores each record's data as a JSON blob validated server-side against the module's schema on write. The Blueprint engine operates only on `state` + `record_id`, staying field-agnostic except when a transition's "During" hook explicitly names a field to update.

---

# PART I — ANALYTICS, SETTINGS & CROSS-CUTTING PATTERNS

## I.1 Analytics
Four areas: **Payables Analytics** (bills, aging, amounts owed, vendor payment trends), **Purchases Analytics** (spend by item/vendor/category/department, PO trends), **Activity Analytics** (user/system activity, approval turnaround), **Manage Analytic Reports** (save/customize/export existing reports).

## I.2 Settings surface (full list, grouped)
- **Organization**: Profile (name/address/fiscal year/base currency/industry), Branding (logo/colors, applied to PDFs and portal).
- **Users & Roles**: Users (invite/manage/activate/deactivate), Roles (custom, role-based module permissions), Departments (org units feeding budgeting/reporting/approval routing).
- **Taxes & Compliance**: Taxes overview, Tax Rates, Tax Exemptions, Tax Authority, Tax Settings — region-specific (docs show USA variants; confirm which regions you need).
- **Setup & Configurations**: General, Currencies (multi-currency + exchange rates), Reminders (e.g. payment-due), Vendor Portal Preferences (incl. the Vendor Onboarding toggle, Part C.2).
- **Customization**: Transaction Number Series (per-doc-type Prefix+Next-Number), PDF Templates, Email Notifications, Reporting Tags, Web Tabs, Custom Fields, Validation Rules, Custom Buttons, Related Lists, Page Layouts.
- **Automation**: Workflow Rules, Email Alerts, In-app Notifications, Field Updates, Webhooks, Custom Functions (Deluge-equivalent scripting), Schedules (cron-like triggers).
- **Developer Data**: Incoming Webhooks, Connections (OAuth to outbound integrations), API Usage, Signals (pub/sub for custom functions), Data Management/Backups, Web Forms (public record-creating forms).
- **Module Settings**: Projects, Chart of Accounts, Customers — integration points, notably project-based cost tracking and accounting COA alignment.
- **Configure Approvals**: see Part E.

## I.3 Cross-cutting patterns (build once, reuse everywhere)
1. **CRUD + Clone + Bulk Import** (generic 3-step importer: upload → map columns → confirm, with a downloadable sample-file template).
2. **Status-driven list views**: tabs/filters per status, saved Custom Views, sort, rearrange columns, refresh, export (all vs. current filtered view).
3. **Attachments** (upload/preview/delete-with-confirm) + **Comments & Activity History** (chronological audit log — every status change, edit, comment).
4. **Share**: PDF generation (per configurable template), print, email-send to the counterparty for outward docs (PO/RFQ).
5. **Preferences block per module**: General/numbering, Custom Fields, Validation Rules, Custom Buttons & Links, Related Lists, Approvals (where applicable).
6. **Auto-numbering**: `NumberSeries(org_id, doc_type, prefix, next_number)` with atomic increment, shared across every document type.

Build these six as shared Catalyst services (`CrudService`, `ImportService`, `AttachmentService`, `ApprovalService`, `PdfService`, `NumberSeriesService`) invoked by every module's Function — this is the highest-leverage architectural decision for matching feature surface without re-implementing per module.

---

# PART J — DATA MODEL (Zoho Catalyst Data Store)

```sql
-- Foundation
Organizations(id, name, base_currency, fiscal_year_start, address, trial_ends_at)
Users(id, name, email, is_super_admin)
OrgMemberships(id, org_id, user_id, is_default)
Departments(id, org_id, name, head_user_id)
Roles(id, org_id, name)
Permissions(id, role_id, module, can_view, can_create, can_edit, can_delete, can_approve, can_export)

-- Master data
Items(id, org_id, name, sku, description, uom, unit_price, tax_id, item_type, category, default_account_id, active)
Vendors(id, org_id, display_name, company_name, primary_contact_name, email, currency, payment_term_id,
        portal_enabled, portal_language, billing_address, shipping_address, vendor_number, active, approval_status)
VendorContacts(id, vendor_id, name, email, phone, role)
VendorBankAccounts(id, vendor_id, bank_name, account_number, routing_info)
VendorOnboardingInvites(id, org_id, display_name, email, status /*invited|pending_review|approval_pending|active|rejected*/,
                         invited_by, submitted_data_json, reviewer_note)
PaymentTerms(id, org_id, name, number_of_days)

-- Purchase Requests
PurchaseRequests(id, org_id, requester_id, expected_date, delivery_address, reason, notes_to_approver,
                  reference_no, status, on_hold, created_time)
PurchaseRequestLines(id, pr_id, item_id, item_name_text, category, description, preferred_vendor_id,
                      quantity, estimated_rate, discount_pct, converted_qty)
PRAttachments(id, pr_id, file_ref)  -- max 5, 10MB each, enforce in Function

-- RFQ
RequestForQuotes(id, org_id, rfq_number, title, reference_no, description, currency, status,
                  bid_start_date, bid_end_date, awarding_date)
RFQLines(id, rfq_id, source_pr_line_id, item_id, description, expected_quantity, expected_price,
         allow_shipping_charges, allow_additional_charges, expected_date, notes)
RFQDocuments(id, rfq_id, file_ref, name, description)
RFQTeamMembers(id, rfq_id, user_id, phone, designation, role_in_rfq, is_point_of_contact)
RFQVendorInvites(id, rfq_id, vendor_id, invite_sent_time, expires_at, acknowledged_time, confirmed_time)
RFQBids(id, rfq_id, vendor_id, version, submitted_time, is_surrogate, status)
RFQBidLines(id, bid_id, rfq_line_id, unit_price, quantity, delivery_date, vendor_note,
            shipping_charge, additional_charge)
RFQShortlists(id, rfq_line_id, vendor_id, shortlisted_by, internal_note)
RFQAwards(id, rfq_id, status)  -- own Draft->AwaitingApproval->Approved->Published lifecycle
RFQAwardLines(id, award_id, rfq_line_id, vendor_id, awarded_qty, notes)
RFQAwardNotifications(id, award_id, vendor_id, notified_awarded, notified_not_awarded, notified_time)

-- Purchase Orders
PurchaseOrders(id, org_id, po_number, vendor_id, delivery_target_type /*org|customer*/, delivery_address,
                reference_no, po_date, delivery_date, payment_term_id, shipment_preference,
                approval_status, issuance_status, status, source_type /*manual|rfq|pr*/, source_id)
PurchaseOrderLines(id, po_id, item_id, account_id, tax_id, rate, quantity, amount,
                    received_qty, billed_qty, canceled_qty, source_pr_line_id, source_award_line_id)

-- Purchase Receives
PurchaseReceives(id, org_id, po_id, receive_number, status /*in_transit|received*/, received_date)
PurchaseReceiveLines(id, receive_id, po_line_id, received_qty, billed_qty)

-- Bills
Bills(id, org_id, vendor_id, po_id, bill_number, bill_date, due_date, status, is_recurring_child,
      recurring_template_id, source /*manual|scan*/, scanned_doc_ref)
BillLines(id, bill_id, po_line_id /*nullable*/, item_id, description, quantity, rate, amount, is_non_po_item)
ScannedBillDrafts(id, org_id, uploaded_file_ref, ocr_status /*processing|processed*/, extracted_json, matched_po_id)

PaymentsMade(id, org_id, vendor_id, payment_date, amount, method /*offline|check|credit*/, check_number)
PaymentAllocations(id, payment_id, bill_id, allocated_amount)
BatchPayments(id, org_id, batch_number, status)
BatchPaymentItems(id, batch_id, bill_id, vendor_id, amount)
RecurringBillTemplates(id, org_id, vendor_id, frequency, start_date, end_date, amount, next_run_date)
VendorCredits(id, org_id, vendor_id, credit_number, status, amount, remaining_balance)
VendorCreditRefunds(id, vendor_credit_id, refund_amount, refund_date)

-- Budgets
Budgets(id, org_id, category_or_department, period_type, fill_mode)
BudgetPeriods(id, budget_id, period_label, budgeted_amount)
BudgetAlertConfigs(id, budget_id, warning_threshold_pct, blocking_enabled)

-- Approvals (Part E)
ApprovalConfigs(id, org_id, module, approval_type, config_json, is_active)
CustomApprovalRules(id, config_id, name, description, criteria_json, criteria_pattern, approval_type,
                     levels_json, priority)
ApprovalInstances(id, record_type, record_id, config_id_applied, current_level, status, created_time)
ApprovalSteps(id, instance_id, level_index, resolved_approver_id, decision, decision_note, decided_time)

-- Custom Modules / Blueprints (Part H)
CustomModules(id, org_id, name, fields_json, tables_json, sections_json)
CustomModuleRecords(id, module_id, data_json, submitted_by_vendor_id /*nullable*/, vendor_approval_status)
Blueprints(id, org_id, module_id, name, status /*draft|published*/)
BlueprintStates(id, blueprint_id, name, sla_seconds)
BlueprintTransitions(id, blueprint_id, from_state_id, to_state_id, type /*sequential|parallel*/,
                      before_hooks_json, during_hooks_json, after_hooks_json)
BlueprintExecutionLog(id, record_id, transition_id, executed_by, executed_time, result)

-- Cross-cutting
NumberSeries(id, org_id, doc_type, prefix, next_number)
Attachments(id, org_id, record_type, record_id, file_ref, uploaded_by)
Comments(id, org_id, record_type, record_id, author_id, author_type /*internal|vendor*/, body, created_time)
AuditLog(id, org_id, record_type, record_id, action, actor_id, before_json, after_json, created_time)
PDFTemplates(id, org_id, doc_type, template_config)
EmailTemplates(id, org_id, event_type, subject, body)
WorkflowRules(id, org_id, module, trigger, condition_json, actions_json)
```

---

# PART K — CATALYST SERVICE ARCHITECTURE

| Concern | Catalyst Service | Notes |
|---|---|---|
| All tables above | **Data Store** | Scope every table by `org_id`; composite index `(org_id, status)` on every transactional table. |
| Business logic / transitions | **Functions** | One family per module (`pr.submit`, `po.convertToReceive`, `rfq.publish`, `rfq.award.publish`, ...) plus the shared services from Part I.3. |
| Approval routing & criteria eval | **Functions** | `resolveApprover(strategy, ctx)`, `evaluateCriteria(pattern, conditions, record)` — pure, unit-testable. |
| Blueprint engine | **Functions** | `executeTransition(recordId, transitionId)` running Before/During/After as an ordered list of typed actions. |
| Scheduled jobs | **Cron/Scheduler** | Nightly: `Open`→`Overdue` bill flips; Budget-actuals rollups; PO auto-close eligibility; Recurring-Bill child generation; RFQ bidding-deadline auto-notify; Blueprint SLA-breach scan. |
| Internal vs. Vendor auth | **Authentication** | Two scopes — internal org users (role/permission-gated), vendor-portal users (hard row-scoped to their own `vendor_id`, never cross-vendor). |
| Attachments & scans | **File Store** | Also the landing zone for Scan-to-Bill OCR input. |
| OCR / document extraction | **External API call from a Function** | Catalyst has no native OCR — call an external OCR provider from an `onFileUpload` trigger, write to `ScannedBillDrafts`. |
| Outbound email | **Catalyst Mail / SMTP** | Approval notifications, RFQ vendor invites, award-publish notifications, vendor-onboarding emails, overdue reminders. |
| API surface | **API Gateway + Functions** | REST per module; **re-check permissions server-side on every call.** |
| Caching | **Cache** | Permission lookups; number-series increment locking if Data Store atomicity isn't sufficient alone. |

---

# PART L — VALIDATION RULES TO ENFORCE SERVER-SIDE

1. PR line `converted_qty` ≤ `quantity`.
2. PO line `received_qty` ≤ `quantity` (unless an explicit over-receipt tolerance is enabled).
3. PO line `billed_qty` ≤ `received_qty` (3-way matching) or ≤ `quantity` directly (2-way) — org-level toggle.
4. RFQ Award's total `awarded_qty` across vendors for one line ≤ that line's requested quantity.
5. Custom Approval criteria pattern must reference only existing condition-slot numbers (validate on save).
6. Exactly one Custom Approval rule fires per record — first-match-by-priority, never "merge all matches."
7. Vendor Credit application to a Bill ≤ min(credit's `remaining_balance`, bill's outstanding amount).
8. Blocking budget alerts reject PR/PO submission at the Function layer, not just a disabled client button.
9. Recall is legal only while an approval instance is pending (not yet decided).
10. Vendor Portal sessions can only read/write rows where `vendor_id = session.vendor_id` — enforced in every Function, never only in the UI.
11. Vendor invite cancellation is blocked once the vendor has accepted it (status ≠ `invited`).
12. A PR attachment set is capped at 5 files / 10 MB each — enforce both count and per-file size server-side.
13. RFQ# is system-generated and immutable once created — never expose it as an editable field even in an edit form.
14. Custom Approval cannot be attached to the Payments Made module — reject at config-save time.
15. Custom Modules' approvals cannot use Hierarchical type — same enforcement as #14, per the module/type matrix.

---

# PART M — BUILD SEQUENCE

1. **Foundation + shared services**: Org/User/Role/Permission/Department, the six Part I.3 services (CRUD, Import, Attachment, Approval skeleton, PDF, NumberSeries), Super-Admin flag and org lifecycle (create/join/switch/default/delete-with-backup).
2. **Items + Vendors**, including Onboarding intake as a flow distinct from vendor-record Approvals, and Merge Vendors.
3. **PR → PO → Receive → Bill → Payment**, no approvals yet — nail the quantity-tracking invariants (Part L, rules 1–3) before anything downstream depends on them.
4. **Approval engine**: build Custom Approval's criteria+resolver engine first (everything else — Simple/Multi-Level/Hierarchical — is a strict subset), wire it to every module per the Part E.1 matrix (including the two hard exclusions: no Custom Approval on Payments Made, no Hierarchical on Custom Modules).
5. **Budgets** + submit-time blocking guard.
6. **RFQ module**: Basic Details/Items/T&C/Documents/Bidding Preferences/Team creation flow → Publish pipeline → vendor bidding → Compare/Shortlist/Award (with split-quantity-per-vendor) → Award's own nested approval → Publish Award with independent notify-awarded/notify-non-awarded flags → RFQ→PO conversion. Expect this to take as long as everything above it combined.
7. **Vendor Portal** (separate auth scope): Sign Up + Home first, then PO accept/reject/invoice-upload, then RFQ bidding, then Statements/Custom Modules.
8. **Batch Payments, Recurring Bills, Vendor Credits** — payables completeness.
9. **Scan-to-Bill / PO Matching** (OCR integration) — external-API-dependent, sequence as a stretch feature.
10. **Analytics** (Payables/Purchases/Activity) — mostly SQL rollups once Part J tables are populated.
11. **Custom Modules + Blueprints** — biggest standalone engineering lift; build once your Approval engine's criteria-evaluator and state-transition patterns are proven, since they share the same DNA.
12. **Settings/Customization/Automation** — Number Series is done in step 1; layer in PDF Templates, Workflow Rules, Webhooks, Custom Functions incrementally per module as needed rather than up front.

---

# PART N — HONEST COVERAGE NOTE

**What this spec is built from**: every module's Overview/table-of-contents page (~20 pages, giving the complete feature inventory and every documented status), plus deep-dived Create/Approve/Publish/Award/Convert logic pages for the highest-complexity flows — Purchase Requests, Request for Quotes (create, publish, award), Purchase Orders (create), Bills (PO matching), Vendors (add, onboarding), Custom Approval, Budgets, Custom Modules/Blueprints, Vendor Portal, and Manage Organization — roughly 30 source pages fetched and read in full.

**What was not individually fetched**: the more repetitive, lower-variance pages that follow the shared patterns already documented in Part I.3 — most `manage-*`, `other-actions-for-*`, `share-*`, and `preferences` sub-pages across Items/Vendors/Purchase Receives/Payments Made/Batch Payments/Recurring Bills/Vendor Credits, most of Settings → Customization/Automation/Developer Data/Taxes (10+ sub-pages each following an identical documented shape — one settings screen, a handful of fields, save), and the Analytics sub-pages (each is a single report view). These weren't skipped out of laziness so much as diminishing returns: their content is the same CRUD/list/export/preferences pattern restated per module, which Part I.3 already captures generically. If you need exact field-by-field copy for any specific one of these (e.g., the precise Tax Settings screen, or the Chart of Accounts mapping UI), flag it and it can be fetched and added.

**Interpreted/inferred logic** (not directly documented, filled from standard procurement-software practice — treat with more skepticism than the rest of this doc): the Blueprint parallel-transition join condition; the 2-way vs. 3-way PO/Receive/Bill matching toggle; whether Vendor Onboarding's approval step auto-satisfies the separate Vendor-record Approval gate or whether both apply; the "actual spend" source for Budget vs. Actuals (Bills vs. POs).

**Not covered at all**: visual/UI layout and screenshots, the product's actual REST API schema (endpoints/payloads), and pricing/plan-tier feature gating — none of these were in the documentation fetched.
