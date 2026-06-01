import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransferTransaction } from '../transfer-transactions/entities/transfer-transaction.entity';
import { ExchangeTransaction } from '../exchange-transactions/entities/exchange-transaction.entity';

@Injectable()
export class SharedTransactionsService {
  constructor(
    @InjectRepository(TransferTransaction)
    private readonly transferTransactionRepo: Repository<TransferTransaction>,
    @InjectRepository(ExchangeTransaction)
    private readonly exchangeTransactionRepo: Repository<ExchangeTransaction>,
  ) {}

  async getAmountTypeStatusByShiftId(id: string) {
    const transferTransactionData = await this.transferTransactionRepo.find({
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

    return transferTransactionData;
  }

  async getForeignAmountExchangeRateAndStatusFromShiftId(id: string) {
    const exchangeTransactionData = await this.exchangeTransactionRepo.find({
      relations: {
        transaction: {
          shift: true,
        },
      },
      where: {
        transaction: {
          shiftId: id,
        },
      },
      select: {
        id: true,
        type: true,
        foreignCurrencyAmount: true,
        exchangeRate: true,
        status: true,
      },
    });

    return exchangeTransactionData;
  }
}
