import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import Landing from './Landing';
import SignInPage from './pages/SignIn';
import SignUpPage from './pages/SignUp';
import { Workspace } from './features/workspace/Workspace';
import { RequestsPage, ApprovalsPage, ItemsPage, VendorsPage, PrPage, RfqPage, PoPage, ReceivesPage, InboxPage, BillsPage, RecurringBillsPage, PaymentsPage, VendorCreditsPage, BudgetsPage, AnalyticsPage, BatchPaymentsPage, PortalRfqPage } from './features/procurement';
import { RfqDetailPage } from './features/procurement/rfq/detail/detail';
import { PoCreatePage } from './features/procurement/po/create/create';
import { ReceiveCreatePage } from './features/procurement/receive/create/create';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/workspace" element={<Workspace />}>
          <Route index element={<div />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="my-requests" element={<RequestsPage />} />
          <Route path="approvals" element={<ApprovalsPage />} />
          <Route path="items" element={<ItemsPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="pr" element={<PrPage />} />
          <Route path="rfq" element={<RfqPage />} />
          <Route path="rfq/:id" element={<RfqDetailPage />} />
          <Route path="po" element={<PoPage />} />
          <Route path="po/new" element={<PoCreatePage />} />
          <Route path="receives" element={<ReceivesPage />} />
          <Route path="receives/new" element={<ReceiveCreatePage />} />
          <Route path="inbox" element={<InboxPage />} />
          <Route path="bills" element={<BillsPage />} />
          <Route path="recurring" element={<RecurringBillsPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="batch" element={<BatchPaymentsPage />} />
          <Route path="credits" element={<VendorCreditsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
        <Route path="/portal/rfq/:token" element={<PortalRfqPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
