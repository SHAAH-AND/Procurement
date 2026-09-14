<title>ProcureFlow — Complete User Guide & Manual</title>

# ProcureFlow — Complete User Guide & Manual

**Version 2.0 · July 2026**

ProcureFlow is a multi-tenant procure-to-pay platform: purchase requests, approvals, RFQs, purchase orders, receiving, 3-way invoice matching, budgets, payments and vendor management — in one place, with a Developer Portal for the platform team that operates it.

This manual covers everything: the end-user application, administration and settings, integrations, and the Developer Portal.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Getting Started](#2-getting-started)
3. [The Workspace](#3-the-workspace)
4. [Core Concepts](#4-core-concepts)
5. [Master Data: Items, Vendors, Budgets](#5-master-data)
6. [The Procure-to-Pay Cycle](#6-the-procure-to-pay-cycle)
7. [Hotel & Multi-Property Management](#7-hotel--multi-property-management)
8. [Customization: Fields, Modules, Documents, Dashboards](#8-customization)
9. [Settings Reference](#9-settings-reference)
10. [Automation: Webhooks](#10-automation-webhooks)
11. [Zoho Books Integration](#11-zoho-books-integration)
12. [Developer Portal](#12-developer-portal)
13. [Status Reference](#13-status-reference)
14. [FAQ & Troubleshooting](#14-faq--troubleshooting)
15. [Glossary](#15-glossary)

---

## 1. Quick Start

The fastest path from zero to a paid bill:

1. **Sign in** and complete **onboarding** (organization name + industry). Wait for the platform team to verify your organization.
2. **Items** → add at least one catalog item (name, SKU, cost price).
3. **Vendors** → add the supplier you buy from.
4. **Settings → Users** → set each user's Role, Profile and Approval limit. **Settings → Departments** → add your departments.
5. **Budgets** → create a department budget (requests that would exceed it are blocked).
6. **My Requests → + New Purchase Request** → pick items, set quantities, submit.
7. An approver opens **Approvals** → approves the request.
8. Open the approved request → **Convert to PO** → the purchase order is sent to the supplier.
9. **Purchase Receives** → log the goods receipt against the PO.
10. **Bills** → record the supplier's bill. The 3-way match runs automatically.
11. **Payments Made** → pay the matched bill. Done — the full cycle is tracked, budgeted and audited.

---

## 2. Getting Started

### 2.1 Signing in

Open the application URL and click **Sign in / Sign up**. Authentication is handled by Zoho Catalyst — use your email to sign in or create an account. Your login is linked to your workspace by email address.

### 2.2 Onboarding a new organization

The first time you sign in without a workspace, the onboarding form appears:

- **Organization name** — shown across the app and on PDF documents.
- **Industry** — this matters. Choosing an industry applies an *industry pack* that pre-seeds departments, expense categories (CapEx/OpEx mappings), sample catalog items and terminology. Choosing **Hospitality & F&B** activates the full multi-property Hotel Management module (see [Section 7](#7-hotel--multi-property-management)).
- Currency, fiscal year and other basics — all changeable later in Settings.

### 2.3 Verification

New organizations start as **Pending Verification**. The platform team reviews and activates your workspace from the Developer Portal. Until then you'll see a waiting screen — this is enforced server-side, not just visually.

If your organization is ever **Suspended**, the app shows a block screen and every API call is refused until the platform team reactivates it.

### 2.4 Joining an existing organization

An admin adds you in **Settings → Users** with your email address. When you sign in with that email, you land directly in the workspace. If you belong to multiple organizations, the org switcher chip in the top bar lets you change context.

---

## 3. The Workspace

### 3.1 Navigation

The left sidebar mirrors Zoho Procurement:

| Item | What it is |
|---|---|
| **Home** | Hero greeting + My Home / Dashboard tabs |
| **My Requests** | Purchase requests you raised |
| **Approvals** | Requests waiting on *you* |
| **Items** | Purchasable catalog |
| **Vendors** | Supplier directory |
| **Procurement ▾** | Purchase Requests, RFQs & Bids, Purchase Orders, Purchase Receives |
| **Payables ▾** | Bills, Recurring Bills, Payments Made, Vendor Credits |
| **Budgets** | Department budgets |
| **Custom Modules** | Your own record types |
| **⚙ Settings** | Also reachable from the gear icon in the top bar |

The **＋ quick-create** button in the top bar jumps straight to a new Purchase Request, Vendor or Item.

### 3.2 Home

- **My Home tab** — date-range selector (This Year / Quarter / Month, fiscal-year aware), a **Spend Summary** (Total / PO / Non-PO spend with a monthly bar chart), an **Attention Required** panel, and activity cards (Orders Issued, Bills Processed, Items, Vendors).
- **Dashboard tab** — the configurable widget dashboard assigned to your role (see [Section 8.4](#84-dashboards)).

**Attention Required** surfaces, automatically:
- Purchase requests awaiting approval
- Bills with match issues (Discrepancy / Unmatched)
- Bills flagged for review (within tolerance) — can be toggled off in Settings → Reminders & Alerts
- Budgets past your utilization warning threshold (default 80%, configurable)
- Orders awaiting receipt

### 3.3 Working on mobile

The app is fully responsive: the sidebar becomes a slide-in drawer with a dimming scrim, tables become labeled cards, modals become bottom sheets, and full-page forms get a sticky Save/Cancel bar. Everything works on a phone.

### 3.4 Lists, search and forms

Every list page has instant search, a record count, and a refresh button. Records open Zoho-style: **forms are full pages**, not cramped popups, with labeled rows, tabs for sections and a fixed action footer.

---

## 4. Core Concepts

### 4.1 Roles vs. Profiles (who can do what)

ProcureFlow separates *hierarchy* from *permissions*, exactly like Zoho:

- **Role** = position in the reporting chain (CEO → Manager → Buyer). Approvals can escalate up this chain. Roles carry **no permissions**.
- **Profile** = a permission matrix: for each module (Requests, POs, Bills, Vendors…) the actions **view / create / edit / delete / approve**. A profile with **Full access** is an administrator.
- **Approval limit** = per-user amount cap. Requests above a user's limit escalate.

Assign both on each user in **Settings → Users**. Permissions are enforced server-side on every API call.

### 4.2 Budgets: three numbers

Every budget tracks:

| Number | Meaning |
|---|---|
| **Amount** | What was allocated |
| **Committed** | Reserved by submitted/approved requests not yet billed |
| **Spent** | Actual, invoiced spend |

Available = Amount − Committed − Spent. A purchase request that would exceed the available amount for its department **is blocked at submission** — this is a platform invariant, not a preference. Rejecting or recalling a request releases its reservation.

### 4.3 CapEx vs. OpEx

Every request line carries an expense type. Categories from your industry pack auto-suggest it; you can override per line. CapEx-approved lines automatically seed **Draft assets** in the Asset Register (multi-property orgs), and dashboards can split spend by CapEx/OpEx.

### 4.4 Multi-tenancy and data isolation

Every record belongs to your organization. The server derives your organization from your authenticated login — data from other tenants is unreachable, and all platform-level access happens only through the audited Developer Portal.

### 4.5 Platform invariants (always enforced)

These are enforced by the server and shown as locked switches in module settings:

- Requests exceeding the department budget are blocked.
- Receiving more than was ordered is blocked (cumulative, per line).
- Duplicate bill numbers are blocked per organization.
- Every bill is 3-way matched on save.
- Payments above a bill's balance are blocked.

---

## 5. Master Data

### 5.1 Items

**Items** is your purchasable catalog — request lines are picked from it.

- **New Item** (full-page form): Name*, **Goods/Service** type, Unit (pcs, kg, box…), SKU*, **Cost Price*** (shown with your currency prefix), Category (from your industry pack), Expense type (OpEx/CapEx — auto-suggested from category), Preferred Vendor, Description, plus any custom fields.
- Module defaults (default unit, default expense type) are set in **Settings → Module Settings → Items**.

### 5.2 Vendors

The supplier directory drives RFQs, POs and billing.

- **New Vendor** (full-page, tabbed form): Display name*, Email*, Phone, then tabs for **Other Details** (rating, status, vendor scope), **Address**, **Contact Persons** (name / designation / email / phone rows), **Bank Details** (bank / account / routing rows) and **Custom Fields**.
- **Manage** on a vendor row opens contacts + bank accounts for quick editing.
- **Merge vendors** — pick a winner and a loser; the loser's POs, contacts and bank accounts move to the winner, then the loser is deleted. Use it to clean up duplicates.
- Deleting a vendor is blocked while purchase orders reference it.
- Module preferences (allow duplicate names, phone mandatory) live in **Settings → Module Settings → Vendors**.
- On multi-property orgs, a vendor is either **Group** (serves every property) or **Property** (local to one) — see Section 7.

### 5.3 Budgets

- **New budget**: Department* (must match the department used on requests), Amount*, Fiscal year.
- **Periods** — split a budget into Monthly / Quarterly / Half-Yearly / Annual periods, each with its own amount.
- The list shows Amount, Spent, and a utilization bar that turns amber at 80% and red at 100%.

---

## 6. The Procure-to-Pay Cycle

### 6.1 Purchase Requests (PR)

**Create** — My Requests → + New Purchase Request (or the ＋ quick-create):

- Header: Department, Expected date, Reference #, Delivery address, Reason, Notes — which of these are mandatory is configurable in **Settings → Module Settings → Purchase Requests**.
- **Property** picker (multi-property orgs only) — group-level or a specific property you're assigned to.
- **Lines**: pick an item (price auto-fills), quantity, unit price, **Discount %**, **Tax %** (pre-filled from your default tax — see Settings → Taxes), expense type. Line subtotal = (price × qty − discount) + tax.
- Custom fields appear automatically if defined for this module.

**Submit** — on submission:
1. The department budget is checked; the request is **blocked** if it would exceed the available amount (Amount − Committed − Spent, matched on department + property).
2. If the total is at or below the org's **auto-approve limit**, it's approved instantly.
3. Otherwise it goes **Pending Approval**, routed to your approver; the budget reservation moves into **Committed**.

**Lifecycle actions:**

| Action | Who | Effect |
|---|---|---|
| **Approve** | The current approver | Approved (or routed to level 2 in Multi-Level mode) |
| **Reject** | The current approver | Rejected — a reason is mandatory; budget reservation released |
| **Recall** | The requester | Back to Draft; reservation released |
| **Resubmit** | The requester | A rejected/drafted request re-enters approval |

Every action is recorded on the request's **approval timeline** and in the audit log. Approved CapEx lines seed Draft assets automatically.

### 6.2 Approvals

The **Approvals** page lists requests waiting on you. Open one to see lines, totals, history and attachments, then Approve or Reject (with reason).

**Approval flow modes** (Settings → Approvals):
- **Simple** — one approval from the requester's approver.
- **Multi-Level** — after the first approval, large requests route a second approval to the user with the highest approval limit.

The **auto-approve limit** (same page) lets small purchases skip approval entirely; set it to 0 to require approval on everything.

### 6.3 RFQs & Bids

For competitive purchases, convert an approved request to an **RFQ** instead of a PO:

- **Publish** the RFQ with a bid deadline (default bid window is configurable in module settings).
- Record **bids** from vendors as they come in.
- Award the winning bid to generate the purchase order from it.

### 6.4 Purchase Orders (PO)

- **Convert to PO** on an approved request copies its lines, applies your default terms note (configurable), and sets status **Sent to supplier**.
- Print or download the PO as a **PDF** — the document uses your PDF template and organization logo (see Section 8.3).
- POs move to **Fulfilled** when received, or can be **Cancelled**.

### 6.5 Purchase Receives (GRN)

Log what physically arrived against a PO: per line, **Quantity received / accepted / rejected**.

> **Invariant:** cumulative received quantity can never exceed the ordered quantity — the platform blocks over-receipt.

Receiving marks the PO **Fulfilled**.

### 6.6 Bills (Invoices) and 3-Way Matching

Record the supplier's bill against a PO: Bill number*, PO*, bill date, Amount*.

The **3-way match** runs automatically on save, comparing **Bill ↔ PO ↔ Receipt**:

| Result | Meaning |
|---|---|
| **Matched** | Quantities and amounts agree (≤ $1 rounding) |
| **Review** | Amount differs but is **within your tolerance %** (default 2%, configurable per Settings → Module Settings → Bills). Flagged, not blocked — typical for breakage/short-supply. |
| **Discrepancy** | Quantity shortfall, or amount beyond tolerance |
| **Unmatched** | Match couldn't complete (e.g. no receipt yet) — re-run after receiving |

Duplicate bill numbers are rejected. A manual **Rematch** action is available on any bill.

### 6.7 Payments

Record payments against a bill: amount, mode, reference # (auto-generated if blank).

> **Invariant:** total payments can never exceed the bill amount — overpayment is blocked.

Full payment marks the bill **Paid**.

### 6.8 Recurring Bills

Repeating charges — rent, subscriptions, service contracts. Set the vendor, amount, frequency (Weekly → Annually) and start/end dates.

### 6.9 Vendor Credits

Credit notes that reduce what you owe a vendor — returns, overcharges, goodwill. Track credit amount, remaining balance and reason.

### 6.10 Attachments

Requests, orders, receipts and bills accept file attachments (up to 5 files per record, 10 MB each). Files are stored organization-wise in secure cloud object storage.

---

## 7. Hotel & Multi-Property Management

Activated automatically for **Hospitality** organizations (and any industry pack marked multi-property).

### 7.1 Properties

**Settings → Properties** — add each hotel/site with location, cluster/region, currency and fiscal-year start. Bulk-import via CSV (`name, location, cluster, currency, fiscal_year_start`).

### 7.2 Property access for users

**Settings → Users → Properties** action:
- Check the properties a user may access → they become a **property-level user** who only sees records for those properties.
- Leave all unchecked → **group-level user** who sees everything.

Scoping is enforced server-side on requests, assets and suppliers.

### 7.3 Property-aware purchasing

- Purchase requests carry a **Property**; budgets are matched on department **and** property.
- Vendors are **Group** (linens, F&B distributors — visible to all properties) or **Property** (a single property's local supplier).

### 7.4 Asset Register

**Settings → Asset Register** — every approved **CapEx** request line automatically creates a **Draft** asset (name, source request, value, property). Finance completes the acquisition date and value, then marks it **Active**; disposed assets are marked **Disposed**.

---

## 8. Customization

### 8.1 Custom Fields

Add fields to **Purchase Requests, Vendors, and Items** — text, number, date, dropdown, or checkbox. They appear on the forms instantly and print with the record. Create them:
- per module, inside **Settings → Module Settings → \<module\> → Fields**, or
- all in one place at **Settings → Customization → Custom Fields**.

Deleting a field keeps existing records' stored values.

### 8.2 Custom Modules

Define entirely new record types (asset registers, contracts, anything): name the module, list its fields (`name:type` — text, number, date, boolean), and it becomes a data-entry module with validation.

### 8.3 PDF Templates

**Settings → Customization → PDF Templates** — a Zoho-Books-style document designer with **live preview** for Purchase Orders, Requisitions and Invoices:

- Page: paper size (A4/Letter/Legal/A5), orientation, margins, font
- Branding: accent color, text color, table header background, document title, **company logo**
- Columns: toggle each line-item column
- Blocks: logo, company address, doc details, bill-to, totals, notes, terms, signature lines, bank details
- Set one template as **Default** per document type

Printing uses the browser's print-to-PDF — no plugins.

### 8.4 Dashboards

**Settings → Customization → Dashboards** — build widget dashboards (stat tiles: committed/pending/CapEx/OpEx spend, counts; lists: recent requests/orders; payables aging chart) and assign each to a **Role**. Members see their role's dashboard on Home; everyone else sees the Default.

---

## 9. Settings Reference

Open with the **⚙ gear** in the top bar. The landing page is the **All Settings hub** — a searchable card grid (press **/** to jump to search). Every page below is also reachable from the left rail on detail pages.

### Organization

| Page | What you manage |
|---|---|
| **Profile** | Organization name, **logo upload** (shown in the sidebar and on PDFs), industry, phone, address, country, time zone, fiscal year start |
| **Properties** | (Multi-property orgs) Property list + CSV import |
| **Departments** | The department list used on requests and budgets |

### Users & Roles

| Page | What you manage |
|---|---|
| **Users** | Add/edit users, assign Role + Profile, set approval limits, activate/deactivate, property access |
| **Roles** | The reporting hierarchy (visualized as an indented tree) |
| **Profiles** | Permission matrices — module × view/create/edit/delete/approve, or Full access |

### Taxes & Compliance

| Page | What you manage |
|---|---|
| **Taxes** | Named tax rates (VAT, GST…). The **default** tax pre-fills the Tax % on every new request line. |

### Setup & Configurations

| Page | What you manage |
|---|---|
| **Currencies** | Base currency (all app amounts) + additional currencies with reference exchange rates |
| **Payment Terms** | Terms (Net 30, Net 45…) offered when converting to POs |
| **Approvals** | Approval flow (Simple / Multi-Level) + auto-approve limit |
| **Reminders & Alerts** | Budget utilization warning % and Review-bill alerts for Home → Attention Required |
| **Asset Register** | (Multi-property orgs) CapEx asset records |

### Customization

PDF Templates · Custom Fields · Dashboards — see [Section 8](#8-customization).

### Automation

| Page | What you manage |
|---|---|
| **Workflow Webhooks** | Push business events to your own endpoints — see [Section 10](#10-automation-webhooks) |
| **Audit Log** | The last 200 recorded actions: who did what, when, to which record |

### Integrations

| Page | What you manage |
|---|---|
| **Zoho Books** | Connect and sync vendors, items and bills — see [Section 11](#11-zoho-books-integration) |

### Module Settings

Each module has its own settings page (Preferences + Fields tabs): Vendors, Items, Budgets, Purchase Requests, RFQs, Purchase Orders, Purchase Receives, Bills, Recurring Bills, Payments, Vendor Credits. Green **"Platform enforced"** switches are invariants you can see but not disable.

---

## 10. Automation: Webhooks

**Settings → Automation → Workflow Webhooks.** When a business event fires, ProcureFlow POSTs a JSON payload to your URL — connect Zoho Flow, an ERP, Slack (via a relay), or anything with an HTTPS endpoint.

### Events

| Event | Fires when |
|---|---|
| `pr.created` | A purchase request is submitted |
| `pr.approved` | A request is (finally) approved |
| `pr.rejected` | A request is rejected |
| `po.created` | A purchase order is created |
| `grn.created` | A goods receipt is logged |
| `invoice.created` | A bill is recorded |
| `payment.created` | A payment is made |

Selecting **no events** on a webhook means *all events*.

### Payload

```json
{
  "event": "pr.approved",
  "orgId": "36929000000221898",
  "at": "2026-07-17T09:30:00.000Z",
  "actor": "buyer@yourcompany.com",
  "data": { "id": "3692900000024xxxx", "number": "PR-00042" }
}
```

If you set a **secret**, it's sent as the `X-Webhook-Secret` header — verify it on your side.

Each webhook row has a **Test** button that sends a `test.ping` payload server-side and reports the response code and latency. Deliveries are fire-and-forget with a 6-second timeout; a failing endpoint never blocks the app.

---

## 11. Zoho Books Integration

**Settings → Integrations → Zoho Books.** Pushes your procurement records into Zoho Books so accounting never re-keys data:

| ProcureFlow | → Zoho Books |
|---|---|
| Vendors | Vendor contacts |
| Items | Items (price, SKU, goods/service) |
| Bills | Bills (against the synced vendor, dated, using your first expense account) |

### Setup (one time)

1. Open **api-console.zoho.com** → *Add Client* → **Self Client**.
2. Copy the **Client ID** and **Client Secret** into ProcureFlow.
3. In the Self Client, *Generate Code* with scope `ZohoBooks.fullaccess.all`, exchange it for a **Refresh Token**, paste it in.
4. Pick your **data center** (zoho.com / .in / .eu / .com.au / .jp / .sa / zohocloud.ca).
5. Enter your Books **Organization ID** (Books → Settings → Organization Profile).
6. **Test connection** — verifies the credentials and lists your Books organizations.
7. Toggle what to sync, then **Sync now**.

### How syncing behaves

- Already-synced records are **skipped** (ID mappings are remembered), so re-running is safe.
- The **Last sync** card shows created / already-synced / failed per record type, with per-record error messages (e.g. a bill whose vendor wasn't synced yet — run a vendor sync first).
- Secrets are stored server-side only; the form shows a mask after saving.

---

## 12. Developer Portal

`developer.html` — the platform team's console. Access is gated by the **Developers registry**: only registered, active developer accounts get in (verified server-side). The **owner** can invite/manage other developers and optionally scope them to specific organizations.

### 12.1 Organizations

- Full client list with search, CSV export and print.
- **Verify** newly onboarded organizations (Pending Verification → Active).
- **Suspend / reactivate** — suspension blocks the entire workspace server-side.
- **Detail** — org profile, users and record counts.
- Stats auto-refresh every 60 seconds (Live badge).

### 12.2 Per-organization tools

| Tool | What it does |
|---|---|
| **Cost** | Per-resource usage breakdown: rows per table, real file-storage bytes, seats, estimated calls — with CSV export |
| **Backup** | Downloads a complete JSON export of every table for that organization |
| **Delete** | Owner-only, cascade-deletes all org data + files. Requires typing the organization's exact name to confirm |

### 12.3 Consumption & Billing

The **Consumption** tab is the billing console:

- **Month selector** — pick the billing period.
- **Metered API calls** — every request is counted per organization per month (real measurement, not an estimate). Metering starts from the day it was deployed; earlier months show the legacy estimate only.
- **Rate card** (🧾 button) — *your* client prices: currency, per seat/month, per GB storage/month, per 1,000 API calls, per 10,000 data rows/month. Owner-editable; other developers see it read-only.
- **Billable** column = measured usage × your rate card → **safe to invoice clients**.
- **Est. cost** column = indicative infrastructure estimate → **internal only, never invoice it** (the cloud platform bills at project level; per-org infra cost is an allocation model).
- **Export CSV** produces `billing-<month>.csv` with the rate card header and a TOTAL row — attach it to the client's invoice as the usage statement.

### 12.4 Developer team

The owner can invite developers, set their access (all organizations or an assigned list), and deactivate them. The owner account cannot be deleted.

---

## 13. Status Reference

| Record | Statuses |
|---|---|
| Purchase Request | Draft → Pending Approval → Approved / Rejected → Converted to PO / Converted to RFQ |
| Purchase Order | Sent to supplier → Fulfilled / Cancelled |
| Bill | Unmatched → Matched / Review / Discrepancy → Paid |
| Budget / Vendor / User | Active / Inactive |
| RFQ | Open / Published / Closed |
| Asset | Draft → Active → Disposed |
| Organization | Pending Verification → Active / Suspended |

---

## 14. FAQ & Troubleshooting

**Q: I selected Hospitality at onboarding but see no property features.**
Reload the app — property management activates automatically for hospitality organizations. If it still doesn't appear, an admin should confirm the industry in Settings → Profile.

**Q: My request was blocked with a budget error.**
The department (and property, if applicable) budget's *available* amount (Amount − Committed − Spent) is smaller than your request. Ask the budget owner to raise the amount, or reduce the request.

**Q: A bill came back "Review" — is something wrong?**
No. The amount differs from the PO but within your configured tolerance (default 2%). It's flagged for a human look — typical for delivery breakage or freight rounding — and can still be paid. Change the tolerance in Settings → Module Settings → Bills.

**Q: A bill came back "Discrepancy".**
Either goods were accepted short of what was ordered, or the amount is beyond tolerance. Check the match message on the bill, resolve (receive the remainder, or agree a credit with the vendor), then **Rematch**.

**Q: I can't delete a vendor.**
Vendors referenced by purchase orders can't be deleted. Use **Merge vendors** to fold duplicates into one, or mark the vendor Inactive.

**Q: A user can't see a module / gets "Access denied".**
Their **Profile** doesn't grant that module+action. Edit the profile in Settings → Profiles (or assign a different one on the user).

**Q: I updated the logo/settings but don't see the change.**
Hard-refresh the browser (Ctrl+Shift+R). Organization settings load at sign-in.

**Q: Webhook test says the endpoint is unreachable.**
The URL must be public HTTPS/HTTP reachable from the cloud — localhost URLs won't work. Try a `https://webhook.site` URL to confirm the feature, then point at your real endpoint.

**Q: Books sync says "Vendor not synced yet" on bills.**
Bills post against the synced vendor. Enable vendor sync and run it first; then re-run with bills enabled.

**Q: Why do metered API calls show zero for older months?**
Real metering counts from the day it went live. Older months only have the legacy estimate ("est. life" footnote).

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **PR** | Purchase Request / Requisition — the internal "I need to buy X" |
| **RFQ** | Request for Quote — invite vendors to bid |
| **PO** | Purchase Order — the commitment sent to a supplier |
| **GRN** | Goods Receipt Note — what physically arrived |
| **3-way match** | Bill ↔ PO ↔ Receipt comparison before payment |
| **Committed** | Budget reserved by approved-but-not-yet-billed purchases |
| **CapEx / OpEx** | Capital vs. operational expenditure |
| **Role** | Position in the reporting hierarchy (no permissions) |
| **Profile** | Permission matrix (what a user can do) |
| **Group-level user** | Multi-property user who sees every property |
| **Industry pack** | Onboarding preset: departments, categories, items, terminology |
| **Rate card** | The platform owner's client-facing prices used for Billable amounts |
| **Metered calls** | Actually-counted API requests per organization per month |

---

*ProcureFlow v2.0 — built on Zoho Catalyst. For platform support, contact your administrator or the developer team.*

---

## 16. September 2026 Build Notes — What's Actually Live (`nadhir-n_frontend_upgrade`)

> The sections above describe the target platform. This appendix records what
> is implemented and E2E-verified in the local NestJS + React build.

### Live and tested end-to-end (demo tenant, 2026-09-11)
- **PRs**: draft → awaiting → approved/rejected → processed, recall/edit/
  re-submit/cancel; requestor-only guards; approve-after-reject. Pages:
  My Requests, Purchase Requests, Approvals inbox.
- **POs**: from approved PR (line picker), draft → pending → approved →
  issued, per-line received/billed quantities, close/cancel.
- **Receives**: GRN from PO with remaining-qty guard, complete accrues
  receipts; PO status recomputes per line.
- **Bills**: from PO / completed receive (one bill per receive) / manual;
  submit → approve accrues billed qty; void reverses. **3-way match**
  endpoint (±2% price, receipt-required on receive-linked bills).
- **Payments**: partial/full, excess auto-creates vendor credit (same-vendor
  apply), multi-bill tender, batches (draft → processed / partial / failed
  with retry), payment history.
- **RFQ**: from PR/manual, publish with per-vendor magic links, public
  no-login vendor portal (quote, resubmit-replaces), compare matrix with
  best-price flags, partial awards with quantity locks, award → one PO per
  vendor at bid prices.
- **Recurring**: weekly/monthly/quarterly/yearly profiles, end dates,
  generate-due child bills, disable.
- **Dashboard home**: live KPIs, spend (total/PO/non-PO + 12-month bars),
  attention queue, payables aging, budget rows, top-10 intelligence,
  payment-mode split, compliance tiles; My Home setup view one click away.
- **Demo accounts**: `demo@procureflow.io` / `Demo123!` (one-click demo
  button needs no password); `admin@acme.com` / `password123`.

### Partially live
- **Vendors/Items**: manual CRUD + validation only (no portal invite,
  clone, import, bank/tax fields yet). **Budgets/Analytics**: routes +
  stubs. No Settings pages, roles UI, notifications, attachments,
  OCR, webhooks, Books sync, or Developer Portal — guide sections
  7–12 remain target-state documentation.
