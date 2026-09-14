# ProcureFlow Procurement Platform
## Project and Deployment Plan — Galle Face Hotel

**Prepared:** 12 August 2026  
**Proposed platform:** Zoho Catalyst  
**Deployment model:** One dedicated Catalyst project for Galle Face Hotel / Group, with group and property-level access

## 1. Purpose and outcome

This plan covers the controlled implementation and production deployment of the ProcureFlow procurement platform for Galle Face Hotel. The target outcome is a single, auditable procure-to-pay process across the group: requisition, approval, competitive quotation where required, purchase order, goods receipt, invoice matching, payment recording and reporting.

The implementation is designed for hotel operations: multi-property procurement, CapEx and OpEx separation, property-aware budgets, group/vendor governance, and approvals that can escalate from a property to head office and the Board.

## 2. Solution in scope

| Area | Included capability |
|---|---|
| User access and governance | Catalyst sign-in; named users; roles, permission profiles, approval limits, active/inactive users, property assignments and audit log |
| Hotel group structure | Group-level access plus property/cluster setup; server-side property scoping; group and property vendors |
| Master data | Item catalogue, supplier records, contacts, bank details, supplier merge, budgets and configurable/custom fields |
| Procure-to-pay | Purchase requests (PR), approval history, RFQs/bids/awards, POs, goods-receipt notes (GRNs), bills, 3-way matching, payments, recurring bills and vendor credits |
| Financial controls | Budget availability checks, committed/spent tracking, CapEx/OpEx classification, configurable matching tolerance, prevention of over-receipt and over-payment |
| Collaboration | Vendor portal for invitations, bid submission, PO acceptance/rejection, invoice visibility and payment status; document attachments and PDF output |
| Reporting | Spend, purchasing, payables-aging, CapEx/OpEx, property/cluster matrix and configurable dashboards |
| Integration | Optional Zoho Books connection and controlled sync of vendors, items and bills; webhook testing for approved events |
| Administration | Company branding, PDF templates, dashboards, custom fields/modules, properties, users, profiles and audit review |

### Recommended Galle Face Hotel approval design

The deployed baseline supports a hotel-specific workflow. Galle Face Hotel will validate the named role-holders and monetary thresholds before configuration.

| Budget condition | Approval path |
|---|---|
| Within approved budget | Head of Department → Head of Finance → General Manager → Purchasing Manager → Central Procurement → Procurement Committee |
| Not budgeted | Head of Department → Head of Finance → General Manager → VP Operations/CEO → Board of Directors |
| Exceeds budget | Standard within-budget route, then Board of Directors |

Property roles resolve to the assigned person at the requesting property; a head-office holder can be used as the defined fallback. A vacant required role stops the request in Pending Approval rather than approving it automatically.

## 3. Delivery approach and indicative timeline

The following is an **8-week deployment and adoption plan**, assuming timely client decisions, data templates and user availability. It begins with the already-developed ProcureFlow baseline and does not assume a rebuild.

| Week | Phase and activities | Key output / client sign-off |
|---|---|---|
| 1 | Mobilisation: nominate sponsor, process owners and project team; confirm the 15-property structure; validate scope, interfaces and success measures | Project charter, stakeholder list, confirmed property/onboarding template |
| 2 | Design workshops: map current requisition-to-payment process; confirm delegation-of-authority (DOA) limits, budget owners, purchasing policies, RFQ rules and exceptions | Signed configuration workbook and future-state workflow |
| 3 | Foundation configuration: create production workspace; configure organisation profile, branding, currency/fiscal year, departments, properties/clusters, roles, profiles and property access | Security and access design accepted |
| 4 | Master-data migration: cleanse/import items, suppliers, contacts, opening budgets and relevant open POs; configure categories, tax/terms, custom fields and PDF templates | Migration reconciliation and sample documents accepted |
| 5 | Process configuration: configure approvals, budgets, CapEx/OpEx handling, vendor portal, dashboards, three-way-match tolerance and optional Books connection | End-to-end configured test environment |
| 6 | System integration testing (SIT) and user acceptance testing (UAT): execute agreed scenarios; resolve defects; conduct security/access and deployment rehearsals | UAT evidence, issue log and go-live recommendation |
| 7 | Training and cutover readiness: role-based training, quick-reference guides, support model, final data delta plan, production change approval | Go/no-go approval and cutover checklist |
| 8 | Production cutover and hypercare: deploy, validate, release users in waves, monitor daily and hand over operations | Production acceptance and hypercare closure plan |

## 4. Galle Face Hotel responsibilities and project governance

