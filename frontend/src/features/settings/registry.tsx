import { SettingsForm, CrudList, ToggleRows } from './blocks';
import { ModulePrefs, CustomModulesOverview } from './pages/Modules';
import { UsersPage, RolesPage } from './pages/Users';
import { UserPrefsPage, TaxesPage, AccountsPage } from './pages/Prefs';
import { SubscriptionPage } from './pages/Subscription';
import { CurrenciesPage } from './pages/Currencies';
import { NumberSeriesPage } from './pages/Numbering';
import { WorkflowRulesPage, WorkflowActionsPage, WorkflowLogsPage } from './pages/Workflow';
import { SchedulesPage } from './pages/Schedules';
import { WebhooksPage, ConnectionsPage, ApiUsagePage, PlatformFeaturesPage, ZohoAppsPage } from './pages/Developer';

export type SettingItem = {
  id: string;
  title: string;
  desc: string;
  keywords?: string;
  render: () => React.ReactNode;
};

export type CardEntry = SettingItem | { subhead: string };

export type SettingCard = {
  id: string;
  title: string;
  icon: React.ReactNode;
  tint: string;
  items: CardEntry[];
};

export type SettingGroup = { id: string; title: string; cards: SettingCard[] };

const svg = (path: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{path}</svg>
);

const I = {
  org: svg(<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />),
  users: svg(<><circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth={1.7} /><path d="M3.5 20c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5M16 4.5a3 3 0 010 7M17.5 15.7c2 .7 3.5 2 3.5 4.3" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" /></>),
  setup: svg(<><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.7} /><path d="M19 12a7 7 0 01-.4 2.3l2 1.6-2 3.4-2.4-.9a7 7 0 01-2 1.2L14 22h-4l-.2-2.4a7 7 0 01-2-1.2l-2.4.9-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.4-2.3l-2-1.6 2-3.4 2.4.9a7 7 0 012-1.2L10 2h4l.2 2.4a7 7 0 012 1.2l2.4-.9 2 3.4-2 1.6c.2.7.4 1.5.4 2.3z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" /></>),
  custom: svg(<path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />),
  auto: svg(<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />),
  general: svg(<path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />),
  purchases: svg(<path d="M5 8h14l-1.2 12H6.2L5 8zM8.5 8V6.5a3.5 3.5 0 017 0V8" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" />),
  modules: svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.7} /></>),
  plug: svg(<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 01-10 0V7zM12 16v5" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />),
  code: svg(<path d="M8 6l-5 6 5 6M16 6l5 6-5 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />),
};

const form = (storageKey: string, fields: Parameters<typeof SettingsForm>[0]['fields']) => () => (
  <SettingsForm storageKey={storageKey} fields={fields} />
);

const crud = (storageKey: string, columns: Parameters<typeof CrudList>[0]['columns'], addLabel: string, emptyText?: string) => () => (
  <CrudList storageKey={storageKey} columns={columns} addLabel={addLabel} emptyText={emptyText} />
);

const toggles = (storageKey: string, items: Parameters<typeof ToggleRows>[0]['items']) => () => (
  <ToggleRows storageKey={storageKey} items={items} />
);

const TERM_COLS = [{ id: 'name', label: 'Term Name', placeholder: 'e.g. Net 30' }];

export const GROUPS: SettingGroup[] = [
  {
    id: 'organization',
    title: 'Organization Settings',
    cards: [
      {
        id: 'organization', title: 'Organization', icon: I.org, tint: 'bg-emerald-50 text-emerald-600',
        items: [
          {
            id: 'profile', title: 'Profile', desc: 'Business name, industry and contact details',
            render: form('org.profile', [
              { id: 'name', label: 'Organization Name', type: 'text', placeholder: 'e.g. Galle Face Hotel Group' },
              { id: 'industry', label: 'Industry', type: 'select', options: ['Hospitality', 'Food & Beverage', 'Retail', 'Manufacturing', 'Healthcare', 'Education', 'Other'] },
              { id: 'email', label: 'Contact Email', type: 'text', placeholder: 'finance@company.com' },
              { id: 'phone', label: 'Phone', type: 'text', placeholder: '+94 11 123 4567' },
              { id: 'address', label: 'Address', type: 'textarea', rows: 3 },
            ]),
          },
          {
            id: 'branding', title: 'Branding', desc: 'Tagline, logo and primary color',
            render: form('org.branding', [
              { id: 'tagline', label: 'Tagline', type: 'text' },
              { id: 'logoUrl', label: 'Logo URL', type: 'text', placeholder: 'https://…', hint: 'Shown on sign-in and workspace when set.' },
              { id: 'primary', label: 'Primary Color', type: 'color' },
            ]),
          },
          {
            id: 'locations', title: 'Locations', desc: 'Warehouses, kitchens and delivery points',
            render: crud('org.locations', [
              { id: 'name', label: 'Location', placeholder: 'e.g. Main Kitchen' },
              { id: 'address', label: 'Address', placeholder: 'Optional' },
            ], 'Add Location'),
          },
          {
            id: 'ai-integration', title: 'AI Integration', desc: 'Provider keys and assistance toggles',
            render: form('org.ai', [
              { id: 'enabled', label: 'Enable AI assistance', type: 'checkbox', hint: 'Item suggestions and smart defaults across forms.' },
              { id: 'provider', label: 'Provider', type: 'select', options: ['', 'OpenAI', 'Anthropic', 'Google', 'Azure OpenAI', 'Local Model'] },
              { id: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Stored for this organization' },
            ]),
          },
          { id: 'subscription', title: 'Manage Subscription', desc: 'Plan, usage and billing', render: () => <SubscriptionPage /> },
        ],
      },
      {
        id: 'users-roles', title: 'Users & Roles', icon: I.users, tint: 'bg-rose-50 text-rose-600',
        items: [
          { id: 'users', title: 'Users', desc: 'Invite, edit and disable tenant users', render: () => <UsersPage /> },
          { id: 'roles', title: 'Roles', desc: 'Permission sets assignable to users', render: () => <RolesPage /> },
          {
            id: 'user-preferences', title: 'User Preferences', desc: 'Defaults for this device',
            keywords: 'theme density landing',
            render: () => <UserPrefsPage />,
          },
          { id: 'departments', title: 'Departments', desc: 'Cost groupings for users and budgets', render: crud('org.departments', [{ id: 'name', label: 'Department' }], 'Add Department') },
          { subhead: 'Taxes & Compliance' },
          {
            id: 'taxes', title: 'Taxes', desc: 'Tax types used on bills and credits',
            keywords: 'vat sscl tax rate',
            render: () => <TaxesPage />,
          },
        ],
      },
      {
        id: 'setup', title: 'Setup & Configurations', icon: I.setup, tint: 'bg-amber-50 text-amber-600',
        items: [
          {
            id: 'general', title: 'General', desc: 'Date format, timezone and week start',
            render: form('setup.general', [
              { id: 'dateFormat', label: 'Date Format', type: 'select', options: ['dd MMM yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'] },
              { id: 'timezone', label: 'Timezone', type: 'select', options: ['Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'UTC', 'Europe/London'] },
              { id: 'weekStart', label: 'Week Starts On', type: 'select', options: ['Monday', 'Sunday'] },
            ]),
          },
          { id: 'currencies', title: 'Currencies', desc: 'Base currency and exchange rates', render: () => <CurrenciesPage /> },
          { id: 'payment-terms', title: 'Payment Terms', desc: 'Terms offered on bills and orders', render: crud('setup.paymentTerms', TERM_COLS, 'Add Term') },
          {
            id: 'vendor-portal', title: 'Vendor Portal', desc: 'Supplier self-service access',
            render: form('setup.portal', [
              { id: 'enabled', label: 'Enable vendor portal', type: 'checkbox', hint: 'Vendors can view POs and submit quotes through shared links.' },
              { id: 'url', label: 'Portal URL', type: 'text', placeholder: 'https://portal.company.com' },
              { id: 'allowQuotes', label: 'Allow quote submission', type: 'checkbox' },
            ]),
          },
          {
            id: 'punchout', title: 'Punchout Catalogs', desc: 'Supplier catalog connections',
            render: form('setup.punchout', [
              { id: 'enabled', label: 'Enable punchout', type: 'checkbox' },
              { id: 'supplier', label: 'Supplier', type: 'text', placeholder: 'e.g. Sysco' },
              { id: 'url', label: 'Catalog URL', type: 'text', placeholder: 'https://…' },
            ]),
          },
        ],
      },
      {
        id: 'customization', title: 'Customization', icon: I.custom, tint: 'bg-orange-50 text-orange-600',
        items: [
          { id: 'number-series', title: 'Transaction Number Series', desc: 'Prefixes and counters for bills and POs', keywords: 'prefix numbering bill po', render: () => <NumberSeriesPage /> },
          {
            id: 'pdf-templates', title: 'PDF Templates', desc: 'Document template for bills and orders',
            render: form('custom.pdf', [
              { id: 'template', label: 'Active Template', type: 'select', options: ['Standard Template', 'Modern Template', 'Classic Template'], hint: 'Shown in the footer of the New Bill form.' },
            ]),
          },
          {
            id: 'email-notifications', title: 'Email Notifications', desc: 'Which events notify the team',
            render: toggles('custom.notifications', [
              { id: 'billSubmitted', label: 'Bill submitted', desc: 'A draft bill moves to pending approval.' },
              { id: 'billApproved', label: 'Bill approved', desc: 'A pending bill becomes open.' },
              { id: 'billOverdue', label: 'Bill overdue', desc: 'An open bill passes its due date.' },
              { id: 'paymentMade', label: 'Payment recorded', desc: 'Any payment lands on a bill.' },
              { id: 'poIssued', label: 'PO issued', desc: 'A purchase order is sent to the vendor.' },
              { id: 'creditApplied', label: 'Credit applied', desc: 'A vendor credit offsets a bill.' },
              { id: 'batchProcessed', label: 'Batch processed', desc: 'A payment batch finishes.' },
            ]),
          },
          { id: 'reporting-tags', title: 'Reporting Tags', desc: 'Labels for filtering budgets and bills', render: crud('custom.tags', [{ id: 'name', label: 'Tag' }], 'Add Tag') },
          {
            id: 'web-tabs', title: 'Web Tabs', desc: 'External links pinned to the sidebar',
            render: crud('custom.webtabs', [
              { id: 'label', label: 'Label', placeholder: 'e.g. Supplier Portal' },
              { id: 'url', label: 'URL', placeholder: 'https://…' },
            ], 'Add Web Tab'),
          },
        ],
      },
      {
        id: 'automation', title: 'Automation', icon: I.auto, tint: 'bg-rose-50 text-rose-600',
        items: [
          { id: 'workflow-rules', title: 'Workflow Rules', desc: 'Block or notify on bill events', keywords: 'approval limit block', render: () => <WorkflowRulesPage /> },
          { id: 'workflow-actions', title: 'Workflow Actions', desc: 'Actions rules are allowed to take', render: () => <WorkflowActionsPage /> },
          { id: 'workflow-logs', title: 'Workflow Logs', desc: 'Automation activity history', render: () => <WorkflowLogsPage /> },
          { id: 'schedules', title: 'Schedules', desc: 'Recurring bill schedules, live', keywords: 'recurring cron run', render: () => <SchedulesPage /> },
        ],
      },
    ],
  },
  {
    id: 'modules',
    title: 'Module Settings',
    cards: [
      {
        id: 'general', title: 'General', icon: I.general, tint: 'bg-emerald-50 text-emerald-600',
        items: [
          { id: 'mod-vendors', title: 'Vendors', desc: 'Defaults for the Vendors module', render: () => <ModulePrefs mod="vendors" title="Vendors" path="/workspace/vendors" /> },
          { id: 'mod-projects', title: 'Projects', desc: 'Project / cost-center list', render: crud('setup.projects', [{ id: 'name', label: 'Project' }, { id: 'code', label: 'Code' }], 'Add Project') },
          { id: 'mod-items', title: 'Items', desc: 'Defaults for the Items module', render: () => <ModulePrefs mod="items" title="Items" path="/workspace/items" /> },
          { id: 'mod-accounts', title: 'Chart of Accounts', desc: 'Ledger accounts on bill lines', keywords: 'ledger account codes', render: () => <AccountsPage /> },
          { id: 'mod-customers', title: 'Customers', desc: 'Customer directory for bill lines', render: crud('setup.customers', [{ id: 'name', label: 'Customer' }, { id: 'email', label: 'Email' }], 'Add Customer') },
        ],
      },
      {
        id: 'purchases', title: 'Purchases', icon: I.purchases, tint: 'bg-emerald-50 text-emerald-600',
        items: [
          { id: 'mod-pr', title: 'Purchase Requests', desc: 'Request defaults and policies', render: () => <ModulePrefs mod="pr" title="Purchase Requests" path="/workspace/pr" /> },
          { id: 'mod-rfq', title: 'Request for Quotes', desc: 'RFQ defaults and policies', render: () => <ModulePrefs mod="rfq" title="Request for Quotes" path="/workspace/rfq" /> },
          { id: 'mod-po', title: 'Purchase Orders', desc: 'Order defaults and policies', render: () => <ModulePrefs mod="po" title="Purchase Orders" path="/workspace/po" /> },
          { id: 'mod-receives', title: 'Purchase Receives', desc: 'GRN defaults and policies', render: () => <ModulePrefs mod="receives" title="Purchase Receives" path="/workspace/receives" /> },
          { id: 'mod-bills', title: 'Bills', desc: 'Bill defaults and policies', render: () => <ModulePrefs mod="bills" title="Bills" path="/workspace/bills" /> },
          { id: 'mod-recurring', title: 'Recurring Bills', desc: 'Schedule defaults', render: () => <ModulePrefs mod="recurring" title="Recurring Bills" path="/workspace/recurring" /> },
          { id: 'mod-payments', title: 'Payments Made', desc: 'Payment defaults', render: () => <ModulePrefs mod="payments" title="Payments Made" path="/workspace/payments" /> },
          { id: 'mod-batch', title: 'Batch Payments', desc: 'Batch defaults', render: () => <ModulePrefs mod="batch" title="Batch Payments" path="/workspace/batch" /> },
          { id: 'mod-credits', title: 'Vendor Credits', desc: 'Credit defaults', render: () => <ModulePrefs mod="credits" title="Vendor Credits" path="/workspace/credits" /> },
        ],
      },
      {
        id: 'custom-modules', title: 'Custom Modules', icon: I.modules, tint: 'bg-indigo-50 text-indigo-600',
        items: [
          { id: 'custom-overview', title: 'Overview', desc: 'Every module in this workspace', render: () => <CustomModulesOverview /> },
        ],
      },
    ],
  },
  {
    id: 'extensions',
    title: 'Extension and Developer Data',
    cards: [
      {
        id: 'integrations', title: 'Integrations', icon: I.plug, tint: 'bg-teal-50 text-teal-600',
        items: [
          {
            id: 'zoho-apps', title: 'Zoho Apps', desc: 'Connect the Zoho suite',
            keywords: 'zoho suite connect client id',
            render: () => <ZohoAppsPage />,
          },
        ],
      },
      {
        id: 'developer', title: 'Developer Data', icon: I.code, tint: 'bg-orange-50 text-orange-600',
        items: [
          { id: 'dev-webhooks', title: 'Incoming Webhooks', desc: 'HTTP hooks with live ping test', keywords: 'webhook endpoint test', render: () => <WebhooksPage /> },
          { id: 'dev-connections', title: 'Connections', desc: 'External service connections', render: () => <ConnectionsPage /> },
          { id: 'dev-api', title: 'API Usage', desc: 'Endpoint catalog and session calls', keywords: 'api endpoints calls', render: () => <ApiUsagePage /> },
          { id: 'dev-platform', title: 'Platform Features', desc: 'Widgets, signals, forms and data tools', keywords: 'widgets signals deluge web forms data management', render: () => <PlatformFeaturesPage /> },
        ],
      },
    ],
  },
];

export function findItem(pageId: string) {
  for (const g of GROUPS) {
    for (const c of g.cards) {
      for (const e of c.items) {
        if (!('subhead' in e) && e.id === pageId) return { item: e as SettingItem, group: g, card: c };
      }
    }
  }
  return null;
}

export function allSearchable() {
  const out: { id: string; title: string; desc: string; group: string; hay: string }[] = [];
  for (const g of GROUPS) {
    for (const c of g.cards) {
      for (const e of c.items) {
        if ('subhead' in e) continue;
        const item = e as SettingItem;
        out.push({
          id: item.id, title: item.title, desc: item.desc, group: g.title,
          hay: `${item.title} ${item.desc} ${item.keywords || ''} ${c.title} ${g.title}`.toLowerCase(),
        });
      }
    }
  }
  return out;
}
