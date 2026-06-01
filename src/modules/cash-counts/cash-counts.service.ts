import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SystemLogsService } from '../../modules/system-logs/system-logs.service';
import { CurrenciesService } from '../../modules/currencies/currencies.service';
import { CashCount } from './entities/cash-count.entity';
import { CreateCashCountDto, GetCashCountDto } from './dto/cash-count.dto';
import { EntityManager, Repository, Not } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransferTransaction } from '../transfer-transactions/entities/transfer-transaction.entity';
// Assuming you have an entity for cash count

@Injectable()
export class CashCountsService {
  constructor(
    private readonly systemLogsService: SystemLogsService,
    private readonly currenciesService: CurrenciesService,
    @InjectRepository(CashCount)
    private readonly cashCountRepository: Repository<CashCount>,
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    @InjectRepository(TransferTransaction)
    private readonly transferTransactionRepository: Repository<TransferTransaction>,
  ) {}

  private async log(
    user: any,
    action: string,
    details: string,
    manager?: EntityManager,
  ) {
    await this.systemLogsService.createLog(
      user,
      {
        userId: user?.id || null,
        action,
        details,
      },
      manager, // ส่งต่อ manager เพื่อให้อยู่ใน Transaction เดียวกัน
    );
  }

  async create(
    currentUser: any,
    cashCountData: CreateCashCountDto,
    manager: EntityManager,
  ) {
    try {
      if (cashCountData.denominations.length !== cashCountData.amounts.length) {
        await this.log(
          currentUser,
          'CREATE_CASH_COUNT_FAILED',
          'Denominations and amounts length mismatch',
          manager,
        );
        throw new BadRequestException(
          'Denominations and amounts length mismatch',
        );
      }

      const currencyId = cashCountData.currencyId
        ? cashCountData.currencyId
        : await this.currenciesService.getTHBCurrency();

      const cashCountArr: any[] = [];

      for (let i = 0; i < cashCountData.denominations.length; i++) {
        const denomination = cashCountData.denominations[i].denomination;
        const amount = cashCountData.amounts[i].amount;
        const cashCountObj = {
          transactionId: cashCountData.transactionId,
          currencyId: currencyId,
          denomination: denomination,
          amount: amount,
        };
        cashCountArr.push(cashCountObj);
      }

      const cashCountRepo = manager.getRepository(CashCount);

      const rows = await cashCountRepo.create(cashCountArr);

      await cashCountRepo.save(rows);

      await this.log(
        currentUser,
        'CREATE_CASH_COUNT_SUCCESS',
        `Created cash count for transaction ${cashCountData.transactionId} with total amount ${cashCountData.amounts.reduce((sum, a) => sum + a.amount, 0)}`,
        manager,
      );
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      await this.log(
        currentUser,
        'CREATE_CASH_COUNT_FAILED',
        `Failed to create cash count: ${err}`,
        manager,
      );
      throw new InternalServerErrorException('Failed to create cash count');
    }
  }

  async getCashCountsByTransactionId(getCashCountDto: GetCashCountDto) {
    const cashCount = await this.cashCountRepository.find({
      relations: {
        currency: true,
      },
      where: { transactionId: getCashCountDto.transactionId },
      select: {
        denomination: true,
        amount: true,
        currency: {
          code: true,
        },
      },
    });

    if (cashCount.length === 0) {
      throw new NotFoundException(
        'No cash counts found for the given transaction ID.',
      );
    }

    const THBCashCounts = cashCount.filter((cc) => cc.currency.code === 'THB');
    const foreignCashCounts = cashCount.filter(
      (cc) => cc.currency.code !== 'THB',
    );

    return {
      THB: THBCashCounts,
      foreign: foreignCashCounts,
    };
  }

  async getCashCountByShiftId(shiftId: string) {
    // เพิ่ม deletedAt ลง transaction แล้ว Query เฉพาะออกมาที่เป็น null
    // ใช้การ join กับ tranfer transaction  เพิ่มเพื่อดึงข้อมูลเฉพาะที่ยังไม่ถูก softdelete

    const cashCountData = await this.cashCountRepository.query(
      `
        select cc.denomination , cc.amount from cash_counts cc
        join transactions t on cc."transactionId" = t.id
        join shifts s on t."shiftId" = s.id
        join transfer_transactions tt on t.id = tt.id 
        where s.id = $1 and  tt."deletedAt" is null and t."type" = 'FIRST_SHIFT_CASH_COUNT'  
      `,
      [shiftId],
    );

    return cashCountData;
  }
}
