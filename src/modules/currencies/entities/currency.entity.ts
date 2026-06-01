// currencies/entities/currency.entity.ts
import { Delete } from '@nestjs/common';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { UpdateMode } from '../dto/currency.dto';
import { CurrencyIF } from 'index';
import { ExchangeRate } from '../../exchange-rates/entities/exchange-rate.entity';
import { TimestampTransformer } from '../../../common/helper/timestamp';

@Entity('currencies')
export class Currency implements CurrencyIF {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // เช่น USD, EUR

  @Column()
  name: string; // เช่น US Dollar

  @Column({ nullable: true })
  symbol: string; // เช่น $

  @Column('decimal', { precision: 10, scale: 4, default: 0 })
  buyRate: number;

  @Column('decimal', { precision: 10, scale: 4, default: 0 })
  sellRate: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'enum', enum: ['AUTO', 'MANUAL'], default: 'AUTO' })
  updateMode: 'AUTO' | 'MANUAL';

  @Column({ default: false })
  hasInitialBotData: boolean; // บ่งบอกว่าเคยได้รับข้อมูลจาก BOT หรือไม่

  @Column({ nullable: true })
  lastBotUpdate: Date; // เก็บเวลาที่ได้รับข้อมูลจาก BOT ล่าสุด

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
  deletedAt: Date;

  @OneToMany(
    () => ExchangeRate,
    (exchangeRate: ExchangeRate) => exchangeRate.currency,
  )
  @JoinColumn({ name: 'currency_id' })
  exchangeRates: ExchangeRate[];
}