| Role | Responsibility |
|---|---|
| Executive sponsor | Resolves cross-functional decisions and approves go-live |
| Procurement lead / product owner | Owns future process, supplier policy, RFQ policy, acceptance criteria and UAT sign-off |
| Finance lead | Validates budget structure, CapEx/OpEx treatment, invoice tolerance, payment process and Zoho Books mapping |
| Property GMs / nominated representatives | Confirm property structures, approvers, local workflows and pilot results |
| IT/security contact | Approves identity/domain, network and data-security requirements; provides integration credentials through secure channels |
| Implementation team | Configures, migrates, tests, trains, deploys, documents and provides hypercare support |

Governance cadence: a 30-minute weekly project meeting, a weekly decision/risks review, daily cutover calls during go-live, and a weekly hypercare review. Decisions affecting DOA, accounting, integration, scope or go-live must be recorded in a decision log.

## 5. Data migration and configuration requirements

Galle Face Hotel should provide approved source files in the agreed template format. The implementation team will validate, load and reconcile them; source-system data remains the client’s responsibility.

| Data set | Minimum fields / checks |
|---|---|
| Properties | Name, location, cluster, currency, fiscal-year start, active status; unique property names |
| Users and approvers | Name, business email, role, profile, approval limit, assigned property/properties, active status |
| Departments and categories | Department, hotel procurement category, default CapEx/OpEx suggestion, budget owner |
| Item master | SKU/code, name, description, unit, category, preferred vendor, unit price, tax treatment and required custom fields |
| Vendors | Legal/display name, contacts, email, address, payment/bank information, group or property scope, applicable property |
| Budgets | Fiscal year, property, department, expense type, approved amount and period split where required |
| Open commitments (if migrated) | Open PR/PO number, supplier, property, line values, received/billed quantities, outstanding balance and document references |

Recommended migration sequence: cleanse → mock load → client reconciliation → correction → production load → final delta/reconciliation. No production loading should begin without written confirmation of the source extract and data owners.

## 6. Testing and acceptance

The production release is conditional on the following acceptance gates.

| Gate | Evidence required |
|---|---|
| Configuration acceptance | Galle Face Hotel approves organisation, properties, departments, DOA, profiles, budgets, document template and integration settings |
| Data acceptance | Record counts and sample values reconciled for items, vendors, users, properties and budgets; exceptions documented and approved |
| Functional UAT | Client test cases pass for standard and exception P2P scenarios |
| Security/access acceptance | Users see only allowed functions/properties; approvers can act only on assigned items; inactive users cannot operate |
| Operational acceptance | Training complete, help/support contacts published, backup/recovery and escalation procedures confirmed |
| Release acceptance | Pre-deployment verification passes; health check, smoke test and client production sign-off complete |

Minimum UAT scenarios: within-budget and over-budget PR; not-budgeted escalation; CapEx approval and asset creation; rejected/recall/resubmit request; RFQ/bid/award; PO and partial GRN; matched/review/discrepant invoice; prevented over-receipt/over-payment; supplier portal access; property-level data isolation; PDF output; audit history; and, if selected, Zoho Books sync and failure handling.

## 7. Production deployment plan

### 7.1 Architecture and deployment boundary

The production solution consists of the Catalyst web client (`/app`) and two Node 20 functions: `procurement_api` for the protected business API and `procurement_signup_gate` for onboarding approval. Local development/legacy folders in the repository are not deployment artefacts. Attachments use secure Catalyst storage; the client receives no application secrets.

### 7.2 Pre-deployment checklist

1. Production Catalyst project and authorised administrators confirmed.
2. Public application domain and canonical `APP_ORIGIN` set; any custom browser origin added to `ALLOWED_ORIGINS`.
3. Verified outbound sender (`MAIL_FROM`) configured if vendor/email notifications are enabled.
4. Optional Zoho Books credentials and redirect URI stored only in Catalyst function configuration; connection tested with a non-production or controlled account first.
5. Properties, users, roles, profiles, budgets, vendors and catalogue reconciled.
6. Production PDF template, logo and vendor correspondence approved.
7. Data backup/export created before production data load or release.
8. Deployment verification suite passes and the UAT/go-live approval is signed.

### 7.3 Release sequence

1. Announce the short cutover window and pause changes to the source/master data.
2. Create the final backup/export and record baseline counts.
3. Run the repository verification suite: `bash verification/verify.sh`; proceed only on exit code 0.
4. Deploy the API functions **separately**, then deploy the web client. The known reliable sequence is:

   ```bash
   catalyst deploy --only functions:procurement_api
   catalyst deploy --only functions:procurement_signup_gate
   catalyst deploy --only client
   ```

