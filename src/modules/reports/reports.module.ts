import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ShiftsModule } from './../shifts/shifts.module';
import { StocksModule } from './../stocks/stocks.module';
import { CashCountsModule } from './../cash-counts/cash-counts.module';
import { ExchangeTransactionsModule } from './../exchange-transactions/exchange-transactions.module';
import { TransferTransactionsModule } from './../transfer-transactions/transfer-transactions.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeePerformance } from './entities/employeePerfor.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeePerformance]),
    ShiftsModule,
    StocksModule,
    CashCountsModule,
    ExchangeTransactionsModule,
    TransferTransactionsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
