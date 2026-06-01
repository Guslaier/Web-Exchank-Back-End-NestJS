// currencies/currencies.module.ts
import { Module, Sse } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CurrenciesService } from './currencies.service';
import { Currency } from './entities/currency.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { CurrenciesController } from './currencies.controller';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Currency]),
    HttpModule, // เพื่อใช้ HttpService
    SystemLogsModule,
    ExchangeRatesModule,
    SseModule,
  ],
  controllers: [CurrenciesController],
  providers: [CurrenciesService],
  exports: [CurrenciesService],
})
export class CurrenciesModule {}
