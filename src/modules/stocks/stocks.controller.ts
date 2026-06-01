import { Controller, Get, UseGuards, Query, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetStockShiftQuery } from './dto/stocks.dto';
import { StocksService } from './stocks.service';

@Controller('stocks')
export class StocksController {
  constructor(
    @Inject(StocksService)
    private readonly stockService: StocksService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'EMPLOYEE')
  @Get('shift')
  getStockShift(@CurrentUser() user: any, @Query() query: GetStockShiftQuery) {
    return this.stockService.getTHBSummary(user, query.id);
  }
}