5. Confirm the health endpoint returns the intended production version and timestamp: `/server/procurement_api/api/health`.
6. Complete a smoke test with controlled client accounts: sign-in, access control, a PR approval, PO/GRN, attachment/PDF and vendor portal, plus Books test where in scope.
7. Release the pilot group first, then the remaining properties/users according to the approved rollout wave plan.
8. Confirm production acceptance, publish the support route and lift the change freeze.

### 7.4 Rollback and contingency

If a release fails validation, do not release additional users. Preserve logs and the deployment reference, restore the previous known-good function/client version, and reconcile any transactions entered during the cutover window from the recorded backup/delta log. Configuration/data corrections are made only with Procurement and Finance approval. A functional issue in optional Zoho Books sync does not block core procurement operation; sync is disabled until corrected and transactions are queued/reconciled manually.

## 8. Training, rollout and support

Training is role-based and uses Galle Face Hotel scenarios and data.

| Audience | Session focus |
|---|---|
| Requesters / department heads | PR creation, budget visibility, attachments, recall/resubmit and tracking |
| Approvers / GMs / Finance | Approval inbox, DOA routing, exceptions, audit history and delegation rules |
| Procurement team | Supplier/item management, RFQ/bid/award, PO issue, vendor communications and reporting |
| Stores / receiving | GRNs, partial deliveries, quality/quantity exceptions and document evidence |
| Finance / AP | Bills, 3-way matching, tolerance review, payments, credits and Books reconciliation |
| Administrators | Users, properties, profiles, budgets, dashboards, templates, audit log and first-line support |

Recommended rollout: pilot with Head Office and 1–2 representative properties for one operating cycle, then extend to the remaining properties in agreed waves. Provide at least two weeks of hypercare with daily monitoring of failed approvals, budget blocks, vendor access, matching exceptions and user-support requests.

## 9. Key assumptions, dependencies and exclusions

| Topic | Assumption / dependency |
|---|---|
| Property estate | The planning baseline is 15 properties; final names, clusters and user assignments are provided by Galle Face Hotel |
| Financial authority | Galle Face Hotel owns and formally approves all DOA thresholds, board-escalation criteria and budget rules before build/configuration is frozen |
| Accounting integration | Zoho Books sync is optional and requires a client-owned/approved Books organisation, OAuth credentials, scopes and account mapping |
| Vendor adoption | Supplier email/contact quality and vendor-portal onboarding are client-supported; offline bid capture remains available where a vendor cannot use the portal |
| Historical data | Migration of historic transactions beyond the agreed opening/open-commitment set is a separately sized data-conversion activity |
| PMS/ERP integrations | Hotel PMS, payroll, inventory, banking/payment execution, SSO and bespoke ERP integrations are excluded unless separately scoped and approved |
| Change control | New modules, reports, approval routes, integrations or material process changes after design sign-off follow controlled change request assessment |

## 10. Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Delayed approval thresholds or named approvers | Hold a Week 2 authority workshop; use a client-approved interim matrix only where authorised |
| Poor item/vendor data | Enforce template validation, mock migration and accountable data owners before production loading |
| Incomplete budget structure | Finance signs off property/department/expense-type budgets before UAT; use controlled opening balances |
| Adoption variance across properties | Pilot representative sites, appoint property champions, train by role and use daily hypercare review |
| Incorrect property visibility | Test with property and group accounts; validate server-side access as a release gate |
| Books credential/sync issues | Configure secrets only in Catalyst, test connection early, reconcile in controlled batches and retain a manual fallback process |
| Production release failure | Separate function/client deployment, mandatory verification, health/smoke tests, backup and documented rollback owner |

## 11. Go-live success measures

The initial release will be considered successful when the following are met during the agreed hypercare period:

- 100% of pilot users can sign in and are assigned the correct role/profile/property scope.
- Approved test P2P scenarios complete end-to-end with audit evidence.
- No unauthorised cross-property data access is observed.
- Item, vendor, property, user and budget migration reconciliation is approved.
- All production-critical defects are resolved or have an approved workaround and owner/date.
- Procurement and Finance provide written production acceptance.

## 12. Immediate next actions

1. Nominate the Galle Face Hotel executive sponsor, Procurement lead, Finance lead, IT/security contact and property champions.
2. Schedule the discovery/DOA workshop and provide the property, user/approver, vendor, item and budget templates.
3. Confirm whether Zoho Books integration is in the first go-live scope.
4. Approve the pilot properties, rollout waves and target go-live week.
5. Review and sign off this plan as the baseline for detailed configuration and cutover.

