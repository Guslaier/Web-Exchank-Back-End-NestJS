import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  OneToMany,
  ReadPreference,
} from 'typeorm';
import { Booth } from '../../booths/entities/booth.entity';
import { User } from '../../users/entities/user.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import {
  TransferTransactionData,
  TranStatus,
  TransferTransactionType,
} from '../../../types';
import { IsString } from 'class-validator';
import { Shift } from '../../shifts/entities/shift.entity';
import { CashCount } from '../../cash-counts/entities/cash-count.entity';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { TimestampTransformer } from '../../../common/helper/timestamp';

@Entity('transfer_transactions')
export class TransferTransaction implements Omit<
  TransferTransactionData,
  'id' | 'boothId' | 'userId' | 'currencyCode' | 'refBoothId' | 'shiftId'
> {
  @PrimaryColumn() // ใช้ ID จาก Transaction แม่
  id: string;

  @OneToOne(() => Transaction)
  @JoinColumn({ name: 'id' })
  transaction: Transaction;

  @Column('varchar', { name: 'internal_transaction_id', nullable: true })
  @IsString()
  internalTransactionId: string | null;

  // แนะนำให้ระบุชื่อ name ใน DB ให้ชัดเจนเพื่อกันพลาด
  @Column('uuid', { name: 'booth_id' })
  boothId: string;

  @ManyToOne(() => Booth)
  @JoinColumn({ name: 'booth_id' })
  booth: Booth;

  @Column('uuid', { name: 'shift_id', nullable: true })
  shiftId?: string | null;

  @ManyToOne(() => Shift)
  @JoinColumn({ name: 'shift_id' })
  shift?: Shift | null;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ name: 'exchange_rate_id' })
  exchangeRateId: string;

  @Column()
  @IsString()
  exchangeRateName: string;

  @ManyToOne(() => ExchangeRate)
  @JoinColumn({ name: 'exchange_rate_id' })
  exchangeRate: ExchangeRate;

  @Column()
  type: TransferTransactionType;

  @Column('uuid', { name: 'refbooth_id', nullable: true })
  refBoothId: string;

  @ManyToOne(() => Booth)
  @JoinColumn({ name: 'refbooth_id' })
  refBooth: Booth;

  @Column('uuid', { name: 'refshift_id', nullable: true })
  refShiftId?: string | null;

  @ManyToOne(() => Shift)
  @JoinColumn({ name: 'refshift_id' })
  refShift?: Shift | null;
  @Column('uuid', { name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'PENDING' })
  status: TranStatus;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  updatedAt: Date;

  @DeleteDateColumn({ transformer: TimestampTransformer })
  deletedAt?: Date;
}
