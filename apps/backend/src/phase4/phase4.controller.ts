import { Controller, Get, Post, Param, Body, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { BillsController } from '../procurement/procurement.controller';

function advance(date: Date, freq: string): Date {
  const d = new Date(date);
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly default
  return d;
}

// ── Recurring bills (ERPNext auto_repeat-lite) ──

@Controller('api/v1/recurrence')
@UseGuards(AuthGuard('jwt'))
export class RecurrenceController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  list() {
    return this.tenant.client.billRecurrence.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post()
  async create(@Body() dto: {
    templateBillId: string; profileName: string; frequency?: string; startDate?: string; endDate?: string;
  }, @Req() req: any) {
    if (!dto.profileName?.trim()) throw new BadRequestException('Profile name is required');
    const tpl = await this.tenant.client.bill.findFirst({
      where: { id: dto.templateBillId }, include: { lines: true },
    });
    if (!tpl) throw new NotFoundException('Template bill not found');
    const freq = ['weekly', 'monthly', 'quarterly', 'yearly'].includes(dto.frequency || '') ? dto.frequency! : 'monthly';
    const start = dto.startDate ? new Date(dto.startDate) : new Date();
    return this.tenant.client.billRecurrence.create({
      data: {
        tenantId: req.user.tenantId, templateBillId: tpl.id, profileName: dto.profileName.trim(),
        frequency: freq, startDate: start, endDate: dto.endDate ? new Date(dto.endDate) : null,
        nextRunDate: start, status: 'active',
      },
    });
  }

  @Post(':id/run')
  async run(@Param('id') id: string, @Req() req: any) {
    const rec: any = await this.tenant.client.billRecurrence.findFirst({ where: { id } });
    if (!rec) throw new NotFoundException('Recurrence not found');
    if (rec.disabled || rec.status !== 'active') throw new BadRequestException('Recurrence is not active');
    if (new Date(rec.nextRunDate) > new Date()) throw new BadRequestException('Not due yet');
    if (rec.endDate && new Date(rec.nextRunDate) > new Date(rec.endDate)) {
      await this.tenant.client.billRecurrence.updateMany({ where: { id }, data: { status: 'completed' } });
      throw new BadRequestException('Schedule has ended');
    }
    const tpl: any = await this.tenant.client.bill.findFirst({
      where: { id: rec.templateBillId }, include: { lines: true },
    });
    if (!tpl) throw new NotFoundException('Template bill missing');
    const count = await this.tenant.client.bill.count();
    const child = await this.tenant.client.bill.create({
      data: {
        tenantId: req.user.tenantId,
        billNumber: `BILL-${String(count + 1).padStart(4, '0')}`,
        vendorId: tpl.vendorId || null, vendorName: tpl.vendorName || '',
        issueDate: new Date(), dueDate: tpl.dueDate || null,
        notes: `Recurring "${rec.profileName}"`,
        createdBy: req.user.userId, status: 'draft',
      },
    });
    for (const l of (tpl.lines as any[]) || []) {
      await this.tenant.client.billLine.create({
        data: {
          tenantId: req.user.tenantId, billId: child.id,
          itemName: l.itemName, quantity: l.quantity, rate: l.rate,
        },
      });
    }
    const next = advance(new Date(rec.nextRunDate), rec.frequency);
    const done = rec.endDate && next > new Date(rec.endDate);
    await this.tenant.client.billRecurrence.updateMany({
      where: { id }, data: { nextRunDate: next, status: done ? 'completed' : 'active' },
    });
    return this.tenant.client.bill.findFirst({ where: { id: child.id }, include: { lines: true } });
  }

  @Post(':id/disable')
  async disable(@Param('id') id: string) {
    await this.tenant.client.billRecurrence.updateMany({ where: { id }, data: { disabled: true, status: 'disabled' } });
    return this.tenant.client.billRecurrence.findFirst({ where: { id } });
  }
}

// ── Payment batches (draft → processed) ──

@Controller('api/v1/batches')
@UseGuards(AuthGuard('jwt'))
export class BatchesController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  list() {
    return this.tenant.client.paymentBatch.findMany({
      include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Post()
  async create(@Body() dto: {
    batchName?: string; paidThrough?: string; paymentDate?: string; reference?: string;
    lines: { billId: string; amount: number }[];
  }, @Req() req: any) {
    if (!dto.lines?.length) throw new BadRequestException('Add at least one bill');
    for (const l of dto.lines) {
      if (!(l.amount > 0)) throw new BadRequestException('Each line amount must be > 0');
      const b = await this.tenant.client.bill.findFirst({ where: { id: l.billId } });
      if (!b) throw new BadRequestException('Unknown bill in batch');
    }
    const batch = await this.tenant.client.paymentBatch.create({
      data: {
        tenantId: req.user.tenantId,
        batchNumber: `BATCH-${String(await this.tenant.client.paymentBatch.count() + 1).padStart(4, '0')}`,
        batchName: dto.batchName?.trim() || null,
        paidThrough: dto.paidThrough?.trim() || null,
        paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : null,
        reference: dto.reference?.trim() || null,
        createdBy: req.user.userId, status: 'draft',
      },
    });
    for (const l of dto.lines) {
      await this.tenant.client.paymentBatchLine.create({
        data: { tenantId: req.user.tenantId, batchId: batch.id, billId: l.billId, amount: l.amount },
      });
    }
    return this.tenant.client.paymentBatch.findFirst({ where: { id: batch.id }, include: { lines: true } });
  }

  @Post(':id/process')
  async process(@Param('id') id: string, @Req() req: any) {
    const batch: any = await this.tenant.client.paymentBatch.findFirst({
      where: { id }, include: { lines: true },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (!['draft', 'partially_processed', 'failed'].includes(batch.status)) throw new BadRequestException(`Batch is ${batch.status}`);
    const bills = new BillsController(this.tenant);
    let failed = 0;
    let paidNow = 0;
    const open = (batch.lines as any[]).filter((x) => x.status !== 'paid');
    for (const l of open) {
      try {
        await (bills as any).pay(l.billId, {
          amount: l.amount, method: 'Batch', reference: batch.batchNumber,
        }, { user: req.user });
        paidNow++;
        await this.tenant.client.paymentBatchLine.updateMany({ where: { id: l.id }, data: { status: 'paid' } });
      } catch {
        failed++;
        await this.tenant.client.paymentBatchLine.updateMany({ where: { id: l.id }, data: { status: 'failed' } });
      }
    }
    const previouslyPaid = (batch.lines as any[]).filter((x) => x.status === 'paid').length;
    const status = failed === 0 ? 'processed' : (previouslyPaid + paidNow === 0 ? 'failed' : 'partially_processed');
    await this.tenant.client.paymentBatch.updateMany({ where: { id }, data: { status } });
    return this.tenant.client.paymentBatch.findFirst({ where: { id }, include: { lines: true } });
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const batch: any = await this.tenant.client.paymentBatch.findFirst({ where: { id } });
    if (!batch) throw new NotFoundException('Batch not found');
    if (batch.status !== 'draft') throw new BadRequestException('Only draft batches can be cancelled');
    await this.tenant.client.paymentBatch.updateMany({ where: { id }, data: { status: 'cancelled' } });
    return this.tenant.client.paymentBatch.findFirst({ where: { id }, include: { lines: true } });
  }
}

// ── Multi-bill vendor payment (one tender, ERPNext-style allocation) ──

@Controller('api/v1/payments')
@UseGuards(AuthGuard('jwt'))
export class MultiPayController {
  constructor(private tenant: TenantPrismaService) {}

  @Post('multi')
  async multi(@Body() dto: {
    vendorName?: string; method?: string; reference?: string;
    lines: { billId: string; amount: number }[];
  }, @Req() req: any) {
    if (!dto.lines?.length) throw new BadRequestException('Add at least one bill allocation');
    const bills = new BillsController(this.tenant);
    const results = [];
    for (const l of dto.lines) {
      if (!(l.amount > 0)) throw new BadRequestException('Each allocation must be > 0');
      const target: any = await (bills as any).one(l.billId);
      if (dto.vendorName && (target.vendorName || '').toLowerCase() !== dto.vendorName.toLowerCase()) {
        throw new BadRequestException(`Bill ${target.billNumber} belongs to ${target.vendorName}`);
      }
      const r = await (bills as any).pay(l.billId, {
        amount: l.amount, method: dto.method || 'Manual', reference: dto.reference,
      }, { user: req.user });
      results.push({ billId: l.billId, applied: r.applied, excess: r.excess });
    }
    return { results };
  }
}
