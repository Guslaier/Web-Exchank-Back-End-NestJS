import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
  Inject,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { BoothsService } from '../../modules/booths/booths.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Shift } from './entities/shift.entity';
import {
  IsNull,
  Repository,
  DataSource,
  EntityManager,
  Between,
  Not,
} from 'typeorm';
import { SystemLogsService } from '../../modules/system-logs/system-logs.service';
import { CashCountsService } from './../../modules/cash-counts/cash-counts.service';
import { TransactionsService } from './../../modules/transactions/transactions.service' ; 
import Redis from 'ioredis';
import {
  QueryDateDto,
  QueryShiftId,
  ShiftIdDto,
  BoothIdDto,
  ShiftAuditBody , 
  ShiftAuditParam 
} from './dto/shift.dto';
import { isUUID } from 'class-validator';
import { handleError } from '../../common/error/error';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly boothService: BoothsService,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    private readonly systemLogsService: SystemLogsService,
    private readonly cashCountServicee : CashCountsService , 
    private readonly transactionService : TransactionsService , 
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    private readonly dataSource: DataSource,
  ) {}

  // create

  private async log(
    user: any,
    action: string,
    details: string,
    manager?: EntityManager,
  ) {
    await this.systemLogsService.createLog(user, {
      userId: user?.id || null,
      action,
      details,
    });
  }

  async create(
    currentUser: any,
    userId: string,
    boothId: string,
    manager: EntityManager,
    today = true 
  ) {
    const shiftRepo = manager.getRepository(Shift);
    const now = new Date() ; 
    const startTime = today ? now : new Date(now.getFullYear() , now.getMonth() , (now.getDate() + 1) , 8 ,0 ,0 ,0) ; 
    const status = today ? 'OPEN' : 'CLOSE' ; 
    const row = shiftRepo.create({
      userId: userId,
      boothId: boothId,
      startTime : startTime , 
      status : status
    });

    try {
      const savedShift = await shiftRepo.save(row);
      const logQuery  = await this.log(currentUser,'OPEN_SHIFT_SUCCESS',`Shift id : ${savedShift.id} was opened by User id : ${currentUser.id}`,manager,);
       return {message : 'Open shift success.'} ; 
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log(currentUser,'OPEN_SHIFT_FAILED',`internal server error: ${errorMessage}`,manager,);
      throw new InternalServerErrorException('error in internal server. please contact admin.',);
    }
  }

  async openShift(currentUser: any, body: BoothIdDto) {
    const boothId = body.boothId ;
    const boothData = await this.boothService.getBoothIfExist(boothId) ; 

     if (boothData == null) {
      await this.log(currentUser , 'OPEN_SHIFT_FAILED' , 'Booth is not found with sent id.') ; 
      throw new NotFoundException('Booth is not found with sent id.') ; 
    } 

    if (boothData.currentShiftId == null) {
      await this.log(currentUser , 'OPEN_SHIFT_FAILED' , 'Booth has not assigend with any employee.') ; 
      throw new BadRequestException('This booth has not been assinged with any employee') ; 
    } 

    const shiftData = await this.getLastShiftByBoothId(boothId , false) ; 
    console.log(shiftData) ; 
    if (shiftData == null) {
      console.log("shift Occured today.") ; 
      return await this.dataSource.transaction(async(manager)=>{
        try {
         return await this.create(currentUser , boothData.currentShiftId as string   , boothId , manager);
        }
        catch(err) {
          handleError(err, 'ShiftsService.openShift') ; 
        } 
      });
    } 

    if (shiftData?.userId === boothData?.currentShiftId) {
      //completed ห้าม ที่เหลือ set เป็น OPEN
      return await this.dataSource.transaction(async (manager) =>{
        try {
          const today = new Date() ; 
          today.setHours(23,59,59,9999) ; 
            
          if (shiftData.startTime > today  ) {
              await this.log(currentUser , 'OPEN_SHIFT_FAILED' , `Tomorrow shift is alreay created. This Booth id : ${boothId} can't open shift anymore.` , manager)
              throw new ConflictException(`Today shift already completed and tomorrow shift is alreay created. This Booth id : ${boothId} can't open shift anymore.`) ;
          }

          if (shiftData.status === 'COMPLETED') {
            return await this.create(currentUser , boothData.currentShiftId as string , boothId , manager , false ) ;
          }

          return await this.setStatusToOpen(currentUser , shiftData.id , shiftData.status , manager) ; 
        }
        catch (err) {
          handleError(err, 'ShiftsService.openShift') ; 
        }
      }) ;       
    }

    if (shiftData?.userId !== boothData?.currentShiftId) {
      if (shiftData.status === 'OPEN') {
          await this.log(currentUser , 'OPEN_SHIFT_FAILED' , `Last shift id : ${shiftData.id} is still open.`) ;
          throw new ConflictException(`Last shift id : ${shiftData.id} is still open. Pleast close or audit it first.`) ; 
        }

      return await this.dataSource.transaction(async (manager) =>{
        try {
            return await this.create(currentUser , boothData.currentShiftId as string , boothId , manager) ;
        }
        catch (err) {
          handleError(err, 'ShiftsService.openShift') ; 
        }
      }) ;       
    }
  }

  // read

  async getShifts(query: QueryDateDto) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('Specific range date required.');
    }

    const start = new Date(query.startDate);
    const end = new Date(query.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        'StartDate or EndDate in not in Date from.',
      );
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    try {

      return await this.shiftRepository.query(
        `select id , "boothId" , "userId" , total_receive , total_exchange , balance , status , "startTime" 
                from shifts   
                where ("startTime" between  $1 and $2)
                order by "startTime" asc`,
        [start, end],
      );
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getShiftsByStatus(status : string , from : Date , to : Date){
      const shiftsData = await this.shiftRepository.find({
        relations : {
            user : true ,
            booth : true ,  
        },
        where : { 
          status : status ,
          startTime : Between(from , to) ,  
        } ,
        select : {
          id : true , 
          startTime : true , 
          endTime : true , 
          balance_check : true , 
          cash_advance : true , 
          booth : {
            id : true ,
            name : true , 
          },
          user : {
            id : true ,
            username : true ,
          }
        }
      })

      return shiftsData ;
  } ;

  async getActiveShifts(query: QueryDateDto) {
    if (!query.startDate || !query.endDate) {
      throw new BadRequestException('Specific range date required.');
    }

    const start = new Date(query.startDate);
    const end = new Date(query.endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException(
        'StartDate or EndDate in not in Date from.',
      );
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    try {
      return await this.shiftRepository.query(
        `select booths.id , booths.name 
                from shifts join booths on booths.id = shifts."boothId"  
                where ("endTime" is null) and ("startTime" between  $1 and $2)
                order by booths.name asc`,
        [start, end],
      );
    } catch (err) {
      console.log(err);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }
  
  
  async getLastShiftByUserId(userId: string) {
    const fromDate = new Date();
    const toDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);

    const shiftQuery = this.shiftRepository.find({
      where: { userId: userId, startTime: Between(fromDate, toDate) },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const shifts = await shiftQuery;
    return shifts.length > 0 ? shifts[0] : null;
  }

  async getLastShiftByBoothId(boothId: string | undefined, required = true) {
    if (!boothId) {
      if (required) {
        throw new BadRequestException('Booth ID is required.');
      } else {
        return null;
      }
    }

    const fromDate = new Date();
    const toDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    toDate.setDate(toDate.getDate() + 1) ; 
    toDate.setHours(23, 59, 59, 999);

    const shiftQuery = this.shiftRepository.find({
      where: { boothId: boothId, startTime: Between(fromDate, toDate)  },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const shifts = await shiftQuery;

    if(shifts.length === 0 ) {
      if (required) {
        throw new NotFoundException('No shift found for this booth today.');
      } else
      { return null ; 
      }   
    }

    return shifts.length > 0 ? shifts[0] : null;
  }

  async getNonOpenPreviousShiftByBoothId(boothId : string) {
      const shiftDatas = await this.shiftRepository.query(`
            select s.id , u."username" , b.name , s.cash_advance  , s.balance_check  , s."startTime"  , s."endTime" 
            from (
              select * from shifts s 
              where s."boothId" = $1 and s.status != 'OPEN'
              order by s."startTime" desc limit 2
            ) s 
            join users u on s."userId" = u.id 
            join booths b on s."boothId" = b.id
            order by s."startTime" asc limit 1 
        `,
        [boothId]) ; 

      return shiftDatas ? shiftDatas[0] : null ; 
  }
  

  async getShiftById(shiftId: string | undefined) {
    if (!shiftId || !isUUID(shiftId)) {
      throw new BadRequestException('Shift ID is not in correct format.');
    }

    const shift = await this.shiftRepository.findOne({
      where: { id: shiftId },
    });

    return shift;
  }

    async getShiftWithCloseStatusOrFail(user : any ,id : string , message : string) {
      const shiftData = await this.getShiftById(id) ; 
      if(!shiftData) {
        await this.log(user , `${message}_FAILED` , `Shift not fount from sent id : ${id}.`) ;
        throw new NotFoundException('Shift not found.') ; 
      }

      if(shiftData.status !== 'CLOSE') {
        await this.log(user , `${message}_FAILED` , `Shift id : ${id} is not in CLOSE status.`) ; 
        throw new ConflictException('Shift is not in close status') ; 
      }

      return shiftData ; 

    }

 
  
  // update 


  async setStatusToOpen(currentUser : any , id : string  , previousStatus : string , manager : EntityManager) 
  {
    const shiftRepo  = manager.getRepository(Shift) ; 
    const updateResult = await shiftRepo.update({id : id} , {status : 'OPEN'}) ; 
    if (updateResult.affected == 0) {
      await this.log(currentUser , 'OPEN_SHIFT_FAILED' , `Can't set status Shift id : ${id} to OPEN.`,manager) ; 
      throw new NotFoundException(`Can't set status Shift id : ${id} to OPEN.`) ;  
    } 

    await this.log(currentUser , 'OPEN_SHIFT_SUCCESS' , `Update shift id : ${id} from ${previousStatus} to OPEN`,manager) ;
    return {message : 'Open shift success.'} ; 
  }

   async setStatusToCLose(currentUser: any, body: ShiftIdDto) {
    const isEmployee = (currentUser.role === 'EMPLOYEE') ; 
    const id = isEmployee ? currentUser.id : body.id ; 
    
    if (!id) {
      await this.log(currentUser , 'CLOSE_SHIFT_FAILED' , `Bad argrument no id sent by this user`) ;
      throw new BadRequestException('Shift id is requried for Non employee') ;  
    }

    const shiftData = isEmployee ? await this.getLastShiftByUserId(id) : await this.getShiftById(id) ; 

    if(!shiftData) {
      const errMessage = isEmployee ? 'Shift are not found from this employee.' : `Shift are not found from this sent shift id : ${id}. ` ; 
      await this.log(currentUser , 'CLOSE_SHIFT_FAILED' , errMessage) ;
      throw new NotFoundException(errMessage) ; 
    }

    if(shiftData.status === 'COMPLETED') {
        await this.log(currentUser , 'CLOSE_SHIFT_FAILED' , `This shift id : ${shiftData.id} is already completed. can't be open or close anymore.`) ;
        throw new ConflictException('This shift id is already completed.') ; 
    }

    return await this.dataSource.transaction(async(manager) => {
      try {
        const shiftRepo = manager.getRepository(Shift) ; 
        const updateResult = await shiftRepo.update({id : shiftData.id} , {status : 'CLOSE' , endTime : new Date()}) ; 

        if(updateResult.affected == 0) {
          await this.log(currentUser , 'CLOSE_SHIFT_FAILED' , `Can't Update shift id : ${shiftData.id}.`,manager) ; 
          throw new NotFoundException(`Can't shift to close.`) ; 
        }

        await this.log(currentUser , 'CLOSE_SHIFT_SUCCESS' , `Shift id : ${shiftData.id} to update status from ${shiftData.status} to CLOSE.`,manager) ;
        return {message : 'Close shift success.'} ; 
      }
      catch(err) {
        handleError(err,`Shifts.service`) ;
      }
    }) ;
  }

  async updateAuditShift(user : any , id : string , paras : ShiftAuditBody) {
    const shiftData = await this.getShiftWithCloseStatusOrFail(user , id , 'AUDIT_SHIFT') ;
          
    await this.dataSource.transaction(async(manager) =>{
      const transactionData = await this.transactionService.create(manager, {type : 'CLOSE_SHIFT_CASH_COUNT' , shiftId : id}) ;
            
      const transactionId = transactionData.id ; 
      const denominations = paras.cashCountData.denominations ;
      const amounts = paras.cashCountData.amounts ;
      const cashCountData = await this.cashCountServicee.create(user , {transactionId : transactionId , denominations : denominations ,amounts :amounts } , manager) ; 
           
      const shiftRepo = manager.getRepository(Shift) ; 
      const updateresult = await shiftRepo.update({id : id , status : 'CLOSE'} ,{status : 'COMPLETED' ,  balance_check : paras.balanceCheck , cash_advance : paras.cashAdvance}) ;
      if(updateresult.affected == 0) {
        await this.log(user , 'AUDIT_SHIFT_FAILED' , `Can't audit this shift id: ${id} may casuse by some user just change status to 'OPEN'.`) ; 
          throw new ConflictException(`Can't audit this shift id: ${id} may casuse by some user just change status to 'OPEN'.`) ;
      }

      await this.log(user ,'AUDIT_SHIFT_SUCCESS' , `This shift id : ${id} had been audited.`) ; 

      }) ;           
    return {message : 'Audit shift success.'} ; 
  }

  async getShiftsByUserIdAndMonth(userId: string, month: number, year: number) {
    const fromDate = new Date(year, month - 1, 1);
    const toDate = new Date(year, month, 0, 23, 59, 59, 999);
    return await this.shiftRepository.find({
      where: {
        userId: userId,
        startTime: Between(fromDate, toDate),
        status: "COMPLETED"
      },
    });
  }
  
}
