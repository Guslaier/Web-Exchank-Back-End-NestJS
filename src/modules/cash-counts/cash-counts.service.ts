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
import { EntityManager, Repository } from 'typeorm';
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

  async getCashCountByShiftId(shiftId : string) {
    const cashCountData = await this.cashCountRepository.find({
      relations : {
        transaction : {
          shift : true
        }
      }
      ,
      where : {
        transaction : {
          type : 'CLOSE_SHIFT_CASH_COUNT' , 
          shift : {
            id : shiftId , 
          }
        }
      }
      ,
      select : {
        transaction : {
          id : true ,
          shift : {
            id : true 
          }
        } ,
        id : true ,
        currencyId : true , 
        denomination : true , 
        amount : true 
      }
    })
  }
}
