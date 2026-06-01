import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { TimestampTransformer } from '../../../common/helper/timestamp';

@Entity('cash_counts')
export class CashCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.id)
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column()
  currencyId: string;

  @ManyToOne(() => Currency, (currency) => currency.id)
  @JoinColumn({ name: 'currencyId' })
  currency: Currency;

  @Column()
  denomination: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  createdAt: Date;
}
