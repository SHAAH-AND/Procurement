import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'super_secret_dev_key_do_not_use_in_prod',
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const permissions = user.roles.flatMap((ur: any) => ur.role.permissions.map((p: any) => p.permission.action));

    // Snapshot the access context onto the request: every controller enforces
    // module:action checks + separation-of-duties off these fields (access.ts).
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: (user as any).name || null,
      department: (user as any).department || null,
      roles: user.roles.map((ur: any) => ur.role.name),
      permissions,
    };
  }
}
