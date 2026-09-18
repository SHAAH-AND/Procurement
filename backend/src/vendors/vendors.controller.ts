import { Controller, Get, Post, Body, UseGuards, Req, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { IsString, IsOptional, IsEmail, MaxLength } from 'class-validator';

export class CreateVendorDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
}

@Controller('api/v1/vendors')
@UseGuards(AuthGuard('jwt'))
export class VendorsController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  async list() {
    return this.tenant.client.vendor.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateVendorDto, @Req() req: any) {
    try {
      const name = dto.name?.trim();
      if (!name) throw new BadRequestException('Name is required');
      if (name.length > 120) throw new BadRequestException('Name max 120 chars');

      const existing = await this.tenant.client.vendor.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) throw new ConflictException('Vendor name already exists');

      if (dto.email) {
        const email = dto.email.trim();
        if (email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) throw new BadRequestException('Invalid email format');
          dto.email = email;
        }
      }

      return await this.tenant.client.vendor.create({
        data: {
          tenantId: req.user.tenantId,
          name,
          contactPerson: dto.contactPerson?.trim() || null,
          email: dto.email?.trim() || null,
          phone: dto.phone?.trim() || null,
          category: dto.category?.trim() || 'General',
          paymentTerms: dto.paymentTerms?.trim() || 'Net 15',
          address: dto.address?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: dto.status?.trim() || 'active',
        },
      });
    } catch (e: any) {
      console.error('VENDOR_CREATE_ERROR', e.message, e.stack?.slice(0,500));
      throw e;
    }
  }
}
