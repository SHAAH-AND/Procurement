# Zoho Procurement Research and Product Blueprint

**Prepared:** 2026-09-15  
**Purpose:** Reference material for designing an in-house procurement SaaS application.

## Source note

This document summarizes Zoho Procurement's publicly available product pages and help documentation. It describes observed product concepts and useful design ideas; it is not a copy of Zoho's proprietary implementation.

Primary sources:

- [Zoho Procurement](https://www.zoho.com/procurement/)
- [Procurement Management](https://www.zoho.com/procurement/procurement-management/)
- [Strategic Sourcing](https://www.zoho.com/procurement/strategic-sourcing/)
- [Supplier Management](https://www.zoho.com/procurement/supplier-management/)
- [AP Automation](https://www.zoho.com/procurement/ap-automation/)
- [Pricing](https://www.zoho.com/procurement/pricing/)
- [Zoho Procurement Help](https://www.zoho.com/procurement/help/)
- [Dashboard documentation](https://www.zoho.com/procurement/help/home/dashboard/)

## 1. Product overview

Zoho Procurement is a cloud-based, end-to-end source-to-pay platform. It connects employee buying, approvals, sourcing, suppliers, purchase orders, receiving, invoicing, payments, budgets, and analytics.

The core product chain is:

```text
Employee
  -> Purchase Request
  -> Budget and Policy Check
  -> Approval Workflow
  -> Catalog Purchase or Strategic Sourcing
  -> Supplier Selection
  -> Purchase Order
  -> Goods or Service Receipt
  -> Supplier Invoice
  -> Three-Way Matching
  -> Invoice Approval
  -> Payment
  -> Analytics and Audit Trail
```

The main product principle is that users should not re-enter information as a transaction moves from request to order, receipt, invoice, and payment.

## 2. Main product areas

| Area | Purpose |
|---|---|
| Purchase Requests | Employees request goods or services through catalog-based or ad-hoc forms. |
| Approval Workflows | Requests and financial transactions follow hierarchical, parallel, multi-level, or custom approvals. |
| Catalogs | Central repository of approved goods and services with descriptions, images, pricing, suppliers, and contract links. |
| Strategic Sourcing | RFQ, RFI, and RFP events; bidding, comparison, evaluation, and supplier shortlisting. |
| Supplier Management | Supplier onboarding, portal access, documents, contacts, bank details, performance, transactions, and payments. |
| Contract Management | Contract storage, key details, renewals, utilization, and contract spend. |
| Purchase Orders | POs generated from approved requests or sourcing events; recurring and blanket POs are supported. |
| Receiving | Partial or complete goods receipts, service receipts, and delivery verification. |
| Invoice and AP Automation | Supplier invoice submission, AI extraction, PO/receipt matching, approval, and payment processing. |
| Budgets | Department budgets, consumption tracking, and spend controls. |
| Analytics | Spend, supplier, item, account, payment, budget, cycle-time, and compliance reporting. |
| Integrations | Zoho ecosystem and third-party connections using APIs, OAuth, workflows, and synchronization. |

## 3. Suggested authenticated application pages

### Dashboard

Recommended dashboard cards and widgets:

- Total procurement spend
- PO spend versus non-PO spend
- Purchase requests awaiting approval
- Purchase orders issued and open
- Pending goods or service receipts
- Unpaid and overdue invoices
- Current and overdue payables
- Budget consumption
- Top suppliers
- Top purchased items
- Top accounts or categories
- Average order-to-receipt time
- PO-to-invoice compliance
- Most requested items
- Payment modes
- Attention-required transactions

Zoho's dashboard documentation describes date-range filtering, spend summary, payables aging, budget consumption, top spend, operational metrics, and payment breakdowns. Dashboard widgets should be clickable and lead to the records behind each metric.

### Buying

- Product and service catalog
- Create purchase request
- My requests
- Requests awaiting approval
- Request history
- Ad-hoc purchase form
- Shopping-cart-style catalog experience
- PunchOut marketplace integration

### Procurement operations

- Purchase requests
- Approval inbox
- RFQs, RFIs, and RFPs
- Supplier bid comparison
- Purchase orders
- Blanket purchase orders
- Goods receipts
- Service receipts
- PO amendments and cancellations

### Suppliers

- Supplier directory
- Add supplier
- Supplier registration and approval
- Supplier documents
- Contacts and bank details
- Tax and compliance information
- Supplier risk and compliance
- Supplier performance scorecards
- Supplier portal access

### Contracts

- Contract list and details
- Contract documents
- Contract line items
- Contract spend
- Expiry and renewal reminders
- Contract utilization
- Supplier-linked contracts

### Accounts payable

- Invoice inbox
- Invoice extraction
- Invoice review
- Invoice approvals
- PO and receipt matching
- Exception queue
- Bills
- Payments
- Payment status

### Finance and controls

- Budgets
- Departments
- Cost centers
- Accounts
- Tax configuration
- Payment terms
- Currencies
- Spend limits
- Procurement policies

### Reporting

- Spend by supplier
- Spend by department
- Spend by category
- Spend by account
- Spend by contract
- Spend by employee
- PO compliance
- Invoice compliance
- Supplier performance
- Savings achieved
- Budget utilization
- Procurement cycle time
- Payment aging

### Administration

- Organization profile
- Users, roles, and permissions
- Departments
- Approval workflows
- Custom fields and modules
- Email templates
- PDF templates
- Numbering sequences
- Notifications
- Integrations
- API connections
- Audit logs
- Import and export

## 4. Core data model

```text
Organization
  ├── Users
  ├── Departments
  ├── Roles and Permissions
  ├── Budgets
  ├── Cost Centers
  ├── Catalog Items
  ├── Suppliers
  ├── Contracts
  ├── Purchase Requests
  ├── RFx Events
  ├── Purchase Orders
  ├── Receipts
  ├── Invoices
  ├── Payments
  └── Audit Events

Department
  ├── Users
  ├── Budgets
  └── Purchase Requests

Purchase Request
  ├── Requester
  ├── Department
  ├── Cost Center
  ├── Budget
  ├── Line Items
  ├── Approval History
  ├── Sourcing Event
  └── Purchase Order

Supplier
  ├── Contacts
  ├── Compliance Documents
  ├── Bank Details
  ├── Contracts
  ├── Catalog Items
  ├── Purchase Orders
  ├── Receipts
  ├── Invoices
  └── Payments

Purchase Order
  ├── Supplier
  ├── Purchase Request
  ├── Contract
  ├── Line Items
  ├── Receipts
  ├── Invoices
  └── Payment Status
```

Recommended lifecycle:

```text
Draft -> Submitted -> Pending Approval -> Approved -> Ordered
-> Partially Received -> Fully Received -> Invoiced -> Paid
```

## 5. User roles

| Role | Typical permissions |
|---|---|
| Requester | Create and track purchase requests. |
| Approver | Approve or reject requests, POs, invoices, or suppliers. |
| Procurement Officer | Manage sourcing, suppliers, catalog, POs, and operations. |
| Procurement Manager | Manage procurement policy, approvals, suppliers, and spend. |
| Finance User | Manage invoices, bills, budgets, payments, and accounting integration. |
| Receiving User | Record goods and service receipts. |
| Supplier User | Use the supplier portal, respond to RFQs, view POs, submit invoices, and track payments. |
| Administrator | Configure organization, users, roles, workflows, integrations, and settings. |
| Auditor | Read-only access to records, documents, logs, and reports. |

Support both role permissions and record-level permissions, including department, location, category, supplier, and amount-based restrictions.

## 6. Approval workflow design

Approval rules should be configurable without developer changes. Example:

```text
If department = Engineering
and amount > 5,000
and category = Software
then require:
  1. Department manager approval
  2. Procurement approval
  3. Finance approval
```

Useful capabilities:

- Sequential approval
- Parallel approval
- Any-one or all-approvers approval
- Amount-based routing
- Department, category, and supplier routing
- Budget checks
- Automatic escalation
- Delegated approval
- Mandatory rejection reason
- Request revision and re-submission
- Approval comments
- Email and in-app notifications
- Complete approval history

## 7. Supplier portal

Supplier users should be able to:

- Complete onboarding
- Submit company, tax, banking, and compliance information
- Upload documents
- Respond to RFQs
- View awarded sourcing events
- View and acknowledge purchase orders
- Submit invoices and supporting files
- Track invoice and payment status
- Comment on transactions
- Communicate with procurement users
- Receive renewal and expiry notifications

The supplier portal should have separate authentication and restricted supplier-specific data access.

## 8. Three-way matching and exception handling

```text
Purchase Order
      +
Goods Receipt
      +
Supplier Invoice
      =
Payment Eligibility
```

Example:

| Check | Expected | Actual | Result |
|---|---:|---:|---|
| Quantity | 100 | 100 | Match |
| Unit price | $20 | $20 | Match |
| PO exists | Yes | Yes | Match |
| Receipt exists | Yes | Yes | Match |
| Payment eligibility | - | - | Eligible |

Create an exception instead of silently approving mismatches:

- Quantity mismatch
- Price mismatch
- Missing PO
- Missing receipt
- Duplicate invoice
- Tax mismatch
- Invalid or unapproved supplier
- Budget exceeded
- Expired contract

## 9. Integration architecture

```text
Procurement Platform
  ├── Accounting or ERP
  ├── Inventory and Warehouse
  ├── Expense Management
  ├── Payment Provider
  ├── Email and SMS
  ├── Identity Provider and SSO
  ├── Supplier Marketplace
  ├── Tax Service
  ├── OCR and AI Invoice Extraction
  └── Reporting Data Warehouse
```

Recommended integration patterns:

- REST APIs
- Webhooks
- Scheduled synchronization
- OAuth connections
- CSV import and export
- SAML or OAuth SSO
- Idempotent transaction synchronization
- Integration error logs
- Retry queues
- Field mapping
- Sync history and status

Example synchronization:

```text
Approved PO -> Accounting system
Goods receipt -> Inventory system
Supplier invoice -> Accounts payable
Payment confirmation -> Procurement platform
Employee expense -> Expense system
Procurement data -> Analytics warehouse
```

Integration errors should be visible to administrators and should never be silently discarded.

## 10. Recommended implementation phases

### Phase 1: MVP

- Organizations and departments
- Users, roles, and permissions
- Product and service catalog
- Purchase requests
- Approval workflows
- Purchase orders
- Supplier directory
- Goods receipts
- Invoice recording
- Basic PO and invoice matching
- Budget tracking
- Dashboard
- Audit trail
- Email notifications

### Phase 2: Operational maturity

- Supplier self-service portal
- RFQ and bid comparison
- Contract management
- Blanket POs
- Visual workflow builder
- OCR invoice extraction
- Payment status tracking
- Accounting integration
- Advanced analytics
- Mobile-friendly approvals

### Phase 3: Advanced procurement

- PunchOut catalog integration
- Supplier risk scoring
- AI buying assistant
- Spend classification
- Automated supplier recommendations
- Forecasting
- Savings tracking
- Multi-entity and multi-currency support
- Advanced ERP integrations

## 11. Product ideas to adopt

1. **Catalog-first buying:** Let employees choose approved items instead of creating uncontrolled free-text requests.
2. **One connected transaction chain:** Keep request, PO, receipt, invoice, and payment linked.
3. **Configurable approvals:** Allow procurement rules to change without code deployments.
4. **Supplier self-service:** Let suppliers maintain their own profile and invoice information.
5. **Exception-based processing:** Automate matching transactions and route only exceptions to people.
6. **Budget visibility at request time:** Show available budget before a request is submitted.
7. **Auditability:** Record every change, approval, rejection, comment, and document.
8. **Drill-down analytics:** Make every metric link to its underlying records.
9. **Role-specific experiences:** Design different workflows for requesters, approvers, procurement, finance, and suppliers.
10. **Reusable master data:** Share suppliers, items, contracts, departments, accounts, tax rules, and budgets across modules.

## 12. Suggested initial navigation

```text
Dashboard
Buying
  - Catalog
  - My Requests
  - New Request
Approvals
Procurement
  - Purchase Requests
  - RFx Events
  - Purchase Orders
  - Receipts
Suppliers
Contracts
Payables
  - Invoice Inbox
  - Bills
  - Payments
Budgets
Analytics
Settings
  - Organization
  - Users and Roles
  - Workflows
  - Custom Fields
  - Integrations
  - Notifications
  - Audit Logs
```

## 13. Design conclusion

The most important architectural decision is to build around a **procurement graph**, not a collection of unrelated CRUD pages. A purchase request should be able to create approvals, sourcing activity, a purchase order, receiving records, an invoice, a payment record, and analytics entries while preserving the relationships between them.

That connected model is what gives a procurement SaaS product visibility, automation, policy enforcement, supplier collaboration, and reliable auditability.

## 14. Zoho Procurement design structure

Zoho Procurement uses a business-admin SaaS design focused on workflows, tables, approvals, and transaction traceability rather than a consumer-style interface.

### 14.1 Application shell

```text
┌──────────────────────────────────────────────────────────────┐
│ Logo | Global Search | Organization | + | Bell | User         │
├───────────────┬──────────────────────────────────────────────┤
│ Sidebar       │ Page Header                                  │
│               │ Title | Breadcrumb | Filters | Actions        │
│ Dashboard     ├──────────────────────────────────────────────┤
│ My Requests   │ Main content area                             │
│ Approvals     │ Cards, tables, forms, charts, and tabs         │
│ Items         │                                                │
│ Vendors       │                                                │
│ Procurement   │                                                │
│ Payables      │                                                │
│ Budgets       │                                                │
│ Analytics     │                                                │
│ Settings      │                                                │
└───────────────┴──────────────────────────────────────────────┘
```

The shell typically includes:

- Persistent left navigation
- Global search
- Organization switcher
- Quick-create button
- Notifications
- Settings
- Profile and help menu
- Contextual page actions
- Breadcrumbs
- Filters and saved views
- Role-specific module access

Recommended navigation grouping:

```text
Dashboard

Buying
  My Requests
  Catalog

Procurement
  Purchase Requests
  Request for Quotes
  Purchase Orders
  Purchase Receives

Suppliers
  Vendors
  Contracts

Payables
  Invoice Inbox
  Bills
  Payments

Control
  Budgets
  Analytics

Administration
  Users and Roles
  Workflows
  Integrations
  Settings
```

### 14.2 Dashboard layout

The dashboard is an operational control center, not just a visual report.

```text
┌──────────────────────────────────────────────────────────────┐
│ Dashboard                         Date Range: This Quarter   │
├────────────┬────────────┬────────────┬───────────────────────┤
│ Total Spend│ PO Spend   │ Open POs   │ Bills Pending         │
├────────────┴────────────┴────────────┴───────────────────────┤
│ Spend Summary Chart                 │ Attention Required      │
│                                    │ Approvals               │
│                                    │ Invoice exceptions      │
├────────────────────────────────────┼─────────────────────────┤
│ Budget Consumption                 │ Payables Aging           │
│ Progress bars by budget            │ Current / overdue        │
├────────────────────────────────────┼─────────────────────────┤
│ Top Suppliers / Items / Accounts   │ Most Requested Items     │
└──────────────────────────────────────────────────────────────┘
```

Important characteristics:

- A date filter controls all widgets.
- Cards and charts link to the underlying records.
- Attention-required items are prioritized.
- Budget consumption is shown visually.
- Spend is separated into PO and non-PO spend.
- Payables use aging buckets.
- Operational metrics show procurement efficiency.

### 14.3 List page pattern

Most modules use the same table-based list pattern.

```text
┌──────────────────────────────────────────────────────────────┐
│ Purchase Orders                         + New Purchase Order │
│ Breadcrumb                                                   │
├──────────────────────────────────────────────────────────────┤
│ Search | Status | Supplier | Date | Department | More Filters │
├──────────────────────────────────────────────────────────────┤
│ □ │ PO Number │ Supplier │ Date │ Amount │ Status │ Actions   │
│ □ │ PO-00045  │ ABC Ltd  │ ...  │ ...    │ Approved│ ...      │
│ □ │ PO-00044  │ XYZ Inc  │ ...  │ ...    │ Issued  │ ...      │
├──────────────────────────────────────────────────────────────┤
│ Bulk actions | Export | Pagination                           │
└──────────────────────────────────────────────────────────────┘
```

Reusable list-page elements:

- Search
- Status tabs
- Advanced filters
- Date filters
- Sortable columns
- Bulk selection
- Export
- Pagination
- Row action menu
- New-record button
- Empty states
- Saved views

This pattern can be shared by requests, vendors, items, RFQs, purchase orders, receipts, bills, and payments.

### 14.4 Detail page pattern

A detail page combines a summary header, status indicator, related-data tabs, transaction tables, and activity history.

```text
┌──────────────────────────────────────────────────────────────┐
│ PO-00045                         Approved     [Actions]       │
│ ABC Supplies | Created 15 Sep | Total $12,500                │
├──────────────────────────────────────────────────────────────┤
│ Draft → Pending Approval → Approved → Issued → Received       │
├──────────────────────────────────────────────────────────────┤
│ Overview | Items | Receives | Bills | Payments | Comments     │
├──────────────────────────────────────────────────────────────┤
│ Supplier details       │ Delivery and payment details         │
│ Department             │ Terms and dates                      │
│ Requester              │ Attachments                          │
├──────────────────────────────────────────────────────────────┤
│ Line item table                                               │
├──────────────────────────────────────────────────────────────┤
│ Activity timeline and audit trail                             │
└──────────────────────────────────────────────────────────────┘
```

The full transaction history should remain connected:

```text
Purchase Request
   ↓
Approval History
   ↓
Purchase Order
   ↓
Receipts
   ↓
Invoices
   ↓
Payments
```

### 14.5 Form structure

A purchase request form can be divided into three areas.

**Header section**

- Requester
- Expected date
- Delivery address
- Department
- Cost center
- Reason
- Reference number
- Notes to approver

**Line-item section**

- Item or service
- Category
- Description
- Preferred supplier
- Quantity
- Unit
- Estimated rate
- Discount
- Tax
- Attachments

**Footer section**

- Subtotal
- Tax
- Additional charges
- Total
- Save as draft
- Submit for approval

The line-item section should support catalog search, free-text requests, adding or deleting lines, and item-level attachments.

### 14.6 Status-driven actions

Pages are organized around transaction state. Available buttons should change according to the current status.

```text
Purchase Request:
Draft -> Submitted -> Awaiting Approval -> Approved -> Processed
                              └-> Rejected -> Edit and Resubmit
```

```text
Purchase Order:
Draft -> Pending Approval -> Approved -> Issued
       -> Partially Received -> Fully Received
       -> Partially Billed -> Billed -> Closed
```

| Status | Typical actions |
|---|---|
| Draft | Edit, submit, delete |
| Pending Approval | Approve, reject, forward |
| Approved | Convert to PO, convert to RFQ |
| Issued | Send, receive, cancel |
| Partially Received | Receive remaining items, create bill |
| Rejected | Edit, resubmit, view reason |
| Closed | View, clone, inspect audit history |

Do not display every possible action at every stage. Contextual actions reduce errors and make the workflow easier to understand.

### 14.7 Approval inbox

The approval screen is a unified queue for transactions waiting on the current user.

```text
┌──────────────────────────────────────────────────────────────┐
│ Approvals                                                    │
│ Type: All | Requests | POs | Bills | Vendors                 │
├──────────────────────────────────────────────────────────────┤
│ Request │ Requester │ Department │ Amount │ Submitted │ Age   │
├──────────────────────────────────────────────────────────────┤
│ PR-1001 │ John       │ Marketing  │ $2,500 │ Today     │ 2 hrs │
├──────────────────────────────────────────────────────────────┤
│ [Approve] [Reject] [Forward] [View Details]                  │
└──────────────────────────────────────────────────────────────┘
```

The inbox should support approve, reject, forward, comments, mandatory rejection reasons, bulk actions where safe, notifications, and complete approval history.

### 14.8 RFQ and sourcing page

RFQ pages are workflow-oriented and expose the bidding lifecycle.

```text
┌──────────────────────────────────────────────────────────────┐
│ RFQ-00012                 Published | Ends in 2d 04h          │
├──────────────────────────────────────────────────────────────┤
│ Draft → Approved → Published → Bidding Ended → Awarded        │
├──────────────────────────────────────────────────────────────┤
│ Participation | Basic Details | Activity | Items | Vendors    │
├──────────────────────────────────────────────────────────────┤
│ Vendor participation summary                                  │
│ Invited | Accepted | Declined | Bid submitted                 │
├──────────────────────────────────────────────────────────────┤
│ Compare Bids                                                  │
│ Supplier A | Supplier B | Supplier C | Delivery | Total       │
├──────────────────────────────────────────────────────────────┤
│ Shortlist | Award | Submit for Approval                       │
└──────────────────────────────────────────────────────────────┘
```

Bid comparison should include total cost, unit price, quantity, delivery date, vendor notes, internal notes, expected-versus-actual values, award quantity, and split awards across suppliers.

### 14.9 Supplier portal

The supplier portal is a separate, restricted user experience.

```text
Supplier Portal
  Dashboard
  Company Profile
  Documents
  RFQ Invitations
  Purchase Orders
  Invoices
  Payments
  Messages
  Support
```

Suppliers should see their own POs, invoices, payment status, sourcing events, documents, and messages. They should not see internal approval notes, other suppliers' bids, internal budgets, or internal supplier scores.

### 14.10 Visual design direction

The design direction is an enterprise dashboard combined with an ecommerce-style catalog, accounting interface, supplier portal, and analytics system:

- Light background
- White cards and panels
- Strong use of tables
- Compact but readable forms
- Status badges
- Progress indicators
- Spend and budget charts
- Accent color for actions and warnings
- Modal dialogs for confirmations and rejection reasons
- Tabs for related transaction data
- Side panels or popups for quick detail
- Responsive layouts for approvals and simple actions

### 14.11 Recommended UI architecture

```text
App Shell
  ├── Global navigation
  ├── Search
  ├── Notifications
  ├── Organization switcher
  └── Quick create

Module List Page
  ├── Page title
  ├── Primary action
  ├── Search and filters
  ├── Status tabs
  ├── Data table
  └── Bulk actions

Record Detail Page
  ├── Summary header
  ├── Status timeline
  ├── Contextual actions
  ├── Related-data tabs
  ├── Main transaction data
  ├── Attachments
  ├── Comments
  └── Audit activity

Transaction Form
  ├── Header information
  ├── Dynamic line items
  ├── Accounting and budget section
  ├── Attachments
  ├── Totals
  └── Save, submit, approve, or reject actions
```

The key design lesson is to keep the interface module-based on the outside but workflow-connected underneath. Users navigate through Requests, Suppliers, Orders, Receipts, and Bills, while the system maintains one continuous procurement lifecycle behind those pages.

## 15. Current Procurement project comparison

This section compares the current `Procurement` project with the Zoho Procurement design and workflow described above. The percentages are practical product-parity estimates, not code-coverage measurements.

### 15.1 Overall progress

| Area | Estimated completion |
|---|---:|
| Visual application shell | 82-87% |
| Dashboard layout | 78-83% |
| Items and catalog | 45-55% |
| Vendors | 35-45% |
| Purchase requests | 60-70% |
| Approval workflows | 30-40% |
| RFQ and strategic sourcing | 55-65% |
| Purchase orders | 60-70% |
| Goods receipts | 60-70% |
| Bills and accounts payable | 50-60% |
| Payments | 45-55% |
| Budgets | 10-20% |
| Analytics | 10-20% |
| Settings and configuration | 0-10% |
| Contracts | 0% |
| Supplier portal | 20-30% |
| **Overall functional parity** | **approximately 55-60%** |

### 15.2 What is already implemented

#### Application shell

The project already has a strong Zoho-inspired workspace:

- Persistent top bar
- Collapsible left sidebar
- Getting Started panel
- Dashboard
- My Requests
- Approvals
- Items
- Vendors
- Procurement accordion
- Payables accordion
- Budgets
- Analytics
- Quick-create buttons
- Responsive workspace layout
- Active navigation states

Important files include:

- `apps/web/src/features/workspace/Workspace.tsx`
- `apps/web/src/features/workspace/WorkspaceSidebar.tsx`
- `apps/web/src/features/workspace/TopBar.tsx`
- `apps/web/src/App.tsx`

#### Dashboard

The dashboard has structures for:

- Total spend
- PO and non-PO spend
- Orders issued
- Bills processed
- New items
- New vendors
- Budget information
- Payables aging
- Attention-required items
- Top items
- Top vendors
- Top accounts
- Payment modes
- Compliance metrics
- Order-to-receive time
- Invoice matching percentage

The layout is relatively advanced, but it still needs complete live date filtering, drill-down links, and fully verified calculations for every widget.

#### Database foundation

The Prisma schema already includes models for:

- Organizations
- Users
- Roles and permissions
- Items
- Vendors
- Purchase requests and lines
- Purchase orders and lines
- Purchase receives and lines
- Bills and lines
- Payments
- Vendor credits
- RFQs, vendors, bids, and awards
- Recurring bills
- Payment batches

The database foundation is ahead of the user interface. The next work is to expose the models through complete workflows, permissions, notifications, audit history, and detail pages.

### 15.3 Module-by-module comparison

#### Purchase requests: partly complete

Implemented:

- Create purchase request
- Request line items
- Expected date
- Delivery address
- Reason and notes
- Reference number
- Draft status
- Submit
- Approve
- Reject with reason
- Recall
- Cancel
- Edit rejected requests
- Convert an approved request to a purchase order
- Requestor ownership checks
- Backend validation

Still needed:

- Complete request detail page
- File attachments
- Configurable approver selection
- Hierarchical approval chains
- Custom approval rules
- Forward-to-approver action
- Comments and activity timeline
- Notifications
- Custom fields and page layouts
- Full status tabs and advanced filters
- Complete request-to-RFQ workflow

#### Approvals: early stage

Implemented:

- Approvals route
- Pending purchase request endpoint
- Approve and reject actions
- Rejection reason validation

Still needed:

- One queue for requests, POs, bills, vendors, and RFQ awards
- Forward action
- Bulk approval
- Approval detail panel
- Comments
- Notifications
- Configurable approval chains
- Permission-based approval rules
- Approval history

#### Items and catalog: core CRUD only

Implemented:

- Item creation
- Name, SKU, category, unit, cost price, and description
- Validation
- Duplicate handling
- Backend persistence
- Item list

Still needed:

- Images
- Brand and manufacturer
- Tax codes
- Variants
- UPC, EAN, MPN, and ISBN identifiers
- Serial and batch tracking
- Expiry dates
- Warehouse stock
- Supplier-specific price lists
- CSV import
- Clone item
- Ecommerce-style catalog shopping experience
- PunchOut catalogs
- Item detail page

#### Vendors: basic directory

Implemented:

- Vendor creation
- Name, contact person, email, phone, category, payment terms, address, and notes
- Vendor list
- Backend vendor model

Still needed:

- Supplier invitation
- Supplier registration
- Supplier portal onboarding
- Vendor approval
- Multiple contacts
- Bank accounts
- Tax IDs
- Currency
- Separate billing and shipping addresses
- Supplier documents
- Supplier transaction history
- Supplier performance and risk
- Import and clone

#### RFQ and strategic sourcing: data foundation present

Implemented in the codebase:

- RFQ model and lines
- RFQ vendors
- Invite tokens
- Bids and bid lines
- Awards
- RFQ API methods
- Vendor RFQ portal route
- Bid comparison and award helpers

Still needed:

- Complete sourcing-event lifecycle
- Bidding start and end dates
- Live countdown
- Vendor participation summary
- Rich bid comparison
- Shortlisting
- Split awards
- Internal bid notes
- RFQ approval
- Award approval
- Award notifications
- Award-to-PO interface
- Complete vendor response experience

#### Purchase orders: useful backend lifecycle

Implemented:

- PO and line models
- Manual PO creation
- Conversion from approved PR
- Vendor assignment
- PO statuses
- Submit, approve, issue, close, and cancel actions
- Expected date and notes
- Line-level received and billed quantities

Still needed:

- Complete PO detail page
- PDF template
- Email and send tracking
- Vendor acceptance tracking
- Blanket POs
- Amendments
- Partial line cancellation
- Clone PO
- Approval inbox integration
- Contract linkage
- Budget validation
- Full PO-to-bill interface

#### Goods receipts: core quantity tracking

Implemented:

- GRN model
- Create receive from PO
- Partial receipt validation
- Remaining quantity calculation
- Complete receipt
- PO received-quantity updates
- PO status recomputation
- Receipt lines

Still needed:

- Detailed GRN page
- Attachments
- Warehouse or location handling
- Service receipts
- Quality inspection
- Rejection and return workflow
- Receipt-to-bill interface
- Receipt activity history
- Receiving permissions

#### Bills and accounts payable: partial foundation

Implemented in the data and API foundation:

- Bills and bill lines
- Bill statuses
- PO and receipt relationships
- Amount paid
- Payments
- Bill matching helpers
- Recurring bill model
- Vendor credits
- Payment batches

Still needed:

- Invoice inbox
- Supplier invoice submission
- OCR or AI extraction
- Email invoice ingestion
- Duplicate invoice detection
- Configurable matching tolerance
- Full three-way reconciliation screen
- Invoice approval workflow
- Partial-payment interface
- Overdue automation
- AP aging reports
- Attachments
- Bill activity timeline
- Void and restore workflow

#### Payments: data structures present

Implemented in the foundation:

- Payments
- Payment methods
- Payment references
- Payment dates
- Payment batches
- Batch lines
- Vendor credits

Still needed:

- Apply one payment across multiple bills
- Excess payment workflow
- Vendor credit application
- Bank account selection
- Export-to-bank process
- Mark-as-processed flow
- Failed payment handling
- Payment reconciliation
- Payment notifications

#### Budgets: mostly not started

Currently present:

- Budgets route
- Navigation entry
- Initial page placeholder

Still needed:

- Budget persistence
- Department budgets
- Cost centers
- Budget periods
- Budget-versus-actual calculations
- Warning thresholds
- Blocking thresholds
- Budget validation during request creation
- Budget alerts
- Budget detail page

#### Analytics: dashboard foundation only

Implemented:

- Analytics route
- Dashboard data contracts
- Dashboard visualization components
- Analytics navigation

Still needed:

- Dedicated analytics pages
- Spend reports
- Supplier performance reports
- Payment trends
- AP aging
- Budget versus actuals
- PO compliance
- Custom report builder
- Exportable reports
- Drill-down views
- Complete date-range behavior

#### Settings and administration: not yet available as a product surface

The project has user, role, and permission models, but still needs:

- Settings UI
- Organization profile
- Module toggles
- Approval configuration
- Notification preferences
- Custom fields
- Page layouts
- Tax configuration
- GL mapping
- Matching tolerance
- Payment modes
- Supplier portal settings
- Integrations
- Custom modules
- Workflow automation
- Subscription and license management
- Audit-log viewer

#### Contracts: not started

There is currently no dedicated contract model or route. The following remain to be built:

- Contract list and detail pages
- Contract documents
- Contract line items
- Spend tracking
- Expiry alerts
- Renewals
- Contract utilization
- Supplier-linked contracts

#### Supplier portal: RFQ portion only

Implemented:

- RFQ portal route
- Portal RFQ viewing
- Vendor quote submission support

Still needed:

- Supplier authentication
- Company profile
- Onboarding
- Documents
- Purchase orders
- Invoice submission
- Payment tracking
- Supplier messages
- Supplier dashboard
- Supplier-specific permissions

### 15.4 Design comparison

The current project matches the Zoho-inspired outer design in these areas:

- Sidebar-based application shell
- Top bar
- Getting Started panel
- Grouped Procurement and Payables navigation
- Dashboard cards
- White card-based layout
- Tables and list pages
- Status labels
- Quick-create controls
- Collapsible sidebar
- Responsive workspace
- Backend-connected list pages

The following deeper page patterns are not yet consistently implemented:

- Breadcrumbs on every module
- Advanced filters
- Saved views
- Detail pages with related tabs
- Status timelines
- Contextual actions by record state
- Activity and audit timelines
- Comments
- Attachment panels
- Bulk actions
- Rich empty states
- Drill-down analytics
- Workflow-specific modals
- Supplier-facing screens

The outer shell is relatively mature, but the inside of each module still needs to become transaction-oriented.

### 15.5 Main implementation risks

1. Several pages use a generic list-page implementation. This is useful for scaffolding but does not provide complete detail pages, transaction history, or contextual actions.
2. The database is ahead of the UI. RFQs, awards, payments, recurring bills, batches, and credits have models, but users cannot yet manage all workflows through complete screens.
3. Approval logic is currently simple. Approval chains, forwarding, comments, notifications, and permission rules are still missing.
4. Settings are missing. Approval rules, notification behavior, tax rules, payment modes, matching tolerances, and organization preferences cannot yet be configured.
5. The procurement chain is not fully connected in the user experience. The backend has pieces of `PR -> PO -> Receipt -> Bill -> Payment`, but the UI should expose this as one lifecycle.
6. Contracts, budgets, analytics, supplier onboarding, notifications, and integrations remain major gaps.

### 15.6 Recommended build order

1. Complete purchase request pages and detail views.
2. Build the unified approvals inbox.
3. Finish the connected `PR -> PO -> Receipt -> Bill` flow.
4. Add three-way matching and an exception queue.
5. Improve RFQ comparison, award, and conversion flows.
6. Implement supplier onboarding and the supplier portal.
7. Build budgets and budget enforcement.
8. Add payments, credits, recurring bills, and batch payments.
9. Build analytics and drill-down reports.
10. Add settings, permissions, notifications, audit logs, and integrations.

### 15.7 Summary

The Procurement project has a good foundation and a recognizable Zoho-inspired shell. Its strongest areas are the application shell, dashboard structure, database schema, purchase-request backend, PO and receipt foundations, and RFQ data model.

Against the documented Zoho target, the project is approximately **55-60% functionally complete** (2026-09-15: sidebar matched to Zoho grouping/spacing/collapse, dashboard rebuilt to Zoho's live section order with Date Range + Spend/Attention/Most Requested/Payment Modes, My Home tab added with Quick Create + Pending Approvals + Recent Requests). The largest remaining gaps are settings, contracts, budgets, analytics, supplier onboarding, notifications, approval orchestration, and complete detail-page workflows.
