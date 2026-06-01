import { Module } from '@nestjs/common';
import { CashCountsService } from './cash-counts.service';
import { CashCountsController } from './cash-counts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashCount } from './entities/cash-count.entity';
import { SystemLogsModule } from '../../modules/system-logs/system-logs.module';
import { CurrenciesModule } from '../../modules/currencies/currencies.module';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransferTransaction } from '../transfer-transactions/entities/transfer-transaction.entity';
import { SseModule } from '../sse/sse.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([CashCount, Transaction, TransferTransaction]),
    SystemLogsModule,
    CurrenciesModule,
    SseModule,
  ],
  controllers: [CashCountsController],
  providers: [CashCountsService],
  exports: [CashCountsService],
})
export class CashCountsModule {}
