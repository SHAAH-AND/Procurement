import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { ensureRoles } from './access';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async findUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: true,
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    const roles = (user as any).roles?.map((ur: any) => ur.role.name) || [];
    const permissions = (user as any).roles?.flatMap((ur: any) =>
      ur.role.permissions.map((p: any) => p.permission.action),
    ) || [];
    return {
      id: user.id,
      email: user.email,
      name: (user as any).name || null,
      department: (user as any).department || null,
      status: user.status,
      orgName: user.tenant?.name || '',
      tenantId: user.tenantId,
      roles,
      permissions,
    };
  }

  async signup(data: any) {
    const { orgName, email, password } = data;
    const existingUser = await this.prisma.user.findFirst({ where: { email } });
    if (existingUser) throw new ConflictException('User already exists');

    const org = await this.prisma.organization.create({ data: { name: orgName } });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash: hashedPassword, tenantId: org.id, status: 'active' },
    });
    // Zoho parity: the org creator becomes Super Admin — full access, can
    // invite users and manage settings while later users get explicit roles.
    try {
      await ensureRoles(this.prisma);
      const admin = await this.prisma.role.findUnique({ where: { name: 'Admin' } });
      if (admin) await this.prisma.userRole.create({ data: { userId: user.id, roleId: admin.id } });
    } catch { /* role seeding must never break signup */ }
    return this.login({ email, password });
  }

  async login(data: any) {
    const user = await this.prisma.user.findFirst({
      where: { email: data.email },
      include: { tenant: true },
    });

    if (!user || user.status === 'disabled') {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!(await bcrypt.compare(data.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { email: user.email, sub: user.id, tenantId: user.tenantId };
    return {
      access_token: this.jwtService.sign(payload),
      orgName: user.tenant.name,
      userName: user.email.split('@')[0],
      userId: user.id,
    };
  }
}
