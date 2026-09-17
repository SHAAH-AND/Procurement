import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IsString, IsOptional, IsNumber, IsArray, Min, Max, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class PrLineDto {
  @IsOptional() @IsString() itemId?: string;
  @IsString() itemName!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() preferredVendor?: string;
  @IsOptional() @IsNumber() @Min(0.01) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) estimatedRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discount?: number;
}

export class CreatePrDto {
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() reference?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrLineDto) lines!: PrLineDto[];
}

export class UpdatePrDto {
  @IsOptional() @IsDateString() expectedDate?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PrLineDto) lines?: PrLineDto[];
}

const EDITABLE = ['draft', 'rejected'];

function validateLines(lines: PrLineDto[]) {
  if (!Array.isArray(lines) || lines.length === 0) throw new BadRequestException('At least one line item is required');
  if (lines.length > 50) throw new BadRequestException('Max 50 lines per request');
  for (const l of lines) {
    if (!l.itemName?.trim()) throw new BadRequestException('Each line needs an item name');
    if (l.quantity != null && l.quantity <= 0) throw new BadRequestException('Quantity must be > 0');
    if (l.estimatedRate != null && l.estimatedRate < 0) throw new BadRequestException('Rate must be >= 0');
    if (l.discount != null && (l.discount < 0 || l.discount > 100)) throw new BadRequestException('Discount must be 0–100');
  }
}

@Controller('api/v1/prs')
@UseGuards(AuthGuard('jwt'))
export class PrsController {
  constructor(private tenant: TenantPrismaService) {}

  private async nextNumber(): Promise<string> {
    const count = await this.tenant.client.purchaseRequest.count();
    return `PR-${String(count + 1).padStart(4, '0')}`;
  }

  private async one(id: string) {
    const pr = await this.tenant.client.purchaseRequest.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    return pr;
  }

  private mustOwn(pr: any, userId: string, action: string) {
    if (pr.requestorId && pr.requestorId !== userId) {
      throw new BadRequestException(`Only the requestor can ${action} this request`);
    }
  }

  @Get('mine')
  async mine(@Req() req: any) {
    return this.tenant.client.purchaseRequest.findMany({
      where: { requestorId: req.user.userId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('pending')
  async pending() {
    return this.tenant.client.purchaseRequest.findMany({
      where: { status: 'awaiting' },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get()
  async list() {
    return this.tenant.client.purchaseRequest.findMany({
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.one(id);
  }

  @Post()
  async create(@Body() dto: CreatePrDto, @Req() req: any) {
    validateLines(dto.lines);
    const pr = await this.tenant.client.purchaseRequest.create({
      data: {
        tenantId: req.user.tenantId,
        prNumber: await this.nextNumber(),
        requestorId: req.user.userId,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        deliveryAddress: dto.deliveryAddress?.trim() || null,
        reason: dto.reason?.trim() || null,
        notes: dto.notes?.trim() || null,
        reference: dto.reference?.trim() || null,
        status: 'draft',
      },
    });
    for (const l of dto.lines) {
      await this.tenant.client.purchaseRequestLine.create({
        data: {
          tenantId: req.user.tenantId,
          prId: pr.id,
          itemId: l.itemId || null,
          itemName: l.itemName.trim(),
          category: l.category?.trim() || 'Other',
          description: l.description?.trim() || null,
          preferredVendor: l.preferredVendor?.trim() || null,
          quantity: l.quantity ?? 1,
          estimatedRate: l.estimatedRate ?? 0,
          discount: l.discount ?? 0,
        },
      });
    }
    return this.one(pr.id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePrDto, @Req() req: any) {
    const pr = await this.one(id);
    this.mustOwn(pr, req.user.userId, 'edit');
    if (!EDITABLE.includes(pr.status)) throw new BadRequestException(`Cannot edit a ${pr.status} request`);
    if (dto.lines) {
      validateLines(dto.lines);
      await this.tenant.client.purchaseRequestLine.deleteMany({ where: { prId: id } });
      for (const l of dto.lines) {
        await this.tenant.client.purchaseRequestLine.create({
          data: {
            tenantId: pr.tenantId,
            prId: id,
            itemId: l.itemId || null,
            itemName: l.itemName.trim(),
            category: l.category?.trim() || 'Other',
            description: l.description?.trim() || null,
            preferredVendor: l.preferredVendor?.trim() || null,
            quantity: l.quantity ?? 1,
            estimatedRate: l.estimatedRate ?? 0,
            discount: l.discount ?? 0,
          },
        });
      }
    }
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id },
      data: {
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        deliveryAddress: dto.deliveryAddress?.trim() ?? undefined,
        reason: dto.reason?.trim() ?? undefined,
        notes: dto.notes?.trim() ?? undefined,
        reference: dto.reference?.trim() ?? undefined,
        ...(EDITABLE.includes(pr.status) && pr.status === 'rejected' ? { rejectReason: null } : {}),
      },
    });
    return this.one(id);
  }

  @Post(':id/submit')
  async submit(@Param('id') id: string, @Body() body: { approverId?: string }, @Req() req: any) {
    const pr = await this.one(id);
    this.mustOwn(pr, req.user.userId, 'submit');
    if (!['draft', 'rejected'].includes(pr.status)) throw new BadRequestException(`Cannot submit a ${pr.status} request`);
    if (!pr.lines.length) throw new BadRequestException('Cannot submit without line items');
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id },
      data: { status: 'awaiting', approverId: body?.approverId || null, rejectReason: null },
    });
    return this.one(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: any) {
    const pr = await this.one(id);
    // Zoho parity: a rejected request can be approved directly without resubmission.
    // Any tenant member may approve (incl. self-approval); approver is recorded.
    if (!['awaiting', 'rejected'].includes(pr.status)) throw new BadRequestException(`Cannot approve a ${pr.status} request`);
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id }, data: { status: 'approved', approverId: req.user.userId, rejectReason: null },
    });
    return this.one(id);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    const pr = await this.one(id);
    if (pr.status !== 'awaiting') throw new BadRequestException(`Cannot reject a ${pr.status} request`);
    if (!body?.reason?.trim()) throw new BadRequestException('Rejection reason is required');
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id }, data: { status: 'rejected', rejectReason: body.reason.trim() },
    });
    return this.one(id);
  }

  @Post(':id/recall')
  async recall(@Param('id') id: string, @Req() req: any) {
    const pr = await this.one(id);
    this.mustOwn(pr, req.user.userId, 'recall');
    if (pr.status !== 'awaiting') throw new BadRequestException(`Cannot recall a ${pr.status} request`);
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id }, data: { status: 'draft', approverId: null },
    });
    return this.one(id);
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Req() req: any) {
    const pr = await this.one(id);
    this.mustOwn(pr, req.user.userId, 'cancel');
    if (!['draft', 'awaiting', 'rejected'].includes(pr.status)) throw new BadRequestException(`Cannot cancel a ${pr.status} request`);
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id }, data: { status: 'cancelled' },
    });
    return this.one(id);
  }

  @Post(':id/process')
  async process(@Param('id') id: string) {
    const pr = await this.one(id);
    if (pr.status !== 'approved') throw new BadRequestException('Only approved requests can be marked processed');
    await this.tenant.client.purchaseRequest.updateMany({
      where: { id }, data: { status: 'processed' },
    });
    return this.one(id);
  }
}
