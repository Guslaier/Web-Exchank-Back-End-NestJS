import { Module } from '@nestjs/common';
import { ExchangeTransactionsController } from './exchange-transactions.controller';
import { ExchangeTransactionsService } from './exchange-transactions.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeTransaction } from './entities/exchange-transaction.entity';
import { ShiftsModule } from './../../modules/shifts/shifts.module';
import { ExchangeRatesModule } from './../../modules/exchange-rates/exchange-rates.module';
import { SystemLogsModule } from './../../modules/system-logs/system-logs.module';
import { CustomersModule } from './../../modules/customers/customers.module';
import { InputValidator } from './helper/input-validator';
import { Transaction } from 'typeorm';
import { TransactionsModule } from './../../modules/transactions/transactions.module';
import { CashCountsModule } from './../../modules/cash-counts/cash-counts.module';
import { ExclusiveExchangeRatesModule} from './../../modules/exclusive-exchange-rates/exclusive-exchange-rates.module';
import { StocksModule } from './../../modules/stocks/stocks.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeTransaction]),
    ShiftsModule,
    ExchangeRatesModule,
    TransactionsModule,
    SystemLogsModule,
    CustomersModule,
    CashCountsModule,
    ExclusiveExchangeRatesModule,
    StocksModule,
    SseModule,
  ],
  controllers: [ExchangeTransactionsController],
  providers: [ExchangeTransactionsService , InputValidator],
  exports: [ExchangeTransactionsService],
})
export class ExchangeTransactionsModule {}