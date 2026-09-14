import { Controller, Get, Post, Param, Body, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IsString, IsOptional, IsNumber, IsArray, Min, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

// ── shared ──
async function nextNumber(client: any, model: string, prefix: string): Promise<string> {
  const count = await client[model].count();
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export class DocLineDto {
  @IsOptional() @IsString() poLineId?: string;
  @IsOptional() @IsString() prLineId?: string;
  @IsOptional() @IsString() itemId?: string;
  @IsString() itemName!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
}

// ── Purchase Orders (ERPNext-aligned: per-line received/billed qtys) ──

@Controller('api/v1/pos')
@UseGuards(AuthGuard('jwt'))
export class PosController {
  constructor(private tenant: TenantPrismaService) {}

  private async one(id: string) {
    const po = await this.tenant.client.purchaseOrder.findFirst({
      where: { id },
      include: { lines: true, receives: { include: { lines: true } }, bills: { include: { lines: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async recompute(id: string) {
    const po = await this.one(id);
    if (['draft', 'pending', 'cancelled', 'closed'].includes(po.status)) return po;
    const lines = po.lines as any[];
    const allBilled = lines.length > 0 && lines.every((l) => (l.billedQty || 0) >= (l.quantity || 0) - 1e-9);
    const anyBilled = lines.some((l) => (l.billedQty || 0) > 1e-9);
    const allReceived = lines.length > 0 && lines.every((l) => (l.receivedQty || 0) >= (l.quantity || 0) - 1e-9);
    const anyReceived = lines.some((l) => (l.receivedQty || 0) > 1e-9);
    let status = po.status;
    if (allBilled) status = 'billed';
    else if (anyBilled) status = 'partially_billed';
    else if (allReceived) status = 'received';
    else if (anyReceived) status = 'partially_received';
    if (status !== po.status) {
      await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status } });
      return this.one(id);
    }
    return po;
  }

  @Get()
  list() {
    return this.tenant.client.purchaseOrder.findMany({
      include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.one(id);
  }

  @Post()
  async create(@Body() dto: { vendorId?: string; vendorName?: string; expectedDate?: string; notes?: string; lines: DocLineDto[] }, @Req() req: any) {
    if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
    const po = await this.tenant.client.purchaseOrder.create({
      data: {
        tenantId: req.user.tenantId,
        poNumber: await nextNumber(this.tenant.client, 'purchaseOrder', 'PO'),
        vendorId: dto.vendorId || null,
        vendorName: dto.vendorName?.trim() || '',
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes?.trim() || null,
        createdBy: req.user.userId,
        status: 'draft',
      },
    });
    for (const l of dto.lines) {
      if (!l.itemName?.trim()) throw new BadRequestException('Each line needs an item name');
      await this.tenant.client.purchaseOrderLine.create({
        data: {
          tenantId: req.user.tenantId, poId: po.id, itemId: l.itemId || null,
          itemName: l.itemName.trim(), category: l.category || 'Other',
          description: l.description?.trim() || null,
          quantity: l.quantity ?? 1, rate: l.rate ?? 0,
        },
      });
    }
    return this.one(po.id);
  }

  @Post('from-pr')
  async fromPr(@Body() dto: { prId: string; lineIds?: string[]; vendorId?: string; vendorName?: string }, @Req() req: any) {
    const pr = await this.tenant.client.purchaseRequest.findFirst({
      where: { id: dto.prId }, include: { lines: true },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    if (pr.status !== 'approved') throw new BadRequestException('Only approved requests can be converted');
    const lines = (pr.lines as any[]).filter((l) => !dto.lineIds?.length || dto.lineIds.includes(l.id));
    if (!lines.length) throw new BadRequestException('Select at least one line to convert');
    const po = await this.tenant.client.purchaseOrder.create({
      data: {
        tenantId: req.user.tenantId,
        poNumber: await nextNumber(this.tenant.client, 'purchaseOrder', 'PO'),
        vendorId: dto.vendorId || null,
        vendorName: dto.vendorName?.trim() || '',
        sourcePrId: pr.id,
        expectedDate: pr.expectedDate || null,
        notes: pr.reason || null,
        createdBy: req.user.userId,
        status: 'draft',
      },
    });
    for (const l of lines) {
      await this.tenant.client.purchaseOrderLine.create({
        data: {
          tenantId: req.user.tenantId, poId: po.id, prLineId: l.id,
          itemName: l.itemName, category: l.category || 'Other',
          description: l.description || null,
          quantity: l.quantity, rate: l.estimatedRate ?? 0,
        },
      });
    }
    await this.tenant.client.purchaseRequest.updateMany({ where: { id: pr.id }, data: { status: 'processed' } });
    return this.one(po.id);
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string) {
    const po = await this.one(id);
    if (po.status !== 'draft') throw new BadRequestException(`Cannot submit a ${po.status} order`);
    await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status: 'pending' } });
    return this.one(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    const po = await this.one(id);
    if (po.status !== 'pending') throw new BadRequestException(`Cannot approve a ${po.status} order`);
    await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status: 'approved' } });
    return this.one(id);
  }

  @Post(':id/issue')
  async issue(@Param('id') id: string) {
    const po = await this.one(id);
    if (!['approved', 'draft'].includes(po.status)) throw new BadRequestException(`Cannot issue a ${po.status} order`);
    if (!po.vendorName) throw new BadRequestException('Set a vendor before issuing');
    await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status: 'issued' } });
    return this.one(id);
  }

  @Post(':id/close')
  async close(@Param('id') id: string) {
    const po = await this.one(id);
    if (po.status === 'cancelled') throw new BadRequestException('Order is cancelled');
    await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status: 'closed' } });
    return this.one(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const po = await this.one(id);
    if (['billed', 'closed', 'cancelled'].includes(po.status)) throw new BadRequestException(`Cannot cancel a ${po.status} order`);
    await this.tenant.client.purchaseOrder.updateMany({ where: { id }, data: { status: 'cancelled' } });
    return this.one(id);
  }
}

