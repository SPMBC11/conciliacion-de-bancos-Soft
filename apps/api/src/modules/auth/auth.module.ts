import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuditController } from '../audit/audit.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { OrganizationsController } from '../organizations/organizations.controller.js';
import { RolesController } from '../roles/roles.controller.js';
import { UsersController } from '../users/users.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthGuard, CsrfGuard, OrgGuard } from './guards.js';
import { syncRbac } from './rbac-sync.js';

/** Identidad, organizaciones, usuarios, roles y auditoría. Guardias globales en orden: límite → CSRF → sesión → organización. */
@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }])],
  controllers: [
    AuthController,
    OrganizationsController,
    UsersController,
    RolesController,
    AuditController,
  ],
  providers: [
    AuthService,
    AuditService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: OrgGuard },
  ],
  exports: [AuditService],
})
export class AuthModule implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await syncRbac(this.prisma);
  }
}
