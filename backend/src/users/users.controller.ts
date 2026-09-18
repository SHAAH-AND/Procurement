import { Controller, Get, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/v1')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get('health')
  check() {
    return { ok: true, service: 'procurement_api', version: '4.1.2-local' };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Body() body: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: body.userId || body.userId },
      include: { tenant: true },
    });
    if (!user) return { error: 'Not found' };
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      orgName: user.tenant?.name || '',
      tenantId: user.tenantId,
    };
  }
}
