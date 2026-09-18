import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

const PERIODS = ['monthly', 'quarterly', 'yearly'];

function periodSize(period: string): number {
  return period === 'quarterly' ? 4 : period === 'yearly' ? 1 : 12;
}

function budgetTotal(b: any): number {
  return (b.lines || []).reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
}

// ── Budgets (Zoho-style fiscal budgets) ──

@Controller('api/v1/budgets')
@UseGuards(AuthGuard('jwt'))
export class BudgetsController {
  constructor(private tenant: TenantPrismaService) {}

  private async one(id: string) {
    const b = await this.tenant.client.budget.findFirst({
      where: { id }, include: { lines: true },
    });
    if (!b) throw new NotFoundException('Budget not found');
    return b;
  }

  @Get()
  async list() {
    const budgets = await this.tenant.client.budget.findMany({
      include: { lines: true }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    return (budgets as any[]).map((b) => ({ ...b, total: budgetTotal(b) }));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const b: any = await this.one(id);
    return { ...b, total: budgetTotal(b) };
  }

  @Post()
  async create(@Body() dto: {
    name?: string; fiscalYear?: string; fiscalStart?: string; period?: string;
    budgetType?: string; tag?: string;
    lines?: { category?: string; monthIndex?: number; amount?: number }[];
  }, @Req() req: any) {
    if (!dto.name?.trim()) throw new BadRequestException('Budget name is required');
    if (!dto.fiscalStart) throw new BadRequestException('Fiscal year start is required');
    const start = new Date(dto.fiscalStart);
    if (Number.isNaN(start.getTime())) throw new BadRequestException('Invalid fiscal year start');
    const period = (dto.period || 'monthly').toLowerCase();
    if (!PERIODS.includes(period)) throw new BadRequestException('Invalid budget period');
    const size = periodSize(period);
    const lines = dto.lines || [];
    for (const l of lines) {
      if (!l.category?.trim()) throw new BadRequestException('Each line needs a category');
      if (l.monthIndex == null || l.monthIndex < 0 || l.monthIndex >= size) {
        throw new BadRequestException(`Month index must be 0..${size - 1} for ${period} budgets`);
      }
      if ((l.amount ?? 0) < 0) throw new BadRequestException('Amounts cannot be negative');
    }
    const budget = await this.tenant.client.budget.create({
      data: {
        tenantId: req.user.tenantId,
        name: dto.name.trim(),
        fiscalYear: dto.fiscalYear?.trim() || `${start.getFullYear()}`,
        fiscalStart: new Date(start.getFullYear(), start.getMonth(), 1),
        period,
        budgetType: dto.budgetType?.trim() || 'Amount',
        tag: dto.tag?.trim() || null,
        createdBy: req.user.userId,
        status: 'active',
      },
    });
    for (const l of lines) {
      await this.tenant.client.budgetLine.create({
        data: {
          tenantId: req.user.tenantId, budgetId: budget.id,
          category: l.category!.trim(), monthIndex: l.monthIndex ?? 0, amount: l.amount ?? 0,
        },
      });
    }
    return this.get(budget.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: {
    name?: string; fiscalYear?: string; fiscalStart?: string; period?: string;
    budgetType?: string; tag?: string | null; status?: string;
    lines?: { category?: string; monthIndex?: number; amount?: number }[];
  }) {
    const b: any = await this.one(id);
    const header: any = {};
    if (dto.name !== undefined) {
      if (!dto.name?.trim()) throw new BadRequestException('Budget name is required');
      header.name = dto.name.trim();
    }
    if (dto.fiscalYear !== undefined) header.fiscalYear = dto.fiscalYear?.trim() || null;
    if (dto.budgetType !== undefined) header.budgetType = dto.budgetType?.trim() || 'Amount';
    if (dto.tag !== undefined) header.tag = dto.tag?.trim() || null;
    if (dto.status !== undefined) {
      if (!['active', 'archived'].includes(dto.status)) throw new BadRequestException('Invalid status');
      header.status = dto.status;
    }
    let period = b.period;
    if (dto.period !== undefined) {
      const p = String(dto.period).toLowerCase();
      if (!PERIODS.includes(p)) throw new BadRequestException('Invalid budget period');
      header.period = p;
      period = p;
    }
    if (dto.fiscalStart !== undefined) {
      if (!dto.fiscalStart) throw new BadRequestException('Fiscal year start is required');
      const start = new Date(dto.fiscalStart);
      if (Number.isNaN(start.getTime())) throw new BadRequestException('Invalid fiscal year start');
      header.fiscalStart = new Date(start.getFullYear(), start.getMonth(), 1);
    }
    await this.tenant.client.budget.updateMany({ where: { id }, data: header });
    if (dto.lines !== undefined) {
      const size = periodSize(period);
      for (const l of dto.lines) {
        if (!l.category?.trim()) throw new BadRequestException('Each line needs a category');
        if (l.monthIndex == null || l.monthIndex < 0 || l.monthIndex >= size) {
          throw new BadRequestException(`Month index must be 0..${size - 1} for ${period} budgets`);
        }
        if ((l.amount ?? 0) < 0) throw new BadRequestException('Amounts cannot be negative');
      }
      await this.tenant.client.budgetLine.deleteMany({ where: { budgetId: id } });
      for (const l of dto.lines) {
        await this.tenant.client.budgetLine.create({
          data: {
            tenantId: b.tenantId, budgetId: id,
            category: l.category!.trim(), monthIndex: l.monthIndex ?? 0, amount: l.amount ?? 0,
          },
        });
      }
    }
    return this.get(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const b: any = await this.one(id);
    // Lines cascade; nothing else references budgets.
    await this.tenant.client.budget.deleteMany({ where: { id } });
    return { deleted: true, name: b.name };
  }
}
