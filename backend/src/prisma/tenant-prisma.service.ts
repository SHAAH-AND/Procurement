import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { PrismaService } from './prisma.service';

@Injectable({ scope: Scope.REQUEST })
export class TenantPrismaService {
  private _tenantClient: any;

  constructor(
    @Inject(REQUEST) private readonly request: any,
    private readonly prisma: PrismaService,
  ) {
    // NOTE: request.user is NOT populated yet at construction time (guards run
    // after instantiation), so the tenant must be resolved lazily per query.
    const req = this.request;
    this._tenantClient = this.prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            // List of models that should NOT be scoped by tenant
            const globalModels = ['Organization', 'PlatformAdmin', 'ImpersonationSession'];
            const tenantId = req?.user?.tenantId;

            if (tenantId && !globalModels.includes(model)) {
              (args as any).where = { ...(args as any).where, tenantId };

              if (['create', 'createMany'].includes(operation)) {
                if ((args as any).data) {
                  if (Array.isArray((args as any).data)) {
                    (args as any).data = (args as any).data.map((d: any) => ({ ...d, tenantId }));
                  } else {
                    (args as any).data = { ...(args as any).data, tenantId };
                  }
                }
              }
            }
            return query(args);
          },
        },
      },
    });
  }

  get client() {
    return this._tenantClient || this.prisma;
  }
}
