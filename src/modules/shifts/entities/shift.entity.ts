import { TimestampTransformer } from '../../../common/helper/timestamp';
import { Booth } from '../../../modules/booths/entities/booth.entity';
import { User } from '../../../modules/users/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({type : 'uuid'})
  userId : string;


  @ManyToOne(() => User , (User) => User.id)
  @JoinColumn({name : "userId"})
  user: User;

  @Column({type : 'uuid'}) 
  boothId : string; 

  @ManyToOne(() => Booth , (Booth) => Booth.id)
  @JoinColumn({name : "boothId"})
  booth: Booth;

  @Column({ type: 'timestamp', default : new Date()})
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime: Date | null ;

  // @Column({type : 'decimal' , scale : 2 , nullable : true , default : 0})
  // total_receive : number ; 

  // @Column({type : 'decimal' , scale : 2 , nullable : true , default : 0})
  // total_exchange : number ; 

  // @Column({type : 'decimal' , scale : 2 , nullable : true , default : 0})
  // balance : number ; 

  @Column({type : 'decimal' , scale : 2 , nullable : true })
  balance_check : number ; 

  @Column({type : 'decimal' , scale : 2 , nullable : true })
  cash_advance : number ; 

  @Column({ default: 'CLOSE' })
  status: string;

  @CreateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" , transformer: TimestampTransformer })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" , transformer: TimestampTransformer })
  updatedAt: Date;

  @DeleteDateColumn({transformer: TimestampTransformer})
  deletedAt?: Date;
}