// ── Purchase Receives / GRN ──

@Controller('api/v1/receives')
@UseGuards(AuthGuard('jwt'))
export class ReceivesController {
  constructor(private tenant: TenantPrismaService) {}

  private async one(id: string) {
    const r = await this.tenant.client.purchaseReceive.findFirst({
      where: { id }, include: { lines: true, po: { include: { lines: true } } },
    });
    if (!r) throw new NotFoundException('Receive not found');
    return r;
  }

  @Get()
  list() {
    return this.tenant.client.purchaseReceive.findMany({
      include: { lines: true, po: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.one(id);
  }

  @Post('from-po')
  async fromPo(@Body() dto: { poId: string; lines: { poLineId: string; quantity: number }[]; notes?: string }, @Req() req: any) {
    const po = await this.tenant.client.purchaseOrder.findFirst({
      where: { id: dto.poId }, include: { lines: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['issued', 'approved', 'partially_received', 'received', 'partially_billed'].includes(po.status)) {
      throw new BadRequestException(`Cannot receive against a ${po.status} order`);
    }
    if (!dto.lines?.length) throw new BadRequestException('Add at least one line');
    const poLines = po.lines as any[];
    for (const l of dto.lines) {
      const pl = poLines.find((p) => p.id === l.poLineId);
      if (!pl) throw new BadRequestException('Unknown PO line');
      const remaining = (pl.quantity || 0) - (pl.receivedQty || 0);
      if (l.quantity <= 0 || l.quantity > remaining + 1e-9) {
        throw new BadRequestException(`"${pl.itemName}": only ${remaining} still open`);
      }
    }
    const grn = await this.tenant.client.purchaseReceive.create({
      data: {
        tenantId: req.user.tenantId,
        grnNumber: await nextNumber(this.tenant.client, 'purchaseReceive', 'GRN'),
        poId: po.id, notes: dto.notes?.trim() || null,
        createdBy: req.user.userId, status: 'draft',
      },
    });
    for (const l of dto.lines) {
      const pl = poLines.find((p) => p.id === l.poLineId);
      await this.tenant.client.purchaseReceiveLine.create({
        data: { tenantId: req.user.tenantId, receiveId: grn.id, poLineId: l.poLineId, itemName: pl.itemName, quantity: l.quantity },
      });
    }
    return this.one(grn.id);
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    const grn = await this.one(id);
    if (grn.status !== 'draft') throw new BadRequestException(`Cannot complete a ${grn.status} receive`);
    for (const l of grn.lines as any[]) {
      const pl = await this.tenant.client.purchaseOrderLine.findFirst({ where: { id: l.poLineId } });
      if (!pl) continue;
      await this.tenant.client.purchaseOrderLine.updateMany({
        where: { id: l.poLineId }, data: { receivedQty: (pl.receivedQty || 0) + l.quantity },
      });
    }
    await this.tenant.client.purchaseReceive.updateMany({
      where: { id }, data: { status: 'completed', receivedAt: new Date() },
    });
    // recompute PO progress
    const poCtl = new PosController(this.tenant);
    await poCtl.recompute(grn.poId);
    return this.one(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const grn = await this.one(id);
    if (grn.status !== 'draft') throw new BadRequestException('Only draft receives can be cancelled');
    await this.tenant.client.purchaseReceive.updateMany({ where: { id }, data: { status: 'cancelled' } });
    return this.one(id);
  }
}

// ── Bills (3-way match + payments + credits) ──

function billTotal(bill: any): number {
  return (bill.lines || []).reduce((s: number, l: any) => s + (l.quantity || 0) * (l.rate || 0), 0);
}

@Controller('api/v1/bills')
@UseGuards(AuthGuard('jwt'))
export class BillsController {
  constructor(private tenant: TenantPrismaService) {}

  private async one(id: string) {
    const b = await this.tenant.client.bill.findFirst({
      where: { id },
      include: { lines: true, payments: { orderBy: { createdAt: 'desc' } }, po: { include: { lines: true } } },
    });
    if (!b) throw new NotFoundException('Bill not found');
    const bb: any = b;
    const balance = billTotal(bb) - (bb.amountPaid || 0);
    if (bb.status === 'open' && bb.dueDate && new Date(bb.dueDate) < new Date() && balance > 0.005) bb.status = 'overdue';
    return bb;
  }

  @Get()
  async list() {
    const bills = await this.tenant.client.bill.findMany({
      include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    const now = new Date();
    return (bills as any[]).map((b) => {
      const balance = billTotal(b) - (b.amountPaid || 0);
      const status = b.status === 'open' && b.dueDate && new Date(b.dueDate) < now && balance > 0.005 ? 'overdue' : b.status;
      return { ...b, total: billTotal(b), balance, status };
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const b: any = await this.one(id);
    return { ...b, total: billTotal(b), balance: billTotal(b) - (b.amountPaid || 0) };
  }

  @Post()
  async create(@Body() dto: {
    vendorId?: string; vendorName?: string; vendorBillNo?: string;
    poId?: string; receiveId?: string; issueDate?: string; dueDate?: string; notes?: string;
    lines?: DocLineDto[];
  }, @Req() req: any) {
    let lines: any[] = [];
    let vendorName = dto.vendorName?.trim() || '';
    let vendorId = dto.vendorId || null;
    let poId: string | null = dto.poId || null;
    let receiveId: string | null = dto.receiveId || null;

    if (dto.receiveId) {
      const grn = await this.tenant.client.purchaseReceive.findFirst({
        where: { id: dto.receiveId }, include: { lines: true, po: { include: { lines: true } } },
      });
      if (!grn) throw new NotFoundException('Receive not found');
      if (grn.status !== 'completed') throw new BadRequestException('Only completed receives can be billed');
      if ((grn as any).billed) throw new BadRequestException('This receive has already been billed');
      const poLines = (grn.po?.lines || []) as any[];
      lines = (grn.lines as any[]).map((rl) => {
        const pl = poLines.find((p) => p.id === rl.poLineId);
        return { poLineId: rl.poLineId, itemName: rl.itemName, quantity: rl.quantity, rate: pl?.rate ?? 0 };
      });
      poId = grn.poId;
      const po = await this.tenant.client.purchaseOrder.findFirst({ where: { id: grn.poId } });
      vendorName = vendorName || (po as any)?.vendorName || '';
      vendorId = vendorId || (po as any)?.vendorId || null;
    } else if (dto.poId) {
      const po = await this.tenant.client.purchaseOrder.findFirst({
        where: { id: dto.poId }, include: { lines: true },
      });
      if (!po) throw new NotFoundException('Purchase order not found');
      lines = ((po.lines as any[]) || [])
        .map((pl) => ({ poLineId: pl.id, itemName: pl.itemName, quantity: Math.max(0, (pl.quantity || 0) - (pl.billedQty || 0)), rate: pl.rate ?? 0 }))
        .filter((l) => l.quantity > 0);
      if (!lines.length) throw new BadRequestException('All PO lines are already billed');
      vendorName = vendorName || (po as any).vendorName || '';
      vendorId = vendorId || (po as any).vendorId || null;
    } else {
      if (!vendorName) throw new BadRequestException('Vendor is required');
      if (!dto.lines?.length) throw new BadRequestException('At least one line is required');
      lines = dto.lines.map((l) => {
        if (!l.itemName?.trim()) throw new BadRequestException('Each line needs an item name');
        return { itemName: l.itemName.trim(), quantity: l.quantity ?? 1, rate: l.rate ?? 0 };
      });
    }

    const bill = await this.tenant.client.bill.create({
      data: {
        tenantId: req.user.tenantId,
        billNumber: await nextNumber(this.tenant.client, 'bill', 'BILL'),
        vendorBillNo: dto.vendorBillNo?.trim() || null,
        vendorId, vendorName,
        poId, receiveId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes?.trim() || null,
        createdBy: req.user.userId, status: 'draft',
      },
    });
    for (const l of lines) {
      await this.tenant.client.billLine.create({
        data: { tenantId: req.user.tenantId, billId: bill.id, poLineId: l.poLineId || null, itemName: l.itemName, quantity: l.quantity, rate: l.rate },
      });
    }
    // NOTE: billed-qty accrual happens on approve, not create (draft bills
    // must not move the PO). Receive billing is guarded by grn.billed.
    if (receiveId) {
      await this.tenant.client.purchaseReceive.updateMany({ where: { id: receiveId }, data: { billed: true } });
    }
    return this.one(bill.id);
  }

  private async reverseAccrual(bill: any) {
    if (!bill.poId) return;
    for (const l of (bill.lines as any[]) || []) {
      if (!l.poLineId) continue;
      const pl = await this.tenant.client.purchaseOrderLine.findFirst({ where: { id: l.poLineId } });
      if (pl) {
        await this.tenant.client.purchaseOrderLine.updateMany({
          where: { id: l.poLineId }, data: { billedQty: Math.max(0, (pl.billedQty || 0) - l.quantity) },
        });
      }
    }
    await new PosController(this.tenant).recompute(bill.poId);
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string) {
    const b = await this.one(id);
    if (b.status !== 'draft') throw new BadRequestException(`Cannot submit a ${b.status} bill`);
    await this.tenant.client.bill.updateMany({ where: { id }, data: { status: 'pending' } });
    return this.one(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string) {
    const b = await this.one(id);
    if (b.status !== 'pending') throw new BadRequestException(`Cannot approve a ${b.status} bill`);
    await this.tenant.client.bill.updateMany({ where: { id }, data: { status: 'open' } });
    // accrue now that the bill is real
    const full: any = await this.one(id);
    if (full.poId) {
      for (const l of (full.lines as any[]) || []) {
        if (!l.poLineId) continue;
        const pl = await this.tenant.client.purchaseOrderLine.findFirst({ where: { id: l.poLineId } });
        if (pl) {
          await this.tenant.client.purchaseOrderLine.updateMany({
            where: { id: l.poLineId }, data: { billedQty: (pl.billedQty || 0) + l.quantity },
          });
        }
      }
      await new PosController(this.tenant).recompute(full.poId);
    }
    return this.one(id);
  }

  @Post(':id/void')
  async void(@Param('id') id: string) {
    const b: any = await this.one(id);
    if (!['draft', 'open'].includes(b.status)) throw new BadRequestException(`Cannot void a ${b.status} bill`);
    if ((b.amountPaid || 0) > 0) throw new BadRequestException('Cannot void a bill with payments recorded');
    if (b.status === 'open') await this.reverseAccrual(b);
    if (b.receiveId) {
      await this.tenant.client.purchaseReceive.updateMany({ where: { id: b.receiveId }, data: { billed: false } });
    }
    await this.tenant.client.bill.updateMany({ where: { id }, data: { status: 'void' } });
    return this.one(id);
  }

  @Get(':id/match')
  async match(@Param('id') id: string) {
    const b: any = await this.one(id);
    const TOL = 0.02;
    const lines = await Promise.all(((b.lines as any[]) || []).map(async (l) => {
      if (!l.poLineId) return { ...l, matched: null, reason: 'No PO line linked' };
      const pl = await this.tenant.client.purchaseOrderLine.findFirst({ where: { id: l.poLineId } });
      if (!pl) return { ...l, matched: false, reason: 'PO line missing' };
      const qtyOk = l.quantity <= (pl.quantity || 0) + 1e-9;
      const receivedOk = l.quantity <= (pl.receivedQty || 0) + 1e-9;
      const base = pl.rate || 0;
      const priceOk = base === 0 ? l.rate === 0 : Math.abs(l.rate - base) / base <= TOL;
      // Receive-linked bills must be covered by actual receipts; PO-direct
      // bills match on quantity + price only.
      const matched = b.receiveId ? qtyOk && priceOk && receivedOk : qtyOk && priceOk;
      return {
        ...l, matched, poQty: pl.quantity, poRate: pl.rate, poReceived: pl.receivedQty,
        checks: { qtyOk, receivedOk, priceOk },
        reason: matched ? (receivedOk ? 'Matched' : 'Matched (not yet received)') : !qtyOk ? 'Qty exceeds PO' : 'Price differs > 2%',
      };
    }));
    const linkable = lines.filter((l) => l.matched !== null);
    const pct = linkable.length ? Math.round((linkable.filter((l) => l.matched).length / linkable.length) * 100) : 100;
    return { billId: id, billNumber: b.billNumber, matchPct: pct, lines };
  }

  @Post(':id/pay')
  async pay(@Param('id') id: string, @Body() dto: { amount: number; method?: string; reference?: string }, @Req() req: any) {
    const b: any = await this.one(id);
    if (!['open', 'overdue', 'partially_paid'].includes(b.status)) throw new BadRequestException(`Cannot pay a ${b.status} bill`);
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Amount must be > 0');
    const total = billTotal(b);
    const balance = Math.max(0, total - (b.amountPaid || 0));
    const applied = Math.min(amount, balance);
    const excess = Math.round((amount - applied) * 100) / 100;
    await this.tenant.client.payment.create({
      data: {
        tenantId: req.user.tenantId, billId: id, vendorName: b.vendorName,
        amount, method: dto.method?.trim() || null,
        reference: excess > 0
          ? [`Applied LKR ${applied.toFixed(2)}`, dto.reference?.trim()].filter(Boolean).join(' · ')
          : dto.reference?.trim() || null,
        createdBy: req.user.userId,
      },
    });
    const newPaid = Math.round(((b.amountPaid || 0) + applied) * 100) / 100;
    const status = total - newPaid <= 0.005 ? 'paid' : 'partially_paid';
    await this.tenant.client.bill.updateMany({ where: { id }, data: { amountPaid: newPaid, status } });
    let credit = null;
    if (excess > 0) {
      credit = await this.tenant.client.vendorCredit.create({
        data: {
          tenantId: req.user.tenantId, vendorName: b.vendorName,
          amount: excess, remaining: excess, source: 'excess', billId: id,
          notes: `Excess on ${b.billNumber}`,
        },
      });
    }
    return { bill: await this.one(id), applied, excess, credit };
  }
}

// ── Vendor credits + payment history ──

@Controller('api/v1/credits')
@UseGuards(AuthGuard('jwt'))
export class CreditsController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  list() {
    return this.tenant.client.vendorCredit.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Post()
  create(@Body() dto: { vendorName: string; amount: number; source?: string; notes?: string }, @Req() req: any) {
    if (!dto.vendorName?.trim()) throw new BadRequestException('Vendor is required');
    if (!(Number(dto.amount) > 0)) throw new BadRequestException('Amount must be > 0');
    return this.tenant.client.vendorCredit.create({
      data: {
        tenantId: req.user.tenantId, vendorName: dto.vendorName.trim(),
        amount: Number(dto.amount), remaining: Number(dto.amount),
        source: dto.source || 'return', notes: dto.notes?.trim() || null,
      },
    });
  }

  @Post(':id/apply')
  async apply(@Param('id') id: string, @Body() dto: { billId: string; amount: number }, @Req() req: any) {
    const credit = await this.tenant.client.vendorCredit.findFirst({ where: { id } });
    if (!credit) throw new NotFoundException('Credit not found');
    if ((credit as any).status !== 'open' || (credit as any).remaining <= 0) throw new BadRequestException('Credit is fully consumed');
    const bills = new BillsController(this.tenant);
    const b: any = await (bills as any).one(dto.billId);
    if ((credit as any).vendorName.toLowerCase() !== (b.vendorName || '').toLowerCase()) {
      throw new BadRequestException('Credit belongs to a different vendor');
    }
    if (!['open', 'overdue', 'partially_paid'].includes(b.status)) throw new BadRequestException(`Cannot apply to a ${b.status} bill`);
    const total = billTotal(b);
    const balance = Math.max(0, total - (b.amountPaid || 0));
    const use = Math.min(Number(dto.amount), (credit as any).remaining, balance);
    if (!(use > 0)) throw new BadRequestException('Nothing to apply');
    await this.tenant.client.payment.create({
      data: {
        tenantId: req.user.tenantId, billId: b.id, vendorName: b.vendorName,
        amount: use, method: 'Vendor Credit', reference: `Credit ${(credit as any).id.slice(0, 8)}`,
        createdBy: req.user.userId,
      },
    });
    const newPaid = Math.round(((b.amountPaid || 0) + use) * 100) / 100;
    const status = total - newPaid <= 0.005 ? 'paid' : 'partially_paid';
    await this.tenant.client.bill.updateMany({ where: { id: b.id }, data: { amountPaid: newPaid, status } });
    const remaining = Math.round(((credit as any).remaining - use) * 100) / 100;
    await this.tenant.client.vendorCredit.updateMany({
      where: { id }, data: { remaining, status: remaining <= 0.005 ? 'consumed' : 'open' },
    });
    return { bill: await (bills as any).one(b.id), applied: use };
  }
}

@Controller('api/v1/payments')
@UseGuards(AuthGuard('jwt'))
export class PaymentsController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  list() {
    return this.tenant.client.payment.findMany({
      include: { bill: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
  }
}
