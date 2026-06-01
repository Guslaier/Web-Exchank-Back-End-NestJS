import { TimestampTransformer } from '../../../common/helper/timestamp';
import { ExchangeTransaction } from './../../../modules/exchange-transactions/entities/exchange-transaction.entity';
import { Transaction } from './../../transactions/entities/transaction.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @OneToOne(() => Transaction, (Transaction) => Transaction.id)
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column()
  passportImg: string;

  @Column()
  passportNo: string;

  @Column()
  fullName: string;

  @Column()
  nationality: string;

  @Column()
  phoneNumber: string;

  @Column()
  hotelName: string;

  @Column()
  roomNumber: string;

  @CreateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  createdAt: Date;
}
