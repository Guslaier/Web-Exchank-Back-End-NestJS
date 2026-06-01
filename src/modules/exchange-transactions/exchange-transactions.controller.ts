import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  Put,
} from '@nestjs/common';
import { ExchangeTransactionsService } from './exchange-transactions.service';
import {
  CreateExchangeTransactionDto,
  GetExchangeTransactionsFromShiftsDto,
  GetExchangeTransactionDto,
  LimitDto,
  SetStatusDto,
  SetStatusToPendingBodyDto,
  SetStatusToApproveBodyDto,
} from './dto/exchange-transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { customerStorage } from '../../config/diskStorage';

@Controller('exchange-transactions')
export class ExchangeTransactionsController {
  constructor(
    private readonly exchangeTransactionsService: ExchangeTransactionsService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE')
  @Post()
  @UseInterceptors(
    FileInterceptor('customer_img', {
      storage: customerStorage,
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
          cb(null, true);
        } else {
          cb(new Error('Only JPEG and PNG files are allowed'), false);
        }
      },
    }),
  )
  create(
    @CurrentUser() currentUser: any,
    @Body() createExchangeTransactionDto: CreateExchangeTransactionDto,
    @UploadedFile() customer_img?: Express.Multer.File,
  ) {
    return this.exchangeTransactionsService.create(
      currentUser,
      createExchangeTransactionDto,
      customer_img,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE', 'ADMIN', 'MANAGER')
  @Get('/shift')
  getTransactionsFromShift(
    @CurrentUser() currentUser: any,
    @Query() query?: GetExchangeTransactionsFromShiftsDto,
  ) {
    return this.exchangeTransactionsService.getTransactionsFromShift(
      currentUser,
      query,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('current-booth/shifts/:id')
  getTransactionsFromBoothCurrentShiftId(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
  ) {
    return this.exchangeTransactionsService.getForeignAmountExchangeRateAndStatusFromShiftId(
      id,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE', 'ADMIN', 'MANAGER')
  @Get()
  getTransactionDetail(
    @CurrentUser() currentUser: any,
    @Query() query: GetExchangeTransactionDto,
  ) {
    return this.exchangeTransactionsService.getTransactionDetail(
      currentUser,
      query,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('/many')
  getTransactions(@CurrentUser() currentUser: any, @Query() query: LimitDto) {
    return this.exchangeTransactionsService.getTransactions(currentUser, query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE')
  @Put('req/pending/:id')
  setStatusByEmployee(
    @CurrentUser() currentUser: any,
    @Param() param: SetStatusDto,
    @Body() body: SetStatusToPendingBodyDto,
  ) {
    return this.exchangeTransactionsService.setStatusByEmployee(
      currentUser,
      param,
      body,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('approve/pending/:id')
  setStatusByNonEmployee(
    @CurrentUser() currentUser: any,
    @Param() param: SetStatusDto,
    @Body() body: SetStatusToApproveBodyDto,
  ) {
    return this.exchangeTransactionsService.setStatusByNonEmployee(
      currentUser,
      param,
      body,
    );
  }
}
