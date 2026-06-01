import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  IsNull,
  Between,
  Repository,
  Not,
} from 'typeorm';
import { TransferTransaction } from './entities/transfer-transaction.entity';
import {
  CreateTransferTransactionDto,
  TransferBoothToBoothDto,
  TransferCenterToBoothDto,
} from './dto/transfer-transaction.dto';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { TransactionsService } from '../transactions/transactions.service';
import { Booth } from '../booths/entities/booth.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { ExchangeRate } from '../exchange-rates/entities/exchange-rate.entity';
import { StocksService } from '../stocks/stocks.service';
import { UpdateStockByTransferTransactionForCancel } from '../stocks/dto/stocks.dto';
import { handleError } from '../../common/error/error';
import { SseService } from '../sse/sse.service';
import { CreateCashCountDto } from '../cash-counts/dto/cash-count.dto';
import { TranSectionType, TranStatus } from 'index';
import { CashCountsService } from '../cash-counts/cash-counts.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { ShiftsService } from '../shifts/shifts.service';
import { i, number, sum } from 'mathjs';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { stat } from 'fs';
import { FirstShiftCashCountDto } from './dto/transfer-transaction.dto';
import { create } from 'domain';

@Injectable()
export class TransferTransactionsService {
  private readonly logger = new Logger(TransferTransactionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(SystemLogsService)
    private readonly systemLogsService: SystemLogsService,
    @Inject(TransactionsService)
    private readonly transactionsService: TransactionsService,
    @Inject(StocksService)
    private readonly stocksService: StocksService,
    @Inject(SseService)
    private readonly sseService: SseService,
    @Inject(CashCountsService)
    private readonly cashCountsService: CashCountsService,
    @Inject(ExchangeRatesService)
    private readonly exchangeRatesService: ExchangeRatesService,
    @Inject(ShiftsService)
    private readonly shiftService: ShiftsService,
    @InjectRepository(TransferTransaction)
    private readonly tranferTransactionRepo: Repository<TransferTransaction>,
  ) {}

