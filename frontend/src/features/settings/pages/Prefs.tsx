import { useState } from 'react';
import { CrudList, INPUT } from '../blocks';

// ── Device-local preferences (no backend round-trip needed) ──

const PREF_KEY = 'pf-user-prefs';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return {
      landing: o.landing || '/workspace',
      billsView: o.billsView || 'all',
      compact: !!o.compact,
      confirmDelete: o.confirmDelete !== false,
    };
  } catch {
    return { landing: '/workspace', billsView: 'all', compact: false, confirmDelete: true };
  }
}

export function UserPrefsPage() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [msg, setMsg] = useState('');

  const save = () => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      setMsg('Saved on this device.');
    } catch {
      setMsg('Save failed.');
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Landing Page</label>
        <select
          value={prefs.landing}
          onChange={(e) => setPrefs({ ...prefs, landing: e.target.value })}
          className={`${INPUT} w-full max-w-md mt-1.5`}
        >
          <option value="/workspace">My Home</option>
          <option value="/workspace/bills">Bills</option>
          <option value="/workspace/po">Purchase Orders</option>
          <option value="/workspace/analytics">Reports Center</option>
        </select>
        <p className="text-xs text-slate-400 mt-1">Applies after the next sign-in on this device.</p>
      </div>
      <div>
        <label className="text-[13px] font-medium text-slate-800 block">Default Bills View</label>
        <select
          value={prefs.billsView}
          onChange={(e) => setPrefs({ ...prefs, billsView: e.target.value })}
          className={`${INPUT} w-full max-w-md mt-1.5`}
        >
          <option value="all">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="draft">Draft</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      <label className="flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer">
        <input
          type="checkbox" checked={prefs.compact}
          onChange={(e) => setPrefs({ ...prefs, compact: e.target.checked })}
          className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]"
        />
        Compact tables
      </label>
      <label className="flex items-center gap-2.5 text-[13px] text-slate-800 cursor-pointer">
        <input
          type="checkbox" checked={prefs.confirmDelete}
          onChange={(e) => setPrefs({ ...prefs, confirmDelete: e.target.checked })}
          className="w-4 h-4 rounded border-slate-300 text-[#2084FA] focus:ring-[#2084FA]"
        />
        Confirm before delete
      </label>
      <div className="flex items-center gap-3">
        <button onClick={save} className="px-5 h-9 rounded-md bg-[#2084FA] text-white text-[13px] font-semibold hover:bg-[#1a6fd6] shadow-sm">
          Save Changes
        </button>
        {msg && <span className="text-[13px] text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}

export function TaxesPage() {
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-4 max-w-2xl">
        These taxes appear in the Tax dropdown on New Bill and New Recurring Bill. Rates are percentages.
      </p>
      <CrudList
        storageKey="setup.taxes"
        columns={[
          { id: 'name', label: 'Name', placeholder: 'e.g. VAT 18%' },
          { id: 'rate', label: 'Rate %', type: 'number' },
          { id: 'code', label: 'Code', placeholder: 'e.g. VAT18' },
        ]}
        addLabel="Add Tax"
      />
    </div>
  );
}

export function AccountsPage() {
  return (
    <div>
      <p className="text-[13px] text-slate-500 mb-4 max-w-2xl">
        These accounts appear in the Account dropdown on bill item lines.
      </p>
      <CrudList
        storageKey="setup.accounts"
        columns={[{ id: 'name', label: 'Account', placeholder: 'e.g. Travel Expense' }]}
        addLabel="Add Account"
      />
    </div>
  );
}
