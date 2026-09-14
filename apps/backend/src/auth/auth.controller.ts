import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() body: any) {
    return this.authService.signup(body);
  }

  @Post('login')
  async login(@Body() body: any) {
    return this.authService.login(body);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: any) {
    const user = await this.authService.findUser(req.user.userId);
    if (!user) throw new Error('User not found');
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      orgName: user.tenant?.name || '',
      tenantId: user.tenantId,
    };
  }

  @Post('logout')
  async logout() {
    return { success: true };
  }
}
