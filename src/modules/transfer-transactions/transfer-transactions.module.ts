import { Module } from '@nestjs/common';
import { TransferTransactionsController } from './transfer-transactions.controller';
import { TransferTransactionsService } from './transfer-transactions.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferTransaction } from './entities/transfer-transaction.entity';
import { BoothsModule } from '../booths/booths.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { CashCountsModule } from '../cash-counts/cash-counts.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { Booth } from '../booths/entities/booth.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { User } from '../users/entities/user.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ShiftsModule } from '../shifts/shifts.module';
import { StocksModule } from '../stocks/stocks.module';
import { SseModule } from '../sse/sse.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransferTransaction,
      Booth,
      Currency,
      User,
      Shift,
      Transaction,
    ]),
    BoothsModule,
    CurrenciesModule,
    CashCountsModule,
    SystemLogsModule,
    TransactionsModule,
    ShiftsModule,
    StocksModule,
    SseModule,
    ExchangeRatesModule,
  ],
  controllers: [TransferTransactionsController],
  providers: [TransferTransactionsService],
  exports: [TransferTransactionsService],
})
export class TransferTransactionsModule {}
