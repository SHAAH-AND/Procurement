import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import * as bcrypt from 'bcrypt';
import { DEFAULT_ROLES, ensureRoles, assertCan } from '../auth/access';

// Roles/Permissions are GLOBAL tables (no tenantId) — they must go through the
// raw PrismaService, never the tenant-scoped client (which would inject tenantId).

const SAFE_SELECT = { id: true, email: true, name: true, department: true, status: true, createdAt: true } as const;

@Controller('api/v1/users')
@UseGuards(AuthGuard('jwt'))
export class UsersAdminController {
  constructor(private tenant: TenantPrismaService, private prisma: PrismaService) {}

  @Get()
  async list() {
    await ensureRoles(this.prisma);
    const users: any[] = await this.tenant.client.user.findMany({
      select: SAFE_SELECT, orderBy: { createdAt: 'asc' }, take: 200,
    });
    const ids = users.map((u) => u.id);
    const links: any[] = ids.length
      ? await this.prisma.userRole.findMany({ where: { userId: { in: ids } }, include: { role: true } })
      : [];
    const byUser = new Map<string, string[]>();
    for (const l of links) {
      if (!byUser.has(l.userId)) byUser.set(l.userId, []);
      byUser.get(l.userId)!.push(l.role.name);
    }
    return users.map((u) => ({ ...u, roles: byUser.get(u.id) || [] }));
  }

  @Post()
  async invite(@Body() dto: { email?: string; password?: string; name?: string; department?: string; role?: string }, @Req() req: any) {
    // Zoho parity: only user managers (Admin) can invite. Bootstrap accounts
    // without roles (pre-RBAC tenants) are allowed through — see access.ts.
    assertCan(req.user, 'users:manage');
    await ensureRoles(this.prisma);
    const email = dto.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Valid email is required');
    if (!dto.password || dto.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
    const existing = await this.tenant.client.user.findFirst({ where: { email } });
    if (existing) throw new ConflictException('A user with this email already exists in your organization');
    const user: any = await this.tenant.client.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        name: dto.name?.trim() || null,
        department: dto.department?.trim() || null,
        status: 'active',
      },
    });
    if (dto.role) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new BadRequestException(`Unknown role "${dto.role}"`);
      await this.prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }
    const links: any[] = await this.prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
    const { passwordHash, ...safe } = user;
    return { ...safe, roles: links.map((l) => l.role.name) };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: { name?: string; department?: string | null; status?: string; role?: string | null },
    @Req() req: any,
  ) {
    assertCan(req.user, 'users:manage');
    const user: any = await this.tenant.client.user.findFirst({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (dto.status !== undefined) {
      if (!['active', 'invited', 'disabled'].includes(dto.status)) throw new BadRequestException('Invalid status');
      if (id === req.user.userId && dto.status === 'disabled') {
        throw new BadRequestException('You cannot disable your own account');
      }
    }
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name?.trim() || null;
    if (dto.department !== undefined) data.department = dto.department?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (Object.keys(data).length) {
      await this.tenant.client.user.updateMany({ where: { id }, data });
    }
    if (dto.role !== undefined) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      if (dto.role) {
        const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
        if (!role) throw new BadRequestException(`Unknown role "${dto.role}"`);
        await this.prisma.userRole.create({ data: { userId: id, roleId: role.id } });
      }
    }
    const updated: any = await this.tenant.client.user.findFirst({ where: { id }, select: SAFE_SELECT });
    const links: any[] = await this.prisma.userRole.findMany({ where: { userId: id }, include: { role: true } });
    return { ...updated, roles: links.map((l) => l.role.name) };
  }
}

@Controller('api/v1/roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    await ensureRoles(this.prisma);
    const roles: any[] = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      permissions: r.permissions.map((p: any) => p.permission.action).sort(),
    }));
  }
}
