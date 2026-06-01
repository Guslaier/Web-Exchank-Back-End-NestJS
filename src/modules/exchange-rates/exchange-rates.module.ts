import { forwardRef, Module } from '@nestjs/common';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { ExclusiveExchangeRatesModule } from '../exclusive-exchange-rates/exclusive-exchange-rates.module';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRate]),
    SystemLogsModule,
    forwardRef(() => ExclusiveExchangeRatesModule),
    SseModule,
  ],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
