import { Controller, Get, Patch, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { assertCan } from '../auth/access';

// ── Tenant-scoped settings key/value store (backs every Settings page) ──

function parse(value: any): any {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

@Controller('api/v1/settings')
@UseGuards(AuthGuard('jwt'))
export class SettingsController {
  constructor(private tenant: TenantPrismaService) {}

  @Get()
  async all() {
    const rows: any[] = await this.tenant.client.appSetting.findMany();
    const out: Record<string, any> = {};
    for (const r of rows) out[r.key] = parse(r.value);
    return out;
  }

  @Patch()
  async save(@Body() dto: { settings?: Record<string, any>; key?: string; value?: any }, @Req() req: any) {
    // Zoho parity: org settings are admin-only. Bootstrap role-less accounts
    // (pre-RBAC tenants) pass through — see auth/access.ts.
    assertCan(req?.user, 'settings:manage');
    const entries: Record<string, any> = { ...(dto.settings || {}) };
    if (dto.key) entries[dto.key] = dto.value;
    if (!Object.keys(entries).length) throw new BadRequestException('Nothing to save');
    for (const [key, value] of Object.entries(entries)) {
      if (!key.trim()) continue;
      const payload = typeof value === 'string' ? value : JSON.stringify(value ?? null);
      const existing = await this.tenant.client.appSetting.findFirst({ where: { key } });
      if (existing) {
        await this.tenant.client.appSetting.updateMany({ where: { id: existing.id }, data: { value: payload } });
      } else {
        // tenantId is auto-attached by the tenant scope
        await this.tenant.client.appSetting.create({ data: { key, value: payload } });
      }
    }
    return this.all();
  }
}
