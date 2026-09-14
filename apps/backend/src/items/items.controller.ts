import { Controller, Get, Post, Body, UseGuards, Req, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IsString, IsOptional, IsNumber, MaxLength, Min, IsIn } from 'class-validator';

export class CreateItemDto {
  @IsString() @MaxLength(50) name!: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() @IsIn(['PCS','KG','L','BOX','SET','M','PCS/KG','Other']) unit?: string;
  @IsOptional() @IsNumber() @Min(0) costPrice?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

@Controller('api/v1/items')
@UseGuards(AuthGuard('jwt'))
export class ItemsController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  async list() {
    return this.tenant.client.item.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateItemDto, @Req() req: any) {
    const tenantId = req.user.tenantId;
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (name.length > 50) throw new BadRequestException('Name max 50 chars');

    // Zoho duplicate handling: if duplicates not allowed, block same lower(name)
    // For now, enforce case-insensitive unique name per tenant unless SKU provided
    const existingByName = await this.tenant.client.item.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existingByName && !dto.sku) {
      throw new ConflictException('Item name already exists (provide SKU to allow duplicate)');
    }

    // SKU unique per tenant if provided
    if (dto.sku) {
      const sku = dto.sku.trim();
      if (sku) {
        const dupSku = await this.tenant.client.item.findFirst({ where: { sku } });
        if (dupSku) throw new ConflictException('SKU already exists');
        dto.sku = sku;
      }
    }

    if (dto.costPrice != null && dto.costPrice < 0) throw new BadRequestException('Cost price must be >= 0');

    return this.tenant.client.item.create({
      data: {
        tenantId: req.user.tenantId,
        name,
        sku: dto.sku || null,
        category: dto.category || 'Other',
        unit: dto.unit || 'PCS',
        costPrice: dto.costPrice ?? 0,
        description: dto.description?.trim() || null,
        createdBy: req.user.userId,
      },
    });
  }
}
