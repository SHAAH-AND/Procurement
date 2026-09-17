import { ListPage } from '../shared/components';
import { getOrders } from '../../../api';

export function AnalyticsPage() { return <ListPage title="Analytics" fetchFn={getOrders} hint="Spend reports and procurement analytics live here." />; }
