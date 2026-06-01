import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/transaction.dto';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  async create(
    manager: EntityManager,
    createTransactionDto: CreateTransactionDto,
  ) {
    const transactionRepository = manager.getRepository(Transaction);

    const transaction = transactionRepository.create({
      type: createTransactionDto.type,
      shiftId: createTransactionDto.shiftId || null, //
    });

    for (let i = 0; i < 3; i++) {
      transaction.id = this.generateId();
      try {
        await transactionRepository.save(transaction);
        return transaction;
      } catch (error) {
        console.error(`Attempt ${i + 1} to save transaction failed:`, error);
      }
    }
    throw new InternalServerErrorException('Failed to create transaction');
  }

  generateId() {
    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      '-' +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      '-' +
      now.getDate().toString().padStart(2, '0') +
      'T' +
      now.getHours().toString().padStart(2, '0') +
      ':' +
      now.getMinutes().toString().padStart(2, '0') +
      ':' +
      now.getSeconds().toString().padStart(2, '0') +
      '-';

    const randomHex = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0')
      .toUpperCase();

    return `${timestamp}${randomHex}`;
  }

  async getPendingTransId(id: string) {
    const pendingTransactionsId: any[] = await this.transactionRepo.query(
      `select t.id from transactions t 
            join exchange_transactions et on t.id = et.id
            where et.status  = $1 and t."shiftId" = $2 ; `,
      ['PENDING', id],
    );

    return pendingTransactionsId;
  }
}
