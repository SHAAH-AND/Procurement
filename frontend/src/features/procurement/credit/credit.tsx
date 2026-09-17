import { ListPage } from '../shared/components';
import { getCredits } from '../../../api';

export function VendorCreditsPage() { return <ListPage title="Vendor Credits" fetchFn={getCredits} hint="Credit notes and vendor adjustments." />; }