'use strict';

// Supplier correspondence: the RFQ/RFP invitation, the award notice and the
// regret letter.
//
// The wording is the customer's own, taken from their template documents, with
// their {Placeholders} kept as the merge-field names. Two variants exist for
// each letter because the group treats routine supply differently from capital
// work: an RFQ for bottled water and a Letter of Award for a refurbishment are
// not the same document, and sending the wrong one reads as carelessness to
// the supplier.

/** Replace {Field} tokens. Anything unresolved is left visibly unfilled. */
function merge(template, values) {
  return template.replace(/\{(\w+)\}/g, (whole, key) => {
    const v = values[key];
    return (v === undefined || v === null || v === '') ? whole : String(v);
  });
}

/** Merge fields still unresolved — the caller decides whether that matters. */
function missingFields(template, values) {
  const out = new Set();
  for (const m of template.matchAll(/\{(\w+)\}/g)) {
    const v = values[m[1]];
    if (v === undefined || v === null || v === '') out.add(m[1]);
  }
  return [...out];
}

const TEMPLATES = {
  // ── Invitations ──────────────────────────────────────────────────────────
  rfq: {
    key: 'rfq',
    label: 'Request for Quotation (RFQ)',
    use: 'Routine purchases, operational supplies and raw materials.',
    subject: '[RFQ Invitation] Request for Quotation: {RFQ_Number} - {RFQ_Title}',
    body: `Dear {Supplier_Contact_Name},

{Company_Name} invites your company to submit a formal quotation for {RFQ_Title} (RFQ Ref: {RFQ_Number}).

Please find the overview of the required items below:

RFQ Reference Number: {RFQ_Number}
Target Delivery / Performance Location: {Delivery_Location}
Submission Deadline: {Closing_Date}
Payment Terms Standard: {Payment_Terms}

Summary of Line Items Requested:
{Line_Items}

Submission Instructions:
To view complete specifications, unit breakdown, and submit your financial bid, please access our Supplier Portal using the direct link below:
{System_Portal_URL}

Important Notes:
- All prices quoted must specify applicable taxes (VAT/SSCL) and delivery/freight terms.
- Quotations submitted via reply to this email will not be considered. All submissions must be logged directly through the portal before the closing deadline.
- Technical specification sheets or product certificates can be attached directly in the portal.

If you experience any technical issues accessing the portal or require technical clarifications regarding the items, please contact our Central Procurement team at {Procurement_Contact_Email} or call {Procurement_Contact_Phone}.

Thank you for your continued partnership.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement
{Company_Name}`
  },

  rfp: {
    key: 'rfp',
    label: 'Request for Proposal (RFP)',
    use: 'Projects, capital works and contracts needing a technical and a commercial proposal.',
    subject: '[RFP Invitation] Request for Proposal: {RFP_Number} - {RFP_Title}',
    body: `Dear {Supplier_Contact_Name},

{Company_Name} hereby requests your formal proposal for {RFP_Title} (RFP Ref: {RFP_Number}). We invite qualified suppliers to submit both technical and commercial proposals in accordance with the requirements detailed in our procurement portal.

Project Overview:
RFP Reference Number: {RFP_Number}
Scope Summary: {Brief_Project_Scope}
Site Inspection / Pre-Bid Meeting: {Site_Visit_Date_Time} (Location: {Site_Address})
Clarification Cut-Off Date: {Clarification_Deadline}
Final Submission Deadline: {Closing_Date}

Submission Requirements:
Your submission must include:
- Technical Proposal: Detailed Scope of Work (SOW), technical specifications, implementation schedule, team profiles, and relevant experience/references.
- Commercial Proposal: Detailed cost breakdown, pricing schedule, payment milestone structure, and warranty terms.
- Compliance Documents: Valid trade registrations, tax compliance certificates, and safety/hygiene certifications (where applicable).

How to Participate:
Please log in to the Supplier Portal to download the complete Bill of Quantities (BOQ), Terms of Reference (TOR), and upload your two-envelope (Technical & Commercial) response:
{System_Portal_URL}

Important Notes:
- Late submissions will be automatically restricted by the system upon reaching the deadline.
- Commercial offers must remain valid for a minimum of {Validity_Period_Days} days from the closing date.
- For any legal, technical, or scope-related queries prior to the clarification cut-off date, please post your questions directly under the 'RFP Clarifications' tab inside the portal.

We look forward to receiving your proposal.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement & Supply Chain Management
{Company_Name}`
  },

  // ── Awards ───────────────────────────────────────────────────────────────
  award_goods: {
    key: 'award_goods',
    label: 'Award notice — goods & materials',
    use: 'Awarded RFQs, routine purchases, operational supplies or raw materials.',
    subject: 'Award Notice: {RFQ_Number} - {Project_or_Item_Title}',
    body: `Dear {Supplier_Contact_Name},

We are pleased to inform you that {Company_Name} has officially selected {Supplier_Company_Name} for the award of {Project_or_Item_Title} under reference {RFQ_Number}.

Your quotation was selected following our evaluation process based on your technical compliance, competitive commercial terms, and commitment to delivery timelines.

Award Summary:
RFQ / Proposal Reference: {RFQ_Number}
Total Award Value: {Currency} {Award_Amount} (inclusive of applicable taxes)
Agreed Payment Terms: {Payment_Terms}
Expected Delivery Location: {Delivery_Location}
Target Delivery Date: {Delivery_Date}

Next Steps:
1. Formal Purchase Order: Our procurement team is issuing the official Purchase Order (PO Number: {PO_Number}) through our Supplier Portal.
2. PO Acknowledgment: Please log in to the portal at your earliest convenience to sign and acknowledge receipt of the formal PO:
   {System_Portal_URL}
3. Delivery Coordination: Please coordinate delivery schedules directly with our Central Stores / Receiving Lead, {Store_Contact_Name}, at {Store_Contact_Email} or {Store_Contact_Phone}.

We appreciate your cooperation throughout the bidding process and look forward to a successful execution.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement & Supply Chain Management
{Company_Name}`
  },

  award_project: {
    key: 'award_project',
    label: 'Letter of Award — project, CapEx or AMC',
    use: 'Major refurbishment, construction, specialised machinery or annual maintenance contracts.',
    subject: 'Letter of Award (LOA): {RFP_Number} - {Project_or_Contract_Title}',
    body: `Dear {Supplier_Contact_Name},

On behalf of {Company_Name}, I am pleased to issue this formal Letter of Award to {Supplier_Company_Name} for {Project_or_Contract_Title} (RFP Ref: {RFP_Number}).

Following our technical and financial evaluations, your proposal has been accepted. We are confident in your team's capability to deliver this project in accordance with our required standards and timelines.

Key Award Parameters:
Contract / Project Title: {Project_or_Contract_Title}
Total Contract Value: {Currency} {Award_Amount}
Contract Commencement Date: {Start_Date}
Completion / Period of Performance: {Completion_Date_or_Duration}
Designated Lead Representative: {Project_Director_or_Engineer_Name}

Pre-Execution & Compliance Requirements:
Prior to site mobilization and formal contract sign-off, please provide the following within {Number_of_Days} business days:
1. Signed Letter of Acceptance: Sign, stamp, and return a copy of this email / attached LOA document.
2. Contractual Agreement: Review the draft Master Service Agreement / Contract generated in the Supplier Portal under your active awards tab:
   {System_Portal_URL}
3. Compliance & Insurance Attachments: Upload your required site insurance policies, safety clearances, and performance bonds (if applicable) directly into the portal.

Our Legal and Project Management teams will schedule an alignment meeting with your project leads shortly to discuss the mobilization schedule.

Congratulations on the award. We look forward to a productive partnership.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement & Supply Chain Management
{Company_Name}`
  },

  // ── Regrets ──────────────────────────────────────────────────────────────
  reject_goods: {
    key: 'reject_goods',
    label: 'Regret notice — goods & materials',
    use: 'Standard RFQs, operational supplies or raw material bids.',
    subject: 'Status Update: {RFQ_Number} - {Project_or_Item_Title}',
    body: `Dear {Supplier_Contact_Name},

Thank you for participating in our recent sourcing process for {Project_or_Item_Title} (RFQ Ref: {RFQ_Number}) and for submitting your quotation.

We have completed our evaluation of all received bids. We regret to inform you that your quotation was not selected for this particular requirement. This decision was based on a combination of factors, including commercial competitiveness, technical requirements, and delivery timelines for this specific order.

We appreciate the time and effort your team invested in preparing your proposal. Please note that this decision does not affect your active standing in our vendor database or future procurement opportunities with {Company_Name}.

We look forward to reviewing your quotes on upcoming inquiries. You can view open tenders and future opportunities anytime via our portal:
{System_Portal_URL}

Thank you once again for your continued interest in doing business with us.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement & Supply Chain Management
{Company_Name}`
  },

  reject_project: {
    key: 'reject_project',
    label: 'Regret notice — project, CapEx or AMC',
    use: 'Major refurbishments, capital equipment or service contracts where structured feedback matters.',
    subject: 'Procurement Outcome: {RFP_Number} - {Project_or_Contract_Title}',
    body: `Dear {Supplier_Contact_Name},

On behalf of {Company_Name}, I would like to express our sincere appreciation to {Supplier_Company_Name} for participating in the tender process for {Project_or_Contract_Title} (RFP Ref: {RFP_Number}).

Following a thorough technical, financial, and operational evaluation of all submitted proposals, another vendor has been awarded the contract for this project.

The evaluation process was highly competitive, and while your proposal demonstrated significant quality and technical merit, the successful submission aligned more closely with our specific operational constraints and overall evaluation criteria for this project.

Debrief & Feedback:
We value transparency and long-term supplier relationships. If your team would like brief feedback regarding the non-commercial evaluation aspects of your bid, please feel free to submit a request through the portal within {Number_of_Days} business days:
{System_Portal_URL}

We truly appreciate the effort and professionalism shown by your team throughout this process and will notify you when similar opportunities arise in the future.

Sincerely,
{Sender_Name}
{Sender_Designation}
Central Procurement & Supply Chain Management
{Company_Name}`
  }
};

