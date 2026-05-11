import { Module } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shift } from './entities/shift.entity';
import { BoothsModule } from '../../modules/booths/booths.module';
import { SystemLogsModule } from '../../modules/system-logs/system-logs.module';
import { SseModule } from '../../modules/sse/sse.module' ; 
import { CashCountsModule } from './../../modules/cash-counts/cash-counts.module' ; 
import { TransactionsModule } from './../../modules/transactions/transactions.module'
import { RedisModule } from '../../modules/redis/redis.module';

@Module({
  imports: [TypeOrmModule.forFeature([Shift]) , BoothsModule , SystemLogsModule , CashCountsModule , RedisModule , TransactionsModule , SseModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
  
})
export class ShiftsModule {}