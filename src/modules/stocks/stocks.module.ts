import { Module } from '@nestjs/common';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';
import { Stock } from './entities/stocks.entitiy';
import { ShiftsModule } from './../shifts/shifts.module';
import { ExchangeRatesModule } from './../exchange-rates/exchange-rates.module';
import { RedisModule } from './../redis/redis.module';
import { SystemLogsModule } from './../system-logs/system-logs.module';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forFeature([Stock]),
    ShiftsModule,
    ExchangeRatesModule,
    SystemLogsModule,
    RedisModule,
  ],
  controllers: [StocksController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