/**
 * Render a template.
 * Returns the merged subject and body, plus any merge fields that stayed
 * unresolved so the caller can warn before anything is sent to a supplier.
 */
function render(templateKey, values = {}) {
  const t = TEMPLATES[templateKey];
  if (!t) throw new Error(`Unknown correspondence template: ${templateKey}`);
  const subject = merge(t.subject, values);
  const body = merge(t.body, values);
  return {
    key: t.key,
    label: t.label,
    subject,
    body,
    missing: [...new Set([...missingFields(t.subject, values), ...missingFields(t.body, values)])]
  };
}

/** Format RFQ lines the way the customer's template lays them out. */
function formatLineItems(lines) {
  if (!lines || !lines.length) return '(see the portal for the full item list)';
  const rows = lines.map((l, i) =>
    `${i + 1}. ${l.description || '—'} — ${l.quantity ?? ''} ${l.uom || ''}`.replace(/\s+/g, ' ').trim() +
    (l.requiredDate ? ` (required ${l.requiredDate})` : ''));
  return rows.join('\n');
}

function list() {
  return Object.values(TEMPLATES).map(t => ({
    key: t.key, label: t.label, use: t.use, subject: t.subject
  }));
}

module.exports = { TEMPLATES, render, list, merge, missingFields, formatLineItems };
