// exclusive-exchange-rates/entities/exclusive-exchange-rate.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { Booth } from '../../booths/entities/booth.entity';
import { Delete } from '@nestjs/common';
import { time } from 'console';
import { TimestampTransformer } from '../../../common/helper/timestamp';

@Entity('exclusive_exchange_rates')
export class ExclusiveExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  exchange_rate_id: string;

  @ManyToOne(() => ExchangeRate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exchange_rate_id' })
  exchangeRate: ExchangeRate;

  @Column({ default: 'BUY' })
  formula_buy: string;

  @Column({ default: 'BUY' })
  formula_buy_max: string;

  @Column('decimal', { precision: 17, scale: 6, default: 0 })
  buy_rate: number;

  @Column('decimal', { precision: 17, scale: 6, default: 0 })
  buy_rate_max: number;

  @ManyToOne(() => Booth, (booth) => booth.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'booth_id' })
  booth: Booth;

  @Column({ type: 'uuid' }) // เปลี่ยนเป็น uuid เพื่อให้ตรงกับ Booth Entity
  booth_id: string;

  @Column({ default: 'NORMAL' })
  sync_status: 'NORMAL' | 'SYSTEM_ADJUSTED';

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string;

  @ManyToOne(() => Booth, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewer: Booth;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date;

  @Column({ default: true })
  is_reviewed: boolean;

  @Column({ nullable: true })
  system_remark: string;

  @UpdateDateColumn({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    transformer: TimestampTransformer,
  })
  updated_at: Date;

  @DeleteDateColumn({ transformer: TimestampTransformer })
  deleted_at: Date;
}