  /**
   * Helper method to log actions
   */
  private async log(
    user: any,
    action: string,
    details: string,
    manager?: EntityManager,
  ) {
    try {
      await this.systemLogsService.createLog(
        user,
        {
          userId: user?.id || null,
          action,
          details,
        },
        manager,
      );
    } catch (error) {
      this.logger.error(
        `Failed to log action ${action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  //=========================การโอนจากศูนย์ไปบูธ===============================
  async runCreateFirstShiftCashCount(
    user: any,
    firstShiftCashCountDto: FirstShiftCashCountDto,
  ) {
    try {
      return await this.dataSource.transaction(async (transactionManager) => {
        return await this.createFirstShiftCash_count(
          user,
          firstShiftCashCountDto,
          transactionManager,
        );
      });
    } catch (error) {
      handleError(error, 'FIRST_SHIFT_CASH_COUNT_FAILED');
    }
  }

  async createFirstShiftCash_count(
    user: any,
    firstShiftCashCountDto: FirstShiftCashCountDto,
    manager: EntityManager,
  ) {
    try {
      // // 1. Validate User
      const checkUser = await manager
        .getRepository(User)
        .findOne({ where: { id: user.id } });
      if (!checkUser) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `User ID ${user.id} not found`,
          manager,
        );
        throw new NotFoundException(`User with ID ${user.id} not found`);
      }

      // // 2. Get Exchange Rate (Passing manager ensures fresh data)
      const exchangeRate =
        await this.exchangeRatesService.findByTHBCurrency(manager);
      if (!exchangeRate) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          'THB Exchange rate missing',
          manager,
        );
        throw new Error('THB exchange rate not found');
      }

      // // 3. Validate Target Booth & Active Shift
      const targetBooth = await manager.getRepository(Booth).findOne({
        where: {
          id: firstShiftCashCountDto.transferDto.boothId,
          isActive: true,
        },
      });

      if (!targetBooth) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `Booth ${firstShiftCashCountDto.transferDto.boothId} inactive or not found`,
          manager,
        );
        throw new Error(
          `Target booth with ID ${firstShiftCashCountDto.transferDto.boothId} not found or inactive`,
        );
      }

      const targetActiveShift = await this.shiftService.getLastShiftByBoothId(
        firstShiftCashCountDto.transferDto.boothId,
      );

      if (!targetActiveShift) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `Booth ${firstShiftCashCountDto.transferDto.boothId} does not have an active shift`,
          manager,
        );
        throw new Error(
          `Target booth with ID ${firstShiftCashCountDto.transferDto.boothId} does not have an active shift`,
        );
      }

      if (targetActiveShift?.status === 'COMPLETED') {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `Booth ${firstShiftCashCountDto.transferDto.boothId} does not have an active shift`,
          manager,
        );
        throw new Error(
          `Target booth with ID ${firstShiftCashCountDto.transferDto.boothId} does not have an active shift`,
        );
      }

      const beforeFirstShiftStock = await manager
        .getRepository(Transaction)
        .findOne({
          relations: ['transferTransaction'],
          where: {
            shiftId: targetActiveShift.id,
            type: 'FIRST_SHIFT_CASH_COUNT' as TranSectionType,
            transferTransaction: {
              status: 'COMPLETED',
            },
          },
        });

      console.log('beforeFirstShiftStock', beforeFirstShiftStock);
      if (beforeFirstShiftStock) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `An existing FIRST_SHIFT_CASH_COUNT transaction already exists for booth ${firstShiftCashCountDto.transferDto.boothId} in the active shift`,
          manager,
        );
        throw new Error(
          `A FIRST_SHIFT_CASH_COUNT transaction already exists for booth ${firstShiftCashCountDto.transferDto.boothId} in the active shift`,
        );
      }

      // // 4. Calculate Total and Validate match
      const totalAmount = firstShiftCashCountDto.cashCountDto.reduce(
        (sum, item) => Number(item.denominations) * Number(item.amounts) + sum,
        0,
      );

      if (totalAmount !== firstShiftCashCountDto.transferDto.amount) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          `Amount mismatch: Counted ${totalAmount} vs Expected ${firstShiftCashCountDto.transferDto.amount}`,
          manager,
        );
        throw new BadRequestException(
          `Total cash count amount ${totalAmount} does not match the transfer amount ${firstShiftCashCountDto.transferDto.amount}`,
        );
      }

      // // 5. Process Transaction & Movement
      const TID = await this.transactionsService.create(manager, {
        type: 'FIRST_SHIFT_CASH_COUNT' as any, // FIXED TYPO: FISERST -> FIRST
        shiftId: targetActiveShift.id,
      });

      if (!TID) {
        await this.log(
          user,
          'FIRST_SHIFT_CASH_COUNT_FAILED',
          'Failed to create transaction record',
          manager,
        );
        throw new InternalServerErrorException(
          'Failed to create transaction record',
        );
      }

      await this.createMovement(
        user,
        {
          boothId: firstShiftCashCountDto.transferDto.boothId,
          shiftId: targetActiveShift.id,
          amount: firstShiftCashCountDto.transferDto.amount,
          exchangeRateId: exchangeRate.id,
          exchangeRateName: exchangeRate.name,
          type: 'CASH_IN',
          description:
            firstShiftCashCountDto.transferDto.description ||
            'Initial cash count for shift',
          internalTransactionId: null,
          userId: user.id,
          status: 'COMPLETED',
        },
        manager,
        TID,
      );

      // // 6. Update Stocks (Pass manager to stay in transaction)
      await this.stocksService.updateStockByTransferTransaction(
        user,
        {
          sender: null,
          receiver: firstShiftCashCountDto.transferDto.boothId,
          exchangeRateId: exchangeRate.id,
          transferAmount: firstShiftCashCountDto.transferDto.amount,
        },
        manager,
      );

      // // 7. Create Cash Count Record
      const cashCountData: CreateCashCountDto = {
        transactionId: TID.id,
        currencyId: exchangeRate.currency.id,
        denominations: firstShiftCashCountDto.cashCountDto.map((item) => ({
          denomination: item.denominations.toString(),
        })),
        amounts: firstShiftCashCountDto.cashCountDto.map((item) => ({
          amount: Number(item.amounts),
        })),
      };

      await this.cashCountsService.create(user, cashCountData, manager);

      await this.stocksService.updateStockByTransferTransaction(
        user,
        {
          sender: null,
          receiver: firstShiftCashCountDto.transferDto.boothId,
          exchangeRateId: exchangeRate.id,
          transferAmount: firstShiftCashCountDto.transferDto.amount,
        },
        manager,
      );
      // // 8. Finalize Logs & Response
      await this.log(
        user,
        'FIRST_SHIFT_CASH_COUNT_SUCCESS',
        `Successfully counted ${firstShiftCashCountDto.transferDto.amount} THB for booth ${firstShiftCashCountDto.transferDto.boothId}`,
        manager,
      );

      this.sseService.triggerRefreshSignal();

      return {
        message: 'First shift cash count completed successfully',
        transactionId: TID.id,
        amount: firstShiftCashCountDto.transferDto.amount,
        currency: exchangeRate.currency.code,
        cashCountDetails: firstShiftCashCountDto.cashCountDto,
      };
    } catch (error) {
      await this.log(
        user,
        'FIRST_SHIFT_CASH_COUNT_ERROR',
        ` ${error instanceof Error ? error.message : String(error)}`,
        manager,
      );
      throw error;
    }
  }

  //=========================การโอนระหว่างบูธ===============================

  async createTransaction_ID_Transfer(user: any, manager: EntityManager) {
    return await this.transactionsService.create(manager, {
      type: 'TRANSFER',
      shiftId: null, // กำหนด shiftId เป็น null สำหรับ movement
    });
  }

  async createMovement(
    user: any,
    createDto: CreateTransferTransactionDto,
    manager: EntityManager,
    transaction?: Transaction,
  ) {
    if (!transaction) {
      transaction = await this.createTransaction_ID_Transfer(user, manager);
    }

    const transferTransaction = manager
      .getRepository(TransferTransaction)
      .create({
        id: transaction.id, // ใช้ ID เดียวกับ Transaction
        userId: createDto.userId,
        boothId: createDto.boothId,
        shiftId: createDto.shiftId,
        refBoothId: createDto.refBoothId,
        refShiftId: createDto.refShiftId,
        exchangeRateId: createDto.exchangeRateId,
        exchangeRateName: createDto.exchangeRateName,
        internalTransactionId: createDto.internalTransactionId,
        amount: createDto.amount,
        type: createDto.type,
        description: createDto.description,
        status: createDto.status,
      });
    try {
      await manager
        ?.getRepository(TransferTransaction)

        .save(transferTransaction);
      await this.log(
        user,
        'CREATE_MOVEMENT',
        `Created movement of ${createDto.amount} for booth ${createDto.boothId} with exchange rate ID ${createDto.exchangeRateId}`,
        manager,
      );
      return transferTransaction;
    } catch (error) {
      try {
        await this.log(
          user,
          'CREATE_MOVEMENT_FAILED',
          `Failed to create movement of ${createDto.amount} for booth ${createDto.boothId} with exchange rate ID ${createDto.exchangeRateId}`,
          manager,
        );
      } catch (logError) {
        this.logger.error(
          `Failed to log movement creation failure: ${logError instanceof Error ? logError.message : String(logError)}`,
        );
      }
      this.logger.error(
        `Failed to create movement: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to create movement');
    }
  }

  async transferBoothToBooth(user: any, transferDto: TransferBoothToBoothDto) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Validate exchange rate
        const exchangeRate = await manager.getRepository(ExchangeRate).findOne({
          where: { id: transferDto.exchangeRateId },
          relations: ['currency'],
        });
        if (!exchangeRate) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${transferDto.exchangeRateId} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Currency not found`,
            manager,
          );
          throw new NotFoundException(
            `Currency with ID ${transferDto.exchangeRateId} not found`,
          );
        }

        if (transferDto.amount <= 0) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Invalid transfer amount`,
          );
          throw new BadRequestException(
            'Transfer amount must be greater than zero',
          );
        }
        // Validate booths
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const sourceBooth = await manager
          .getRepository(Booth)
          .findOne({ where: { id: transferDto.boothId, isActive: true } });
        if (!sourceBooth) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Source booth not found or inactive`,
            manager,
          );
          throw new NotFoundException(
            `Source booth with ID ${transferDto.boothId} not found or inactive`,
          );
        }

        // ถ้า boothId ไม่มีการเปิดกะอยู่ จะไม่อนุญาตให้ทำรายการโอนระหว่างบูธ
        const activeShift = await this.shiftService.getLastShiftByBoothId(
          transferDto.boothId,
        );

        if (!activeShift || activeShift?.status === 'COMPLETED') {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Source booth does not have an active shift`,
            manager,
          );
          throw new BadRequestException(
            `Source booth with ID ${transferDto.boothId} does not have an active shift`,
          );
        }
        //ถ้าเป็นการโอนระหว่างบูธ ต้องตรวจสอบว่า refBoothId ไม่ใช่ null
        const targetBooth = await manager
          .getRepository(Booth)
          .findOne({ where: { id: transferDto.refBoothId, isActive: true } });
        if (!targetBooth) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Target booth not found or inactive`,
            manager,
          );
          throw new BadRequestException(
            `Target booth with ID ${transferDto.refBoothId} not found or inactive`,
          );
        }
        // ถ้า targetBoothId ไม่มีการเปิดกะอยู่ จะไม่อนุญาตให้ทำรายการโอนระหว่างบูธ
        const targetActiveShift = await this.shiftService.getLastShiftByBoothId(
          transferDto.refBoothId,
        );

        if (!targetActiveShift || targetActiveShift.status === 'COMPLETED') {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Target booth does not have an active shift`,
            manager,
          );
          throw new BadRequestException(
            `Target booth with ID ${transferDto.refBoothId} does not have an active shift`,
          );
        }

        // เช็คว่าบูธต้นทางและปลายทางไม่เหมือนกัน
        if (transferDto.boothId === transferDto.refBoothId) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Source and target booths cannot be the same`,
            manager,
          );
          throw new BadRequestException(
            'Source and target booths cannot be the same',
          );
        }

        // ตรวจสอบว่ามีการทำรายการแลกเงินที่เกี่ยวข้องกับสกุลเงินนี้ในกะนั้นหรือไม่ ถ้ามีจะไม่อนุญาตให้ทำการโอนระหว่างบูธ==============================
        const checkstockExchanges = await this.stocksService.getStock(
          activeShift.id,
          exchangeRate.id,
          manager,
        );
        if (!checkstockExchanges) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: No exchange transactions found for the specified currency in the active shift`,
            manager,
          );
          throw new BadRequestException(
            `Cannot transfer ${transferDto.amount} ${exchangeRate.name} because no exchange transactions found for the specified currency in the active shift`,
          );
        }

        // ตรวจสอบว่าจำนวนเงินที่ต้องการโอนมากกว่าจำนวนเงินที่แลกในกะนั้นหรือไม่ ถ้ามากกว่าจะไม่อนุญาตให้ทำการโอนระหว่างบูธ
        if (checkstockExchanges.total_balance < transferDto.amount) {
          await this.log(
            user,
            'TRANSFER_BOOTH_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}: Insufficient exchanged amount in active shift`,
            manager,
          );
          throw new BadRequestException(
            `Cannot transfer ${transferDto.amount} ${exchangeRate.name} because total exchanged amount in active shift is only ${checkstockExchanges.total_balance} ${exchangeRate.name}`,
          );
        }

        const trinsactionForMainBooth =
          await this.createTransaction_ID_Transfer(user, manager);
        const trinsactionForTargetBooth =
          await this.createTransaction_ID_Transfer(user, manager);

        const transferTransactionFormainBooth = await this.createMovement(
          user,
          {
            boothId: transferDto.boothId,
            shiftId: activeShift.id,
            refBoothId: transferDto.refBoothId,
            refShiftId: targetActiveShift.id,
            amount: transferDto.amount,
            exchangeRateId: transferDto.exchangeRateId,
            exchangeRateName: exchangeRate.name,
            internalTransactionId: trinsactionForTargetBooth.id, // เก็บ ID ของ Transaction แม่ในฟิลด์ internalTransactionId
            type: 'TRANSFER_OUT',
            description: transferDto.description,
            userId: user?.id || null,
            status: 'COMPLETED',
          },
          manager,
          trinsactionForMainBooth,
        );

        const transferTransactionForTargetBooth = await this.createMovement(
          user,
          {
            boothId: transferDto.refBoothId,
            shiftId: targetActiveShift.id,
            refBoothId: transferDto.boothId,
            refShiftId: activeShift.id,
            amount: transferDto.amount,
            exchangeRateId: transferDto.exchangeRateId,
            exchangeRateName: exchangeRate.name,
            internalTransactionId: trinsactionForMainBooth.id, // เก็บ ID ของ Transaction แม่ในฟิลด์ internalTransactionId เพื่อเชื่อมโยงกับ Transaction แม่
            type: 'TRANSFER_IN',
            description: transferDto.description,
            userId: user.id,
            status: 'COMPLETED',
          },
          manager,
          trinsactionForTargetBooth,
        );

        const updateStockDto = {
          sender: transferDto.boothId,
          receiver: transferDto.refBoothId,
          exchangeRateId: transferDto.exchangeRateId,
          transferAmount: transferDto.amount,
        };

        await this.stocksService.updateStockByTransferTransaction(
          user,
          updateStockDto,
          manager,
        );

        await this.log(
          user,
          'TRANSFER_BOOTH_TO_BOOTH_SUCCESS',
          `Transferred ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to booth ${transferDto.refBoothId}`,
          manager,
        );
        this.sseService.triggerRefreshSignal();
        return {
          message: 'Successfully transferred',
          transactionId: trinsactionForMainBooth.id,
          fromBooth: transferDto.boothId,
          transactionIdForTargetBooth: transferTransactionForTargetBooth.id,
          toBooth: transferDto.refBoothId,
          amount: transferDto.amount,
          currency: exchangeRate.name,
          balanceAfterTransfer:
            checkstockExchanges.total_balance - transferDto.amount, // บอกยอดคงเหลือในกะหลังโอน
        };
      });
    } catch (error) {
      handleError(error, 'TRANSFER_BOOTH_TO_BOOTH_FAILED');
    }
  }

  async transferCenterToBooth(
    user: any,
    transferDto: TransferCenterToBoothDto,
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        // Validate exchange rate
        const exchangeRate = await manager.getRepository(ExchangeRate).findOne({
          where: { id: transferDto.exchangeRateId },
          relations: ['currency'],
        });
        if (!exchangeRate) {
          await this.log(
            user,
            'TRANSFER_CENTER_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${transferDto.exchangeRateId} from center to booth ${transferDto.boothId}: Currency not found`,
            manager,
          );
          throw new NotFoundException(
            `Currency with ID ${transferDto.exchangeRateId} not found`,
          );
        }

        if (transferDto.amount <= 0) {
          await this.log(
            user,
            'TRANSFER_CENTER_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from center to booth ${transferDto.boothId}: Invalid transfer amount`,
            manager,
          );
          throw new BadRequestException(
            'Transfer amount must be greater than zero',
          );
        }

        const targetBooth = await manager
          .getRepository(Booth)
          .findOne({ where: { id: transferDto.boothId, isActive: true } });
        if (!targetBooth) {
          await this.log(
            user,
            'TRANSFER_CENTER_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from center to booth ${transferDto.boothId}: Target booth not found or inactive`,
            manager,
          );
          throw new NotFoundException(
            `Target booth with ID ${transferDto.boothId} not found or inactive`,
          );
        }

        const targetActiveShift = await this.shiftService.getLastShiftByBoothId(
          transferDto.boothId,
        );

        if (!targetActiveShift || targetActiveShift.status === 'COMPLETED') {
          await this.log(
            user,
            'TRANSFER_CENTER_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from center to booth ${transferDto.boothId}: Target booth does not have an active shift`,
            manager,
          );
          throw new BadRequestException(
            `Target booth with ID ${transferDto.boothId} does not have an active shift`,
          );
        }
        const checkstockExchanges = await this.stocksService.getStock(
          targetActiveShift.id,
          exchangeRate.id,
          manager,
        );

        if (transferDto.type === 'CASH_IN') {
          return await this.tnfCtoB_CashIn(
            user,
            transferDto,
            targetActiveShift,
            exchangeRate,
            checkstockExchanges,
            manager,
          );
        } else if (transferDto.type === 'CASH_OUT') {
          return await this.tnfCtoB_CashOut(
            user,
            transferDto,
            targetActiveShift,
            exchangeRate,
            manager,
            checkstockExchanges,
          );
        } else {
          await this.log(
            user,
            'TRANSFER_CENTER_TO_BOOTH_FAILED',
            `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from center to booth ${transferDto.boothId}: Invalid transfer type ${transferDto.type}`,
            manager,
          );
          throw new BadRequestException(
            `Invalid transfer type ${transferDto.type}`,
          );
        }
      });
    } catch (error) {
      handleError(error, 'TRANSFER_CENTER_TO_BOOTH_FAILED');
    }
  }

  async tnfCtoB_CashIn(
    user: any,
    transferDto: TransferCenterToBoothDto,
    targetActiveShift: Shift,
    exchangeRate: ExchangeRate,
    checkstockExchanges: any,
    manager: EntityManager,
  ) {
    const transferTransactionForTargetBooth = await this.createMovement(
      user,
      {
        boothId: transferDto.boothId,
        shiftId: targetActiveShift.id,
        amount: transferDto.amount,
        exchangeRateId: exchangeRate.id,
        exchangeRateName: exchangeRate.name,
        type: 'CASH_IN',
        description: transferDto.description,
        internalTransactionId: null, // กำหนดเป็น null เพราะไม่มี Transaction แม่สำหรับการโอนจากศูนย์ไปบูธ
        userId: user.id,
        status: 'COMPLETED',
      },
      manager,
    );

    const stockUpdateDto = {
      sender: null, // เนื่องจากเป็นการโอนจากศูนย์ไปบูธ จึงไม่มี sender booth
      receiver: transferDto.boothId,
      exchangeRateId: exchangeRate.id,
      transferAmount: transferDto.amount,
    };

    await this.stocksService.updateStockByTransferTransaction(
      user,
      stockUpdateDto,
      manager,
    );

    await this.log(
      user,
      'TRANSFER_CENTER_TO_BOOTH_SUCCESS',
      `Transferred ${transferDto.amount} ${exchangeRate.name} from center to booth ${transferDto.boothId}`,
      manager,
    );

    this.sseService.triggerRefreshSignal();
    return {
      message: 'Successfully transferred from Center to Booth',
      transactionId: transferTransactionForTargetBooth.id,
      toBooth: transferDto.boothId,
      amount: transferDto.amount,
      exchangeRateName: exchangeRate.name,
      balanceAfterTransfer: checkstockExchanges
        ? Number(checkstockExchanges.total_balance) + Number(transferDto.amount)
        : Number(transferDto.amount), // บอกยอดคงเหลือในกะหลังโอน
    };
  }

  async tnfCtoB_CashOut(
    user: any,
    transferDto: TransferCenterToBoothDto,
    targetActiveShift: Shift,
    exchangeRate: ExchangeRate,
    manager: EntityManager,
    checkstockExchanges: any,
  ) {
    if (!checkstockExchanges) {
      await this.log(
        user,
        'TRANSFER_CENTER_TO_BOOTH_FAILED',
        `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to center: No exchange transactions found for the specified currency in the active shift`,
        manager,
      );
      throw new BadRequestException(
        `Cannot transfer ${transferDto.amount} ${exchangeRate.name} because no exchange transactions found for the specified currency in the active shift`,
      );
    }

    if (checkstockExchanges.total_balance < transferDto.amount) {
      await this.log(
        user,
        'TRANSFER_CENTER_TO_BOOTH_FAILED',
        `Failed to transfer ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to center: Insufficient exchanged amount in active shift`,
        manager,
      );
      throw new BadRequestException(
        `Cannot transfer ${transferDto.amount} ${exchangeRate.name} because total exchanged amount in active shift is only ${checkstockExchanges.total_balance} ${exchangeRate.name}`,
      );
    }

    const transferTransactionForTargetBooth = await this.createMovement(
      user,
      {
        boothId: transferDto.boothId,
        shiftId: targetActiveShift.id,
        amount: transferDto.amount,
        exchangeRateId: exchangeRate.id,
        exchangeRateName: exchangeRate.name,
        type: 'CASH_OUT',
        description: transferDto.description,
        internalTransactionId: null, // กำหนดเป็น null เพราะไม่มี Transaction แม่สำหรับการโอนจากศูนย์ไปบูธ
        userId: user.id,
        status: 'COMPLETED',
      },
      manager,
    );

    const stockUpdateDto = {
      sender: transferDto.boothId,
      receiver: null, // เนื่องจากเป็นการโอนจากบูธไปศูนย์ จึงไม่มี receiver booth
      exchangeRateId: exchangeRate.id,
      transferAmount: transferDto.amount,
    };
    await this.stocksService.updateStockByTransferTransaction(
      user,
      stockUpdateDto,
      manager,
    );
    await this.log(
      user,
      'TRANSFER_CENTER_TO_BOOTH_SUCCESS',
      `Transferred ${transferDto.amount} ${exchangeRate.name} from booth ${transferDto.boothId} to center`,
      manager,
    );
    this.sseService.triggerRefreshSignal();
    return {
      message: 'Successfully transferred from Booth to Center',
      transactionId: transferTransactionForTargetBooth.id,
      fromBooth: transferDto.boothId,
      amount: transferDto.amount,
      exchangeRateName: exchangeRate.name,
      balanceAfterTransfer:
        checkstockExchanges.total_balance - transferDto.amount, // บอกยอดคงเหลือในกะหลังโอน
    };
  }

  async cancelTransferTransaction(user: any, transactionId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const transferTransaction = await manager
          .getRepository(TransferTransaction)
          .findOne({ where: { id: transactionId } });

        if (!transferTransaction) {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Transaction not found`,
          );
          throw new NotFoundException(
            `Transfer transaction with ID ${transactionId} not found`,
          );
        }

        if (transferTransaction.status === 'CANCELED') {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Transaction is already canceled`,
          );
          throw new BadRequestException(
            `Transfer transaction with ID ${transactionId} is already canceled`,
          );
        }
        const checkshift = await manager.getRepository(Shift).findOne({
          where: { id: transferTransaction.shiftId as string },
        });
        if (!checkshift) {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Shift not found`,
          );
          throw new NotFoundException(
            `Shift with ID ${transferTransaction.shiftId} not found`,
          );
        }
        if (checkshift.status === 'COMPLETED') {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Cannot cancel transaction for a completed shift`,
          );
          throw new BadRequestException(
            `Cannot cancel transfer transaction for a completed shift`,
          );
        }

        if (transferTransaction.type === 'CASH_IN') {
          const updateStockDto: UpdateStockByTransferTransactionForCancel = {
            sender_shift: null,
            receiver_shift: transferTransaction.shiftId as string, // เนื่องจากเป็นการโอนจากศูนย์ไปบูธ จึงไม่มี receiver shift,
            exchangeRateId: transferTransaction.exchangeRateId,
            transferAmount: transferTransaction.amount,
          };
          await this.stocksService.updateStockByTransferTransactionForCancel(
            user,
            updateStockDto,
            manager,
          );
          await manager
            .getRepository(TransferTransaction)
            .update({ id: transactionId }, { status: 'CANCELED' });
          this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_SUCCESS',
            `Canceled cash in transfer transaction ${transactionId} and updated stock accordingly`,
            manager,
          );
          this.sseService.triggerRefreshSignal();
          return {
            message: `Successfully canceled cash in transfer transaction with ID ${transactionId}`,
          };
        }

        if (transferTransaction.type === 'CASH_OUT') {
          const updateStockDto: UpdateStockByTransferTransactionForCancel = {
            sender_shift: transferTransaction.shiftId as string,
            receiver_shift: null,
            exchangeRateId: transferTransaction.exchangeRateId,
            transferAmount: transferTransaction.amount,
          };
          await this.stocksService.updateStockByTransferTransactionForCancel(
            user,
            updateStockDto,
            manager,
          );
          await manager
            .getRepository(TransferTransaction)
            .update({ id: transactionId }, { status: 'CANCELED' });
          this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_SUCCESS',
            `Canceled cash out transfer transaction ${transactionId} and updated stock accordingly`,
            manager,
          );
          this.sseService.triggerRefreshSignal();
          return {
            message: `Successfully canceled cash out transfer transaction with ID ${transactionId}`,
          };
        }

        const checkRefShift = await manager.getRepository(Shift).findOne({
          where: { id: transferTransaction.refShiftId as string },
        });
        if (!checkRefShift) {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Reference shift not found`,
            manager,
          );
          throw new BadRequestException(
            `Cannot cancel transfer transaction: Reference shift not found`,
          );
        }
        if (checkRefShift.status === 'COMPLETED') {
          await this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_FAILED',
            `Failed to cancel transfer transaction ${transactionId}: Cannot cancel transaction because reference shift is completed`,
            manager,
          );
          throw new BadRequestException(
            `Cannot cancel transfer transaction because reference shift is completed`,
          );
        }

        if (transferTransaction.type === 'TRANSFER_OUT') {
          const updateStockDto: UpdateStockByTransferTransactionForCancel = {
            sender_shift: transferTransaction.shiftId as string,
            receiver_shift: transferTransaction.refShiftId as string,
            exchangeRateId: transferTransaction.exchangeRateId,
            transferAmount: transferTransaction.amount,
          };
          await this.stocksService.updateStockByTransferTransactionForCancel(
            user,
            updateStockDto,
            manager,
          );

          await manager
            .getRepository(TransferTransaction)
            .update({ id: transactionId }, { status: 'CANCELED' });
          await manager
            .getRepository(TransferTransaction)
            .update(
              { id: transferTransaction.internalTransactionId as string },
              { status: 'CANCELED' },
            );
          this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_SUCCESS',
            `Canceled transfer transaction ${transactionId} and internal transaction ${transferTransaction.internalTransactionId} and updated stock accordingly`,
            manager,
          );
          this.sseService.triggerRefreshSignal();
          return {
            message: `Successfully canceled transfer transaction with ID ${transactionId}`,
          };
        }

        if (transferTransaction.type === 'TRANSFER_IN') {
          const updateStockDto: UpdateStockByTransferTransactionForCancel = {
            sender_shift: transferTransaction.refShiftId as string,
            receiver_shift: transferTransaction.shiftId as string,
            exchangeRateId: transferTransaction.exchangeRateId,
            transferAmount: transferTransaction.amount,
          };
          await this.stocksService.updateStockByTransferTransactionForCancel(
            user,
            updateStockDto,
            manager,
          );
          await manager
            .getRepository(TransferTransaction)
            .update({ id: transactionId }, { status: 'CANCELED' });
          await manager
            .getRepository(TransferTransaction)
            .update(
              { id: transferTransaction.internalTransactionId as string },
              { status: 'CANCELED' },
            );
          this.log(
            user,
            'CANCEL_TRANSFER_TRANSACTION_SUCCESS',
            `Canceled transfer transaction ${transactionId} and internal transaction ${transferTransaction.internalTransactionId} and updated stock accordingly`,
            manager,
          );
          this.sseService.triggerRefreshSignal();
          return {
            message: `Successfully canceled transfer transaction with ID ${transactionId}`,
          };
        }

        await this.log(
          user,
          'CANCEL_TRANSFER_TRANSACTION_FAILED',
          `Failed to cancel transfer transaction ${transactionId}: Unsupported transaction type ${transferTransaction.type}`,
          manager,
        );
        throw new BadRequestException(
          `Unsupported transaction type ${transferTransaction.type}`,
        );
      });
    } catch (error) {
      handleError(error, 'CANCEL_TRANSFER_TRANSACTION_FAILED');
    }
  }

  async getTransferTransactionById(transactionId: string) {
    try {
      const transferTransaction = await this.dataSource
        .getRepository(TransferTransaction)
        .findOne({
          where: { id: transactionId },
          relations: ['booth', 'refBooth'],
          select: {
            id: true,
            userId: true,
            exchangeRateId: true,
            exchangeRateName: true,
            internalTransactionId: true,
            amount: true,
            type: true,
            status: true,
            shiftId: true,
            createdAt: true,
            booth: {
              id: true,
              name: true,
            },
            refShiftId: true,
            refBooth: {
              id: true,
              name: true,
            },
          },
        });
      return {
        id: transferTransaction?.id,
        userId: transferTransaction?.userId,
        exchangeRateId: transferTransaction?.exchangeRateId,
        exchangeRateName: transferTransaction?.exchangeRateName,
        internalTransactionId: transferTransaction?.internalTransactionId,
        amount: transferTransaction?.amount,
        type: transferTransaction?.type,
        status: transferTransaction?.status,
        shiftId: transferTransaction?.shiftId,
        boothId: transferTransaction?.boothId,
        boothName: transferTransaction?.booth?.name,
        refShiftId: transferTransaction?.refShiftId,
        refBoothId: transferTransaction?.refBoothId,
        refBoothName: transferTransaction?.refBooth?.name,
        createdAt: transferTransaction?.createdAt,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to get transfer transaction with ID ${transactionId}`,
      );
    }
  }

  async getAllTransferTransactions() {
    try {
      const transferTransactions = await this.dataSource
        .getRepository(TransferTransaction)
        .find({
          relations: ['booth', 'refBooth'],
          select: {
            id: true,
            userId: true,
            exchangeRateId: true,
            exchangeRateName: true,
            internalTransactionId: true,
            amount: true,
            type: true,
            status: true,
            shiftId: true,
            createdAt: true,
            booth: {
              id: true,
              name: true,
            },
            refShiftId: true,
            refBooth: {
              id: true,
              name: true,
            },
          },
        });
      return transferTransactions.reduce((result: any[], transaction) => {
        result.push({
          id: transaction?.id,
          userId: transaction?.userId,
          exchangeRateId: transaction?.exchangeRateId,
          exchangeRateName: transaction?.exchangeRateName,
          internalTransactionId: transaction?.internalTransactionId,
          amount: transaction?.amount,
          type: transaction?.type,
          status: transaction?.status,
          shiftId: transaction?.shiftId,
          boothId: transaction?.boothId,
          boothName: transaction?.booth?.name,
          refShiftId: transaction?.refShiftId,
          refBoothId: transaction?.refBoothId,
          refBoothName: transaction?.refBooth?.name,
          createdAt: transaction?.createdAt,
        });
        return result;
      }, []);
    } catch (error) {
      throw new BadRequestException('Failed to get transfer transactions');
    }
  }

  async getTransferTransactionsByBoothId(boothId: string) {
    try {
      const transferTransactions = await this.dataSource
        .getRepository(TransferTransaction)
        .find({
          where: [{ boothId }],
          relations: ['booth', 'refBooth'],
          select: {
            id: true,
            userId: true,
            exchangeRateId: true,
            exchangeRateName: true,
            internalTransactionId: true,
            amount: true,
            type: true,
            status: true,
            shiftId: true,
            createdAt: true,
            booth: {
              id: true,
              name: true,
            },
            refShiftId: true,
            refBooth: {
              id: true,
              name: true,
            },
          },
        });
      return transferTransactions.reduce((result: any[], transaction) => {
        result.push({
          id: transaction?.id,
          userId: transaction?.userId,
          exchangeRateId: transaction?.exchangeRateId,
          exchangeRateName: transaction?.exchangeRateName,
          internalTransactionId: transaction?.internalTransactionId,
          amount: transaction?.amount,
          type: transaction?.type,
          status: transaction?.status,
          shiftId: transaction?.shiftId,
          boothId: transaction?.boothId,
          boothName: transaction?.booth?.name,
          refShiftId: transaction?.refShiftId,
          refBoothId: transaction?.refBoothId,
          refBoothName: transaction?.refBooth?.name,
          createdAt: transaction?.createdAt,
        });
        return result;
      }, []);
    } catch (error) {
      throw new BadRequestException(
        `Failed to get transfer transactions for booth ID ${boothId}`,
      );
    }
  }

  async getTransferTransactionsByShiftId(shiftId: string) {
    try {
      const transferTransactions = await this.dataSource
        .getRepository(TransferTransaction)
        .find({
          where: [{ shiftId }],
          relations: ['booth', 'refBooth'],
          select: {
            id: true,
            userId: true,
            exchangeRateId: true,
            exchangeRateName: true,
            internalTransactionId: true,
            amount: true,
            type: true,
            status: true,
            shiftId: true,
            createdAt: true,
            booth: {
              id: true,
              name: true,
            },
            refShiftId: true,
            refBooth: {
              id: true,
              name: true,
            },
          },
        });
      return transferTransactions.reduce((result: any[], transaction) => {
        result.push({
          id: transaction?.id,
          userId: transaction?.userId,
          exchangeRateId: transaction?.exchangeRateId,
          exchangeRateName: transaction?.exchangeRateName,
          internalTransactionId: transaction?.internalTransactionId,
          amount: transaction?.amount,
          type: transaction?.type,
          status: transaction?.status,
          shiftId: transaction?.shiftId,
          boothId: transaction?.boothId,
          boothName: transaction?.booth?.name,
          refShiftId: transaction?.refShiftId,
          refBoothId: transaction?.refBoothId,
          refBoothName: transaction?.refBooth?.name,
          createdAt: transaction?.createdAt,
        });
        return result;
      }, []);
    } catch (error) {
      throw new BadRequestException(
        `Failed to get transfer transactions for shift ID ${shiftId}`,
      );
    }
  }

  async getTransferTransactionsByDateRange(startDate: Date, endDate: Date) {
    try {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      const transferTransactions = await this.dataSource
        .getRepository(TransferTransaction)
        .find({
          where: {
            createdAt: Between(start, end),
          },
          relations: ['booth', 'refBooth'],
          select: {
            id: true,
            userId: true,
            exchangeRateId: true,
            exchangeRateName: true,
            internalTransactionId: true,
            amount: true,
            type: true,
            status: true,
            shiftId: true,
            createdAt: true,
            booth: {
              id: true,
              name: true,
            },
            refShiftId: true,
            refBooth: {
              id: true,
              name: true,
            },
          },
        });
      return transferTransactions.reduce((result: any[], transaction) => {
        result.push({
          id: transaction?.id,
          userId: transaction?.userId,
          exchangeRateId: transaction?.exchangeRateId,
          exchangeRateName: transaction?.exchangeRateName,
          internalTransactionId: transaction?.internalTransactionId,
          amount: transaction?.amount,
          type: transaction?.type,
          status: transaction?.status,
          shiftId: transaction?.shiftId,
          boothId: transaction?.boothId,
          boothName: transaction?.booth?.name,
          refShiftId: transaction?.refShiftId,
          refBoothId: transaction?.refBoothId,
          refBoothName: transaction?.refBooth?.name,
          createdAt: transaction?.createdAt,
        });
        return result;
      }, []);
    } catch (error) {
      throw new BadRequestException(
        `Failed to get transfer transactions for date range ${startDate} - ${endDate}`,
      );
    }
  }

  async getAmountTypeStatusByShiftId(id: string) {
    const tranferTransactionData = await this.tranferTransactionRepo.find({
      where: {
        shiftId: id,
        exchangeRateName: 'THB',
      },
      select: {
        id: true,
        amount: true,
        type: true,
        status: true,
      },
    });

    return tranferTransactionData;
  }

  async deleteFirstCashcount(user: any, shiftId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const tranferRepo = manager.getRepository(TransferTransaction);
        const updateResult = tranferRepo.query(
          `
            update transfer_transactions tt
            set status = 'CANCELED' , "deletedAt" = now()
            where tt.id in (
              select t.id
              from transactions t
              where t.type = 'FIRST_SHIFT_CASH_COUNT' and  t."shiftId" = $1
            ) and tt."deletedAt" is null 
          `,
          [shiftId],
        );

        await this.log(
          user,
          'DELETE_FIRST_SHIFT_CASH_COUNT_SUCCESS',
          `Canceled first shift cash count for shift ID ${shiftId}`,
          manager,
        );

        await this.sseService.triggerRefreshShiftId(shiftId);

        return updateResult;
      });
    } catch (error) {
      handleError(error, 'DELETE_FIRST_SHIFT_CASH_COUNT_FAILED');
    }
  }
}
