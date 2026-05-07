import { BadRequestException, Injectable , InternalServerErrorException, NotFoundException , Inject, ForbiddenException} from "@nestjs/common";
import {UpdateStockByExchangeTransactionDto , UpdateStockByExchangeTransactionForCancel, UpdateStockByTransferTransactionDto, UpdateStockByTransferTransactionForCancel} from './dto/stocks.dto';
import { Stock } from './entities/stocks.entitiy' ;
import {ShiftsService} from './../shifts/shifts.service';
import {ExchangeRatesService} from './../exchange-rates/exchange-rates.service' ;
import {SystemLogsService} from './../system-logs/system-logs.service' ;
import {EntityManager, Repository} from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { Redis } from "ioredis";
import { re } from "mathjs";

    
@Injectable()
export class StocksService {
    constructor(
        private readonly shiftsService: ShiftsService,
        private readonly exchangeRatesService: ExchangeRatesService,
        private readonly systemLogsService: SystemLogsService ,
        @InjectRepository(Stock) 
        private readonly stockRepository: Repository<Stock>,
        @Inject('REDIS_CLIENT') 
        private readonly redisClient: Redis,
    ) {}
    


     
    // create

    async create(shiftId: string | undefined , exchangeRateId: string  | undefined , manager : EntityManager) {
        const stockRepo = manager.getRepository(Stock) ;

        const THBExchangeRateId = await this.getTHBIdCache() ; 
        const isTHB = (exchangeRateId == THBExchangeRateId) ; 
        const exchangeRateName = isTHB ? "THB"  :   (await this.exchangeRatesService.findById(exchangeRateId as string)).name ; 
        if (isTHB) {
            await this.createTHBSummary(shiftId) ; 
        }

        
        const stockCreate = stockRepo.create({
            shiftId,
            exchangeRateId,
            exchangeRateName : exchangeRateName ,
        });

        return await manager.save(stockCreate);
    }

    async createTHBIdCache() {
        const thaiExchangeRate = await this.exchangeRatesService.findByTHBCurency() ;
        await this.redisClient.set('THB' , thaiExchangeRate?.id ?? '')  ; 
        await this.redisClient.expire('THB' , (3600 * 10)) ; 
        return thaiExchangeRate?.id ; 
    }

    async createTHBSummary(shiftId : string | undefined) {
        await this.redisClient.hset(shiftId??''  , {total_received : 0 , total_exchanged : 0 , total_balance : 0}) ;
        await this.redisClient.expire(shiftId??'' , (3600 * 10)) ;  
    }


    private async log(user: any,action: string,details: string,manager?: EntityManager) 
    {
        await this.systemLogsService.createLog(user,{userId: user?.id || null,action,details,},manager);
    }

    // read

    async getTHBSummary(user : any , queryId : string | undefined) {
        const isEmp = ( user.role === 'EMPLOYEE' ) ;
        const shift = isEmp ? await this.shiftsService.getLastShiftByUserId(user.id) : null ;
        const shiftId = isEmp ? shift?.id : queryId ;

       if(shift?.status === 'COMPLETED') {
            throw new ForbiddenException('This stock information are for Admin and manager only.'); 
       }

        if (!shiftId) {
            throw new BadRequestException('Shift id is not found for stock information.'); 
        }

        const THBSummaryCache = await this.getTHBSummaryCache(shiftId as string) ; 
        if(THBSummaryCache.total_balance != undefined && THBSummaryCache.total_balance != null ) {
            return THBSummaryCache ; 
        } 

        const THBid = await this.getTHBIdCache() ; 
        const THBSummary = await this.stockRepository.findOne({
            where : {
                shiftId : shiftId as string  , 
                exchangeRateId : THBid as string ,
            } , 
            select : {
                total_received : true , 
                total_exchanged : true , 
                total_balance : true , 
            }
        }) ;
    
        if(!THBSummary){
            throw new NotFoundException(`Stock information of shift : ${shiftId} is not found.`) ; 
        }
        return THBSummary ; 
    }

