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
    const tenantId = this.request?.user?.tenantId;
    
    if (tenantId) {
      this._tenantClient = this.prisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              // List of models that should NOT be scoped by tenant
              const globalModels = ['Organization', 'PlatformAdmin', 'ImpersonationSession'];
              
              if (!globalModels.includes(model)) {
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
    } else {
      this._tenantClient = this.prisma;
    }
  }

  get client() {
    return this._tenantClient || this.prisma;
  }
}
