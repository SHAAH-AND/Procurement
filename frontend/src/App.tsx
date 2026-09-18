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
import { BillCreatePage, BillEditPage } from './features/procurement/bill/create/create';
import { RecurringBillCreatePage, RecurringBillEditPage } from './features/procurement/recurring/create/create';
import { RecordPaymentPage } from './features/procurement/payment/create/create';
import { VendorCreditCreatePage } from './features/procurement/credit/create/create';
import { BudgetCreatePage, BudgetEditPage } from './features/procurement/budget/create/create';
import { ReportDetailPage } from './features/procurement/analytics/detail/detail';
import { SettingsPage } from './features/settings/SettingsPage';
import { SettingDetailPage } from './features/settings/SettingDetail';
import { CustomModuleRecordsPage } from './features/settings/pages/CustomModules';

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
          <Route path="bills/new" element={<BillCreatePage />} />
          <Route path="bills/:id/edit" element={<BillEditPage />} />
          <Route path="recurring" element={<RecurringBillsPage />} />
          <Route path="recurring/new" element={<RecurringBillCreatePage />} />
          <Route path="recurring/:id/edit" element={<RecurringBillEditPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="payments/new" element={<RecordPaymentPage />} />
          <Route path="batch" element={<BatchPaymentsPage />} />
          <Route path="credits" element={<VendorCreditsPage />} />
          <Route path="credits/new" element={<VendorCreditCreatePage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="budgets/new" element={<BudgetCreatePage />} />
          <Route path="budgets/:id/edit" element={<BudgetEditPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="analytics/:id" element={<ReportDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:pageId" element={<SettingDetailPage />} />
          <Route path="custom/:moduleId" element={<CustomModuleRecordsPage />} />
        </Route>
        <Route path="/portal/rfq/:token" element={<PortalRfqPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
