import { ListPage } from '../shared/components';
import { getOrders } from '../../../api';

export function BudgetsPage() { return <ListPage title="Budgets" fetchFn={getOrders} hint="Cost centres and department budgets live here." />; }