    async getTHBIdCache() {
        const THBId = await this.redisClient.get('THB') ; 
        if (!THBId) {
            return await this.createTHBIdCache() ; 
        }
        return THBId ; 

    }

    async getTHBSummaryCache(shiftId : string | undefined) {
        return  await this.redisClient.hgetall(shiftId??'') ;
    }

    async getStock(shiftId: string | undefined , exchangeRateId: string | undefined, manager?: EntityManager) {
        if (manager) {
            return await manager.getRepository(Stock).findOne({ where: { shiftId :  shiftId, exchangeRateId :  exchangeRateId } });
        }
        return await this.stockRepository.findOne({ where: { shiftId :  shiftId, exchangeRateId :  exchangeRateId } });
    }

    async getStockByShiftId(shiftId : string) {
        return await this.stockRepository.find({where : {shiftId : shiftId}}) ; 
    }

    checkBalance( exchangedStock : Stock | null, exchangeAmount : number) {
        return (exchangedStock) && Number(exchangedStock.total_balance)  >= Number(exchangeAmount) ;
    }

    // update

    async updateStockByExchangeTransaction( user: any , updateStockDto: UpdateStockByExchangeTransactionDto , manager: EntityManager ) {
        const promiseShift = this.shiftsService.getLastShiftByUserId(updateStockDto.userId);
        const promiseExchangeRate = this.getTHBIdCache() ; 

        const [shift, thaiExchangeRateId] = await Promise.all([promiseShift, promiseExchangeRate]);   
        
        const updateRecieveRateId  = updateStockDto.type === 'BUY' ? updateStockDto.foreignRateId :  thaiExchangeRateId  ; 
        const updateExchangeRateId = updateStockDto.type === 'BUY' ? thaiExchangeRateId : updateStockDto.foreignRateId  ;
        const updateRecieveAmount = updateStockDto.type === 'BUY' ? updateStockDto.foreingCurrencyAmount :  updateStockDto.totalThaiBahtAmount  ;
        const updateExchangeAmount = updateStockDto.type === 'BUY' ? updateStockDto.totalThaiBahtAmount :  updateStockDto.foreingCurrencyAmount  ;

        const promiseGetReceivedStock = await this.getStock(shift?.id  , updateRecieveRateId, manager) ; 
        const promiseGetExchangedStock = await this.getStock(shift?.id  , updateExchangeRateId, manager) ;

        const [receivedStock, exchangedStock] = await Promise.all([promiseGetReceivedStock, promiseGetExchangedStock]);
        if(!receivedStock) {
            const savedStock = await this.create(shift?.id , updateRecieveRateId , manager) ;
            if(!savedStock) {
                this.log(user, 'CREATE_EXCHANGE_TRANSACTION_FAILED', `Failed to create stock for shift ${shift?.id} and exchange rate ${updateRecieveRateId}`, manager);
                throw new InternalServerErrorException(`Failed to create stock for shift ${shift?.id} and exchange rate ${updateRecieveRateId}`);
            }
        }
        
        const isExchangeOverBalance = !this.checkBalance(exchangedStock , updateExchangeAmount) ;
        console.log('isExchangeOverBalance: ', isExchangeOverBalance);
        if(isExchangeOverBalance) {
            this.log(user, 'CREATE_EXCHANGE_TRANSACTION_FAILED', `Failed cause the exchange amount ${updateExchangeAmount} exceeds the available balance ${exchangedStock?.total_balance} for shift ${shift?.id} and exchange rate ${updateExchangeRateId}.`, manager);
            throw new BadRequestException(`Failed cause the exchange amount ${updateExchangeAmount} exceeds the available balance ${exchangedStock?.total_balance} for shift ${shift?.id} and exchange rate ${(await this.exchangeRatesService.findById(updateExchangeRateId as string)).name}.`);
         }

        const updateReceiveQuery = await this.updateTotalReceive(shift?.id , updateRecieveRateId , updateRecieveAmount , manager) ;
        if(updateReceiveQuery.affected === 0) {
            this.log(user, 'CREATE_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find shift ${shift?.id} and exchangerateId  ${updateRecieveRateId} to update in stock.`, manager);
            throw new BadRequestException(`Failed cause cannot find shift ${shift?.id} and exchangerateId  ${updateRecieveRateId} to update in stock.`);
        }

        const updateExchangeQuery = await this.updateTotalExchanged(shift?.id , updateExchangeRateId , updateExchangeAmount , manager) ;
        if(updateExchangeQuery.affected === 0) {
            this.log(user, 'CREATE_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find shift ${shift?.id} and exchangerateId  ${updateExchangeRateId} to update in stock.`, manager);
            throw new BadRequestException(`Failed cause cannot find shift ${shift?.id} and exchangerateId  ${updateExchangeRateId} to update in stock.`);
        }
    }   

    async updateStockByExchangeTransactionForCancel( user: any ,  exchangeTransaction: UpdateStockByExchangeTransactionForCancel , manager: EntityManager ) {
        const thaiExchangeRateId = await this.getTHBIdCache() ;

        if(!thaiExchangeRateId){
            this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find Thai exchange rate to update stock for cancelling exchange transaction with id ${exchangeTransaction.id}.`, manager);
            throw new NotFoundException(`Failed cause cannot find Thai exchange rate to update stock for cancelling exchange transaction with id ${exchangeTransaction.id}.`);
        }


        const updateExchangeRateId  = exchangeTransaction.type === 'BUY' ? thaiExchangeRateId :  exchangeTransaction.exchangeRateId  ; 
        const updateReceiveRateId = exchangeTransaction.type === 'BUY' ? exchangeTransaction.exchangeRateId : thaiExchangeRateId  ;
        const updateExchangeAmount = exchangeTransaction.type === 'BUY' ? exchangeTransaction.totalthaiBahtAmount :  exchangeTransaction.foreignCurrencyAmount  ;
        const updateReceiveAmount = exchangeTransaction.type === 'BUY' ? exchangeTransaction.foreignCurrencyAmount :  exchangeTransaction.totalthaiBahtAmount  ;


        const shiftId = exchangeTransaction.shiftId ;

        const promiseGetReceivedStock =  this.getStock(shiftId  , updateReceiveRateId, manager) ; 
        const promiseGetExchangedStock = this.getStock(shiftId  , updateExchangeRateId, manager) ;

        const [receivedStock, exchangedStock] = await Promise.all([promiseGetReceivedStock, promiseGetExchangedStock]);

        if(!receivedStock || !exchangedStock) {
            this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find stock to update for cancelling exchange transaction with id ${exchangeTransaction.id}.`, manager);
            throw new NotFoundException(`Failed cause cannot find stock to update for cancelling exchange transaction with id ${exchangeTransaction.id}.`);
        }

        const isReceiveUpdateOverBalance = !this.checkBalance(receivedStock , updateReceiveAmount) ;
        console.log("isReceiveUpdateOverBalance : " , isReceiveUpdateOverBalance , " checkBalance : " , this.checkBalance(receivedStock , updateReceiveAmount)) ; 
        if(isReceiveUpdateOverBalance) {
            this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause the exchange amount ${updateReceiveAmount} exceeds the available balance ${receivedStock?.total_balance} for shift ${shiftId} and exchange rate ${updateReceiveRateId}.`, manager);
            throw new BadRequestException(`Failed cause the exchange amount ${updateReceiveAmount} exceeds the available balance ${receivedStock?.total_balance} for shift ${shiftId} and exchange rate ${(await this.exchangeRatesService.findById(updateReceiveRateId as string)).name}.`);
     }

        const updateTotalExchangedQuery = await this.updateTotalExchangedForCancel(shiftId , updateExchangeRateId , updateExchangeAmount , manager) ;
        if(updateTotalExchangedQuery.affected === 0) {
            this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find shift ${shiftId} and exchangerateId  ${updateExchangeRateId} to update in stock.`, manager);
            throw new BadRequestException(`Failed cause cannot find shift ${shiftId} and exchangerateId  ${updateExchangeRateId} to update in stock.`);
        }

        const updateTotalReceiveQuery = await this.updateTotalReceiveForCancel(shiftId , updateReceiveRateId , updateReceiveAmount , manager) ;
        if(updateTotalReceiveQuery.affected === 0) {
            this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause cannot find shift ${shiftId} and exchangerateId  ${updateExchangeRateId} to update in stock.`, manager);
            throw new BadRequestException(`Failed cause cannot find shift ${shiftId} and exchangerateId  ${updateExchangeRateId} to update in stock.`);
        }

    }

    async updateStockByTransferTransaction( user: any , updateStockDto: UpdateStockByTransferTransactionDto , manager: EntityManager ) {
        const isSenderExist = updateStockDto.sender ? true : false ;
        const isReceiverExist = updateStockDto.receiver ? true : false ;
        const promiseSenderShift = isSenderExist ? this.shiftsService.getLastShiftByBoothId(updateStockDto.sender ?? undefined) : Promise.resolve(null) ;
        const promiseReceiverShift = isReceiverExist ? this.shiftsService.getLastShiftByBoothId(updateStockDto.receiver ?? undefined) : Promise.resolve(null) ;

        // ดึงข้อมูล shift ของ sender และ receiver พร้อมกันเพื่อเพิ่มประสิทธิภาพ
        const [senderShift, receiverShift] = await Promise.all([promiseSenderShift, promiseReceiverShift]);

        // ห้ามเป็น null ทั้งคู่ เพราะถ้าไม่มี shift ของฝ่ายใดฝ่ายหนึ่งแปลว่าไม่สามารถทำธุรกรรมได้
        if (!isSenderExist && !isReceiverExist) {
            this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed cause both sender and receiver are not provided.`, manager);
            throw new BadRequestException(`Failed cause both sender and receiver are not provided.`);
        }


