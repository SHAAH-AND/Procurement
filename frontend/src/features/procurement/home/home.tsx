import { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getMyPrs, getPendingPrs } from '../../../api';

export function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [myPrsCount, setMyPrsCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    Promise.all([
      getMyPrs().then(r => Array.isArray(r) ? r.length : r?.data?.length || 0).catch(() => 0),
      getPendingPrs().then(r => Array.isArray(r) ? r.length : r?.data?.length || 0).catch(() => 0),
    ]).then(([myCount, pendingCount]) => {
      setMyPrsCount(myCount);
      setPendingApprovalsCount(pendingCount);
      setLoading(false);
    });
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="w-12 h-12 border-3 border-[#2084FA] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const stats = [
    { label: 'My Requests', count: myPrsCount, icon: '📋', href: '/workspace/my-requests', color: 'bg-blue-100 text-blue-700' },
    { label: 'Pending Approvals', count: pendingApprovalsCount, icon: '✅', href: '/workspace/approvals', color: 'bg-amber-100 text-amber-700' },
    { label: 'Items', count: 0, icon: '📦', href: '/workspace/items', color: 'bg-green-100 text-green-700' },
    { label: 'Vendors', count: 0, icon: '🏪', href: '/workspace/vendors', color: 'bg-purple-100 text-purple-700' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome back, {user?.name || user?.email || 'User'}</h1>
        <p className="text-slate-500 mt-1">Here's what's happening with your procurement today.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <a
            key={stat.label}
            href={stat.href}
            className="rounded-2xl bg-white border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition-all duration-200 flex items-center gap-4"
          >
            <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center text-2xl`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-sm text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.count}</p>
            </div>
          </a>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Create Purchase Request', href: '/workspace/my-requests?new=1', icon: '➕', color: 'bg-blue-100 text-blue-700 border-blue-200' },
            { label: 'Add New Vendor', href: '/workspace/vendors?new=1', icon: '🏪', color: 'bg-purple-100 text-purple-700 border-purple-200' },
            { label: 'Add New Item', href: '/workspace/items?new=1', icon: '📦', color: 'bg-green-100 text-green-700 border-green-200' },
            { label: 'Create RFQ', href: '/workspace/rfq?new=1', icon: '📋', color: 'bg-amber-100 text-amber-700 border-amber-200' },
          ].map((action) => (
            <a
              key={action.label}
              href={action.href}
              className={`rounded-xl border p-4 flex items-center gap-3 hover:shadow-md transition-all duration-200 ${action.color}`}
            >
              <span className="text-2xl">{action.icon}</span>
              <span className="font-medium text-sm">{action.label}</span>
            </a>
          ))}
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        <div className="text-center py-8 text-slate-500">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-3 text-slate-300">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <p>No recent activity. Create a request or approve a PR to get started.</p>
        </div>
      </div>
    </div>
  );
}