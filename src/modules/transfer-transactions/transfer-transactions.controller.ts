import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Patch,
  Delete,
  UseFilters,
  Headers,
  Inject,
  Header,
} from '@nestjs/common';
import { TransferTransactionsService } from './transfer-transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreateTransferTransactionDto,
  FirstShiftCashCountDto,
  TransferBoothToBoothDto,
  TransferCenterToBoothDto,
  UpdateTransferTransactionDto,
} from './dto/transfer-transaction.dto';
import { get } from 'http';
import { CurrenciesService } from '../currencies/currencies.service';
import { In, ReadPreference } from 'typeorm';
import { CashCountsService } from '../cash-counts/cash-counts.service';

@Controller('transfer-transactions')
export class TransferTransactionsController {
  constructor(
    private readonly transferTransactionsService: TransferTransactionsService,
    @Inject(CurrenciesService)
    private readonly currenciesService: CurrenciesService,
    @Inject(CashCountsService)
    private readonly cashCountsService: CashCountsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('booth-to-booth')
  async transferBoothToBooth(
    @Body() transferBoothToBoothDto: TransferBoothToBoothDto,
    @CurrentUser() user: any,
  ) {
    return this.transferTransactionsService.transferBoothToBooth(
      user,
      transferBoothToBoothDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('center-to-booth')
  async transferCenterToBooth(
    @Body() transferCenterToBoothDto: TransferCenterToBoothDto,
    @CurrentUser() user: any,
  ) {
    return this.transferTransactionsService.transferCenterToBooth(
      user,
      transferCenterToBoothDto,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('cancel/:transactionId')
  async cancelTransferTransaction(
    @Param('transactionId') transactionId: string,
    @CurrentUser() user: any,
  ) {
    return this.transferTransactionsService.cancelTransferTransaction(
      user,
      transactionId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getAllTransferTransactions() {
    return this.transferTransactionsService.getAllTransferTransactions();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('booth/:boothId')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async getTransferTransactionsByBoothId(@Param('boothId') boothId: string) {
    return this.transferTransactionsService.getTransferTransactionsByBoothId(
      boothId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('booth/shift/:shiftId')
  async getAmountTypeStatusByShiftId(@Param('shiftId') shiftId: string) {
    return this.transferTransactionsService.getAmountTypeStatusByShiftId(
      shiftId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('date-range')
  async getTransferTransactionsByDateRange(
    @Body('startDate') startDate: Date,
    @Body('endDate') endDate: Date,
  ) {
    return this.transferTransactionsService.getTransferTransactionsByDateRange(
      startDate,
      endDate,
    );
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('shift/:shiftId')
  async getTransferTransactionsByShiftId(@Param('shiftId') shiftId: string) {
    return this.transferTransactionsService.getTransferTransactionsByShiftId(
      shiftId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get(':transactionId')
  async getTransferTransactionById(
    @Param('transactionId') transactionId: string,
  ) {
    return this.transferTransactionsService.getTransferTransactionById(
      transactionId,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('first-shift-cash-count')
  async testFirstShiftCashCount(
    @Body() firstShiftCashCountDto: FirstShiftCashCountDto,
    @CurrentUser() user: any,
  ) {
    const result =
      await this.transferTransactionsService.runCreateFirstShiftCashCount(
        user,
        firstShiftCashCountDto,
      );
    return result;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('first-shift-cash-count/:shiftId')
  async deleteFirstCashcount(
    @Param('shiftId') shiftId: string,
    @CurrentUser() user: any,
  ) {
    return this.transferTransactionsService.deleteFirstCashcount(user, shiftId);
  }
}
