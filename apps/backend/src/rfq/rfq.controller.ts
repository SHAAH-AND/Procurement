import { Controller, Get, Post, Param, Body, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { randomUUID } from 'crypto';

async function nextNumber(client: any, model: string, prefix: string): Promise<string> {
  const count = await client[model].count();
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

@Controller('api/v1/rfqs')
@UseGuards(AuthGuard('jwt'))
export class RfqsController {
  constructor(private tenant: TenantPrismaService) {}

  private async one(id: string) {
    const rfq = await this.tenant.client.rfq.findFirst({
      where: { id },
      include: {
        lines: true, vendors: true,
        bids: { include: { lines: true }, orderBy: { submittedAt: 'desc' } },
        awards: { include: { lines: true } },
      },
    });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  @Get()
  list() {
    return this.tenant.client.rfq.findMany({
      include: { lines: true, vendors: true, bids: { include: { lines: true } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.one(id);
  }

  @Post()
  async create(@Body() dto: {
    prId?: string;
    items: { itemId?: string; itemName: string; quantity?: number; unit?: string; needBy?: string }[];
    vendors: { vendorId?: string; vendorName: string; contactEmail?: string }[];
    dueDate?: string; message?: string; terms?: string;
  }, @Req() req: any) {
    if (!dto.items?.length) throw new BadRequestException('Add at least one item');
    if (!dto.vendors?.length) throw new BadRequestException('Invite at least one vendor');
    const rfq = await this.tenant.client.rfq.create({
      data: {
        tenantId: req.user.tenantId,
        rfqNumber: await nextNumber(this.tenant.client, 'rfq', 'RFQ'),
        prId: dto.prId || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        message: dto.message?.trim() || null,
        terms: dto.terms?.trim() || null,
        createdBy: req.user.userId, status: 'draft',
      },
    });
    for (const it of dto.items) {
      if (!it.itemName?.trim()) throw new BadRequestException('Each item needs a name');
      const qty = it.quantity ?? 1;
      await this.tenant.client.rfqLine.create({
        data: {
          tenantId: req.user.tenantId, rfqId: rfq.id, itemId: it.itemId || null,
          itemName: it.itemName.trim(), quantity: qty, unit: it.unit || 'PCS',
          needBy: it.needBy ? new Date(it.needBy) : null, openQty: qty,
        },
      });
    }
    for (const v of dto.vendors) {
      if (!v.vendorName?.trim()) throw new BadRequestException('Each vendor needs a name');
      await this.tenant.client.rfqVendor.create({
        data: {
          tenantId: req.user.tenantId, rfqId: rfq.id, vendorId: v.vendorId || null,
          vendorName: v.vendorName.trim(), contactEmail: v.contactEmail?.trim() || null,
        },
      });
    }
    return this.one(rfq.id);
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string) {
    const rfq = await this.one(id);
    if (rfq.status !== 'draft') throw new BadRequestException(`Cannot submit a ${rfq.status} RFQ`);
    for (const v of rfq.vendors as any[]) {
      await this.tenant.client.rfqVendor.updateMany({
        where: { id: v.id },
        data: { inviteToken: v.inviteToken || randomUUID().replace(/-/g, ''), emailSent: true },
      });
    }
    await this.tenant.client.rfq.updateMany({ where: { id }, data: { status: 'submitted' } });
    return this.one(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const rfq = await this.one(id);
    if (['awarded', 'cancelled'].includes(rfq.status)) throw new BadRequestException(`Cannot cancel a ${rfq.status} RFQ`);
    await this.tenant.client.rfq.updateMany({ where: { id }, data: { status: 'cancelled' } });
    return this.one(id);
  }

  @Get(':id/compare')
  async compare(@Param('id') id: string) {
    const rfq: any = await this.one(id);
    const bids = (rfq.bids as any[]).filter((b) => b.status === 'submitted');
    const matrix = (rfq.lines as any[]).map((rl) => {
      const quotes = bids
        .map((b) => ({ bid: b, line: (b.lines as any[]).find((bl) => bl.rfqLineId === rl.id) }))
        .filter((q) => q.line);
      const min = quotes.length ? Math.min(...quotes.map((q) => q.line.unitPrice)) : null;
      return {
        rfqLineId: rl.id, itemName: rl.itemName, quantity: rl.quantity, openQty: rl.openQty,
        quotes: quotes.map((q) => ({
          bidId: q.bid.id, bidLineId: q.line.id, vendorName: q.bid.vendorName,
          quantity: q.line.quantity, unitPrice: q.line.unitPrice, amount: q.line.amount,
          leadDays: q.line.leadDays, note: q.line.note, isBest: min !== null && q.line.unitPrice === min,
          validTill: q.bid.validTill,
        })),
      };
    });
    return { rfqId: id, rfqNumber: rfq.rfqNumber, status: rfq.status, matrix };
  }
}

// ── Vendor portal (magic-link token auth, no login) ──

@Controller('api/v1/portal')
export class PortalController {
  constructor(private tenant: TenantPrismaService) {}

  private async byToken(token: string) {
    // token lookup must be tenant-agnostic: inviteToken is globally unique
    const v = await this.tenant.client.rfqVendor.findFirst({
      where: { inviteToken: token },
      include: { rfq: { include: { lines: true } } } as any,
    });
    if (!v) throw new NotFoundException('Invalid or expired invite link');
    return v as any;
  }

  @Get('rfqs/:token')
  async view(@Param('token') token: string) {
    const v = await this.byToken(token);
    const rfq = v.rfq;
    if (!['submitted', 'awarded_partial'].includes(rfq.status)) throw new BadRequestException(`This RFQ is ${rfq.status}`);
    return {
      vendorName: v.vendorName, rfqNumber: rfq.rfqNumber, dueDate: rfq.dueDate,
      message: rfq.message, terms: rfq.terms, quoteStatus: v.quoteStatus,
      lines: (rfq.lines as any[]).map((l) => ({ rfqLineId: l.id, itemName: l.itemName, quantity: l.quantity, unit: l.unit, needBy: l.needBy, openQty: l.openQty })),
    };
  }

  @Post('rfqs/:token/quotes')
  async quote(@Param('token') token: string, @Body() dto: {
    currency?: string; validTill?: string;
    lines: { rfqLineId: string; quantity: number; unitPrice: number; leadDays?: number; note?: string }[];
  }) {
    const v = await this.byToken(token);
    const rfq = v.rfq;
    if (!['submitted', 'awarded_partial'].includes(rfq.status)) throw new BadRequestException(`This RFQ is ${rfq.status}`);
    if (!dto.lines?.length) throw new BadRequestException('Quote at least one line');
    const rfqLines = rfq.lines as any[];
    let total = 0;
    for (const l of dto.lines) {
      const rl = rfqLines.find((r) => r.id === l.rfqLineId);
      if (!rl) throw new BadRequestException('Unknown RFQ line');
      if (!(l.quantity > 0) || l.quantity > (rl.openQty || 0) + 1e-9) throw new BadRequestException(`"${rl.itemName}": max open qty ${rl.openQty}`);
      if (!(l.unitPrice >= 0)) throw new BadRequestException('Unit price must be >= 0');
      total += l.quantity * l.unitPrice;
    }
    const bid = await this.tenant.client.bid.create({
      data: {
        tenantId: v.tenantId, rfqId: rfq.id, vendorId: v.vendorId || null, vendorName: v.vendorName,
        currency: dto.currency || 'LKR', validTill: dto.validTill ? new Date(dto.validTill) : null,
        totalAmount: Math.round(total * 100) / 100, status: 'submitted',
      },
    });
    // replace semantics: earlier submitted bids by this vendor are withdrawn
    await this.tenant.client.bid.updateMany({
      where: { rfqId: rfq.id, vendorName: v.vendorName, status: 'submitted', id: { not: bid.id } },
      data: { status: 'withdrawn' },
    });
    for (const l of dto.lines) {
      const rl = rfqLines.find((r) => r.id === l.rfqLineId);
      await this.tenant.client.bidLine.create({
        data: {
          tenantId: v.tenantId, bidId: bid.id, rfqLineId: l.rfqLineId, itemName: rl.itemName,
          quantity: l.quantity, unitPrice: l.unitPrice,
          amount: Math.round(l.quantity * l.unitPrice * 100) / 100,
          leadDays: l.leadDays ?? null, note: l.note?.trim() || null,
        },
      });
    }
    await this.tenant.client.rfqVendor.updateMany({ where: { id: v.id }, data: { quoteStatus: 'received' } });
    return this.tenant.client.bid.findFirst({ where: { id: bid.id }, include: { lines: true } });
  }

  @Post('rfqs/:token/withdraw')
  async withdraw(@Param('token') token: string) {
    const v = await this.byToken(token);
    await this.tenant.client.bid.updateMany({
      where: { rfqId: v.rfqId, vendorName: v.vendorName, status: 'submitted' },
      data: { status: 'withdrawn' },
    });
    return { ok: true };
  }
}

// ── Awards → PO ──

@Controller('api/v1/awards')
@UseGuards(AuthGuard('jwt'))
export class AwardsController {
  constructor(private tenant: TenantPrismaService) {}

  @Post('from-bid')
  async award(@Body() dto: { bidId: string; lines: { bidLineId: string; quantity: number }[]; reason?: string }, @Req() req: any) {
    const bid = await this.tenant.client.bid.findFirst({
      where: { id: dto.bidId }, include: { lines: true },
    });
    if (!bid) throw new NotFoundException('Bid not found');
    if ((bid as any).status !== 'submitted') throw new BadRequestException('Bid is not active');
    const rfq = await this.tenant.client.rfq.findFirst({
      where: { id: (bid as any).rfqId }, include: { lines: true },
    });
    if (!rfq || !['submitted', 'awarded_partial'].includes((rfq as any).status)) {
      throw new BadRequestException('RFQ is not open for award');
    }
    if (!dto.lines?.length) throw new BadRequestException('Select at least one bid line');
    const bidLines = (bid as any).lines as any[];
    const rfqLines = (rfq as any).lines as any[];
    for (const l of dto.lines) {
      const bl = bidLines.find((b) => b.id === l.bidLineId);
      if (!bl) throw new BadRequestException('Unknown bid line');
      const rl = rfqLines.find((r) => r.id === bl.rfqLineId);
      if (!rl || l.quantity <= 0 || l.quantity > (rl.openQty || 0) + 1e-9) {
        throw new BadRequestException(`"${bl.itemName}": max open qty ${rl?.openQty ?? 0}`);
      }
    }
    const award = await this.tenant.client.award.create({
      data: {
        tenantId: req.user.tenantId, rfqId: (bid as any).rfqId, status: 'active',
        reason: dto.reason?.trim() || null, decidedBy: req.user.userId,
      },
    });
    for (const l of dto.lines) {
      const bl = bidLines.find((b) => b.id === l.bidLineId);
      await this.tenant.client.awardLine.create({
        data: {
          tenantId: req.user.tenantId, awardId: award.id,
          rfqLineId: bl.rfqLineId, bidLineId: bl.id, quantity: l.quantity, price: bl.unitPrice,
        },
      });
      const rl = rfqLines.find((r) => r.id === bl.rfqLineId);
      await this.tenant.client.rfqLine.updateMany({
        where: { id: rl.id }, data: { openQty: Math.max(0, (rl.openQty || 0) - l.quantity) },
      });
    }
    const fresh = await this.tenant.client.rfq.findFirst({
      where: { id: (bid as any).rfqId }, include: { lines: true },
    });
    const fLines = ((fresh as any)?.lines || []) as any[];
    const anyOpen = fLines.some((r) => (r.openQty || 0) > 1e-9);
    await this.tenant.client.rfq.updateMany({
      where: { id: (bid as any).rfqId }, data: { status: anyOpen ? 'awarded_partial' : 'awarded' },
    });
    return this.tenant.client.award.findFirst({ where: { id: award.id }, include: { lines: true } });
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() dto: { reason?: string }) {
    const award = await this.tenant.client.award.findFirst({
      where: { id }, include: { lines: true },
    });
    if (!award) throw new NotFoundException('Award not found');
    if ((award as any).status !== 'active') throw new BadRequestException('Only active awards can be cancelled');
    if (!dto?.reason?.trim()) throw new BadRequestException('Cancellation reason is required');
    for (const l of (award as any).lines as any[]) {
      const rl = await this.tenant.client.rfqLine.findFirst({ where: { id: l.rfqLineId } });
      if (rl) {
        await this.tenant.client.rfqLine.updateMany({
          where: { id: l.rfqLineId }, data: { openQty: (rl.openQty || 0) + l.quantity },
        });
      }
    }
    await this.tenant.client.award.updateMany({ where: { id }, data: { status: 'cancelled', reason: dto.reason.trim() } });
    await this.tenant.client.rfq.updateMany({ where: { id: (award as any).rfqId }, data: { status: 'submitted' } });
    return this.tenant.client.award.findFirst({ where: { id }, include: { lines: true } });
  }

  @Post(':id/purchase-order')
  async toPo(@Param('id') id: string, @Req() req: any) {
    const award = await this.tenant.client.award.findFirst({
      where: { id }, include: { lines: true },
    });
    if (!award) throw new NotFoundException('Award not found');
    if ((award as any).status !== 'active') throw new BadRequestException('Only active awards convert to PO');
    // one PO per vendor
    const bids: Record<string, any> = {};
    for (const l of (award as any).lines as any[]) {
      const bl = await this.tenant.client.bidLine.findFirst({ where: { id: l.bidLineId } });
      const bid = await this.tenant.client.bid.findFirst({ where: { id: bl?.bidId } });
      if (!bid) continue;
      const key = (bid as any).vendorName;
      (bids[key] = bids[key] || { bid, lines: [] }).lines.push({ ...l, itemName: bl?.itemName || 'Item' });
    }
    const pos = [];
    for (const key of Object.keys(bids)) {
      const { bid, lines } = bids[key];
      const po = await this.tenant.client.purchaseOrder.create({
        data: {
          tenantId: req.user.tenantId,
          poNumber: `PO-${String(await this.tenant.client.purchaseOrder.count() + 1).padStart(4, '0')}`,
          vendorId: (bid as any).vendorId || null, vendorName: key,
          notes: `From award ${(award as any).id.slice(0, 8)}`,
          createdBy: req.user.userId, status: 'draft',
        },
      });
      for (const l of lines) {
        await this.tenant.client.purchaseOrderLine.create({
          data: {
            tenantId: req.user.tenantId, poId: po.id, itemName: l.itemName,
            quantity: l.quantity, rate: l.price,
          },
        });
      }
      pos.push(await this.tenant.client.purchaseOrder.findFirst({ where: { id: po.id }, include: { lines: true } }));
    }
    return pos;
  }
}
