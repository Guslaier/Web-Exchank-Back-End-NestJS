import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { User } from '../../users/entities/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { TimestampTransformer } from '../../../common/helper/timestamp';

@Entity('exchange_transactions')
export class ExchangeTransaction {
  @PrimaryColumn()
  id: string;

  @Column({ default: 'BUY' })
  type: string;

  @OneToOne(() => Transaction)
  @JoinColumn({ name: 'id' })
  transaction: Transaction;

  @Column({ nullable: true })
  customerId: string | null;

  @OneToOne(() => Customer)
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column()
  exchangeRateId: string;

  @ManyToOne(() => ExchangeRate, (exchangeRate) => exchangeRate.id)
  @JoinColumn({ name: 'exchangeRateId' })
  exchangeRateFK: ExchangeRate;

  // @Column()
  // exclusiveExchangeRateId : string;

  // @ManyToOne(() => ExclusiveExchangeRate, (exclusiveRate) => exclusiveRate.id)
  // @JoinColumn({ name: 'exclusiveExchangeRateId' })
  // exclusiveExchangeRateFK: ExclusiveExchangeRate;

  @Column()
  exchangeRateName: string;

  @Column('decimal', { precision: 12, scale: 2 })
  foreignCurrencyAmount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  totalthaiBahtAmount: number;

  @Column('decimal', { precision: 12, scale: 2 })
  exchangeRate: number;

  @Column({ type: 'boolean', default: false })
  isNegotiateRate: boolean;

  @Column('text', { nullable: true })
  note: string | null;

  @Column('text', { nullable: true })
  voidReason: string;

  @Column({ nullable: true })
  voidedBy: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'voidedBy' })
  employee: User;

  @Column({ nullable: true })
  approvedBy: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'approvedBy' })
  approver: User;

  @Column()
  status: string;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: TimestampTransformer })
  deletedAt?: Date | null;
}
