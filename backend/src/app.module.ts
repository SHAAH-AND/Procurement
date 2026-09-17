import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './users/users.controller';
import { WorkspaceController } from './workspace/workspace.controller';
import { ItemsController } from './items/items.controller';
import { VendorsController } from './vendors/vendors.controller';
import { PrsController } from './prs/prs.controller';
import { PosController, ReceivesController, BillsController, CreditsController, PaymentsController } from './procurement/procurement.controller';
import { RfqsController, PortalController, AwardsController } from './rfq/rfq.controller';
import { RecurrenceController, BatchesController, MultiPayController } from './phase4/phase4.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { TenantPrismaService } from './prisma/tenant-prisma.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, WorkspaceController, ItemsController, VendorsController, PrsController, PosController, ReceivesController, BillsController, CreditsController, PaymentsController, RfqsController, PortalController, AwardsController, RecurrenceController, BatchesController, MultiPayController, DashboardController],
  providers: [TenantPrismaService],
})
export class AppModule {}
