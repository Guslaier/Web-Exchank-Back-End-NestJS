import { TimestampTransformer } from '../../../common/helper/timestamp';
import { UserRole } from 'index';
import { Shift } from '../../shifts/entities/shift.entity';
import { User } from '../../users/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, OneToOne, JoinColumn, OneToMany } from 'typeorm';



@Entity('employee_performance')
export class EmployeePerformance {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @Column({name : 'user_id'})
  userId: string;



  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Shift, (shift) => shift.user)
  shift: Shift[];

  @Column()
  totalBalanceCheck: number;

  @Column()
  totalCashAdvance: number;

  @Column({ name: 'report_month', type: 'date' })
  reportMonth: Date;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP", transformer: TimestampTransformer })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP", transformer: TimestampTransformer })
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt?: Date;
}