        //กรณี BtoCenter จะเอาออกจากสต็อกของสาขาแล้วไปเข้าสต็อกกลาง จะเป็นค่าnull
        if(isSenderExist == true && isReceiverExist == false) {
            const stockSender = await this.getStock(senderShift?.id , updateStockDto.exchangeRateId) ;
            if(!stockSender) {
                this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed cause cannot find stock for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId} in stock.`, manager);
                throw new BadRequestException(`Failed cause cannot find stock for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId} in stock.`);
            }
            const isOverBalance = !this.checkBalance(stockSender , updateStockDto.transferAmount) ;
            if(isOverBalance) {
                this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed cause the transfer amount ${updateStockDto.transferAmount} exceeds the available balance ${stockSender?.total_balance} for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId}.`, manager);
                throw new BadRequestException(`Failed cause the transfer amount ${updateStockDto.transferAmount} exceeds the available balance ${stockSender?.total_balance} for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId}.`);
            }
            return await this.updateTotalExchanged(senderShift?.id , updateStockDto.exchangeRateId , updateStockDto.transferAmount , manager) ;
        }


        // กรณี BtoB จะเอาออกจากสต็อกของสาขาแล้วไปเข้าสต็อกของอีกสาขาหนึ่ง
        if (isSenderExist) {
            const stockSender = await this.getStock(senderShift?.id , updateStockDto.exchangeRateId) ;
            if(!stockSender) {
                this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed cause cannot find stock for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId} in stock.`, manager);
                throw new BadRequestException(`Failed cause cannot find stock for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId} in stock.`);
            } 
            const isOverBalance = !this.checkBalance(stockSender , updateStockDto.transferAmount) ;
            if(isOverBalance) {
                this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed cause the transfer amount ${updateStockDto.transferAmount} exceeds the available balance ${stockSender?.total_balance} for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId}.`, manager);
                throw new BadRequestException(`Failed cause the transfer amount ${updateStockDto.transferAmount} exceeds the available balance ${stockSender?.total_balance} for sender's shift ${senderShift?.id} and exchange rate ${updateStockDto.exchangeRateId}.`);
            }
            await this.updateTotalExchanged(senderShift?.id , updateStockDto.exchangeRateId , updateStockDto.transferAmount , manager) ;
                 
        }

        // ถ้ามี receiver ให้ทำการอัพเดตสต็อกของ receiver ด้วย ไม่ว่าจะเป็นกรณี BtoB หรือ CenterToB
        const stockReceiver = await this.getStock(receiverShift?.id , updateStockDto.exchangeRateId) ;
        if(!stockReceiver) {
            const savedStock = await this.create(receiverShift?.id , updateStockDto.exchangeRateId , manager) ;
            if(!savedStock) {
                this.log(user, 'CREATE_TRANSFER_TRANSACTION_FAILED', `Failed to create stock for receiver's shift ${receiverShift?.id} and exchange rate ${updateStockDto.exchangeRateId}`, manager);
                throw new InternalServerErrorException(`Failed to create stock for receiver's shift ${receiverShift?.id} and exchange rate ${updateStockDto.exchangeRateId}`);
            }
        }
        return await this.updateTotalReceive(receiverShift?.id , updateStockDto.exchangeRateId , updateStockDto.transferAmount , manager) ;
    }

    async updateTotalReceive(shiftId : string | undefined , updateRecieveRateId : string | undefined , updateRecieveAmount : number , manager: EntityManager) {
        const stockRepo = manager.getRepository(Stock) ;
        const updateQuery =  await stockRepo.update({ shiftId: shiftId , exchangeRateId : updateRecieveRateId } , { total_received : () => `total_received + ${updateRecieveAmount}` , total_balance : () => `total_balance + ${updateRecieveAmount}` }) ;

        const THBId = await this.getTHBIdCache() ;
        if (updateRecieveRateId == THBId) {
           await this.updateCacheTotalReceive(shiftId??'' , updateRecieveAmount) ;         
        }

        return updateQuery;
    }

    async updateCacheTotalReceive(shiftId : string | undefined , updateRecieveAmount : number) {
        const THBSummary = this.getTHBSummaryCache(shiftId) ; 
        if(!THBSummary) {
            return null ; 
        }
         
        const promiseUpdateReceive =  this.redisClient.hincrby(shiftId??'','total_received' , Math.trunc(updateRecieveAmount)) ; 
        const promiseUpdateBalance =  this.redisClient.hincrby(shiftId??'','total_balance' , Math.trunc(updateRecieveAmount)) ;
        await Promise.all([promiseUpdateReceive , promiseUpdateBalance])  ; 
    }

     async updateTotalReceiveForCancel(shiftId : string | undefined , updateExchangeRateId : string | undefined , updateExchangeAmount : number , manager: EntityManager) {
        const stockRepo = manager.getRepository(Stock) ;
        const updateQuery =  await stockRepo.update({ shiftId: shiftId , exchangeRateId : updateExchangeRateId } , { total_received : () => `total_received - ${updateExchangeAmount}` , total_balance : () => `total_balance - ${updateExchangeAmount}` }) ;
        
        const THBId = await this.getTHBIdCache() ;
        if (updateExchangeRateId == THBId) {
           await this.updateCacheTotalReceiveForCancel(shiftId??'' , updateExchangeAmount) ;         
        }
        
        return updateQuery;
    }

    async updateCacheTotalReceiveForCancel(shiftId : string | undefined , updateExchangeAmount : number) {
        const THBSummary = this.getTHBSummaryCache(shiftId) ; 
        if(!THBSummary) {
            return null ; 
        }
         
        const promiseUpdateReceive =  this.redisClient.hincrby(shiftId??'','total_received' , Math.trunc(-updateExchangeAmount)) ; 
        const promiseUpdateBalance =  this.redisClient.hincrby(shiftId??'','total_balance' , Math.trunc(-updateExchangeAmount )) ;
        await Promise.all([promiseUpdateReceive , promiseUpdateBalance])  ; 
    }

    

    async updateTotalExchanged(shiftId : string | undefined , updateExchangeRateId : string | undefined , updateExchangeAmount : number , manager: EntityManager) {
        const stockRepo = manager.getRepository(Stock) ;
        const updateQuery =  await stockRepo.update({ shiftId: shiftId , exchangeRateId : updateExchangeRateId } , { total_exchanged : () => `total_exchanged + ${updateExchangeAmount}` , total_balance : () => `total_balance - ${updateExchangeAmount}` }) ;
        
        const THBId = await this.getTHBIdCache() ;
        if (updateExchangeRateId == THBId) {
            await this.updateCacheTotalExchanged(shiftId??'' , updateExchangeAmount) ;         
        }
        
        return updateQuery;
    }

    async updateCacheTotalExchanged(shiftId : string | undefined , updateExchangeAmount : number) {
        const THBSummary = this.getTHBSummaryCache(shiftId) ; 
        if(!THBSummary) {
            return null ; 
        }
         
        const promiseUpdateReceive =  this.redisClient.hincrby(shiftId??'','total_exchanged' , Math.trunc(updateExchangeAmount)) ; 
        const promiseUpdateBalance =  this.redisClient.hincrby(shiftId??'','total_balance' , Math.trunc(-updateExchangeAmount)) ;
        await Promise.all([promiseUpdateReceive , promiseUpdateBalance])  ; 
    }

    async updateTotalExchangedForCancel(shiftId : string | undefined , updateRecieveRateId : string | undefined , updateRecieveAmount : number , manager: EntityManager) {
        const stockRepo = manager.getRepository(Stock) ;
        const updateQuery =  await stockRepo.update({ shiftId: shiftId , exchangeRateId : updateRecieveRateId } , { total_exchanged : () => `total_exchanged - ${updateRecieveAmount}` , total_balance : () => `total_balance + ${updateRecieveAmount}` }) ;
        
        const THBId = await this.getTHBIdCache() ;
        if (updateRecieveRateId == THBId) {
            await this.updateCacheTotalExchangedCancel(shiftId??'' , updateRecieveAmount) ;         
        }
        
        return updateQuery;
    }

    async updateCacheTotalExchangedCancel(shiftId : string | undefined , updateRecieveAmount : number) {
        const THBSummary = this.getTHBSummaryCache(shiftId) ; 
        if(!THBSummary) {
            return null ; 
        }
        const promiseUpdateReceive =  this.redisClient.hincrby(shiftId??'','total_exchanged' , Math.trunc(-updateRecieveAmount)) ; 
        const promiseUpdateBalance =  this.redisClient.hincrby(shiftId??'','total_balance' , Math.trunc(updateRecieveAmount)) ;
        await Promise.all([promiseUpdateReceive , promiseUpdateBalance])  ; 
    }


    
    async updateStockByTransferTransactionForCancel( user: any , updateStockDto: UpdateStockByTransferTransactionForCancel , manager: EntityManager ) {
        const senderShiftId = updateStockDto.sender_shift ; 
        const receiverShiftId = updateStockDto.receiver_shift ; 
        const exchangeRateId = updateStockDto.exchangeRateId  ;
        const amount = updateStockDto.transferAmount ; 
        // sender -ยอดแลก +คงเหลือ
        if(senderShiftId) {
            await this.updateTotalExchangedForCancel(senderShiftId , exchangeRateId , amount , manager) ;
        }

        // receiver -ยอดรับ -คงเหลือ
        if(receiverShiftId) {
            const receiverStock = await this.getStock(receiverShiftId , exchangeRateId) ;   
            const isReceiveUpdateOverBalance = !this.checkBalance(receiverStock , amount) ;
            if(isReceiveUpdateOverBalance) {
                this.log(user, 'CANCEL_EXCHANGE_TRANSACTION_FAILED', `Failed cause the exchange amount ${amount} exceeds the available balance ${receiverStock?.total_balance} for shift ${receiverShiftId} and exchange rate ${exchangeRateId}.`, manager);
                throw new BadRequestException(`Failed cause the exchange amount ${amount} exceeds the available balance ${receiverStock?.total_balance} for shift ${receiverShiftId} and exchange rate ${(await this.exchangeRatesService.findById(exchangeRateId as string)).name}.`);
            }
            await this.updateTotalReceiveForCancel(receiverShiftId , exchangeRateId , amount , manager) ; 
        }
    }



}