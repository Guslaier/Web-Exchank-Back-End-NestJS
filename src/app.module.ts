import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BoothsModule } from './modules/booths/booths.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { TransferTransactionsModule } from './modules/transfer-transactions/transfer-transactions.module';
import { ExchangeTransactionsModule } from './modules/exchange-transactions/exchange-transactions.module';
import { CashCountsModule } from './modules/cash-counts/cash-counts.module';
import { CurrenciesModule } from './modules/currencies/currencies.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { ExclusiveExchangeRatesModule } from './modules/exclusive-exchange-rates/exclusive-exchange-rates.module';
import { SystemLogsModule } from './modules/system-logs/system-logs.module';
import { RedisModule } from './modules/redis/redis.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SseModule } from './modules/sse/sse.module';
import { StocksModule } from './modules/stocks/stocks.module';
import { SharedTransactionsModule } from './modules/shared-transactions/shared-transactions.module';
import * as pg from 'pg';

pg.types.setTypeParser(1114, (value) => value);
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('db.host'),
        port: configService.get<number>('db.port'),
        username: configService.get<string>('db.user'),
        password: configService.get<string>('db.pass'),
        database: configService.get<string>('db.name'),
        entities: [__dirname + '/modules/**/entities/*.entity{.ts,.js}'],
        extra: {
          options: '-c timezone=Asia/Bangkok',
        },
        autoLoadEntities: true,
        synchronize: true, // ควรเป็น false บน Production
      }),
      inject: [ConfigService],
    }),

    AuthModule,
    UsersModule,
    BoothsModule,
    ShiftsModule,
    CustomersModule,
    TransactionsModule,
    TransferTransactionsModule,
    ExchangeTransactionsModule,
    CashCountsModule,
    CurrenciesModule,
    ExchangeRatesModule,
    ExclusiveExchangeRatesModule,
    SystemLogsModule,
    RedisModule,
    SseModule,
    StocksModule,
    ReportsModule,
    SharedTransactionsModule,
  ],
})
export class AppModule {}
