import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { BankAccountsController } from './bank-accounts.controller.js';
import { CalendarController } from './calendar.controller.js';
import { syncBanks } from './catalog-sync.js';
import { ChartOfAccountsController } from './chart-of-accounts.controller.js';

/** Configuración maestra: bancos, cuentas bancarias, PUC, mapeo de notas, periodos y festivos. */
@Module({
  imports: [AuthModule],
  controllers: [BankAccountsController, ChartOfAccountsController, CalendarController],
})
export class MasterDataModule implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await syncBanks(this.prisma);
  }
}
