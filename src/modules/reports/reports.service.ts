import { Injectable } from "@nestjs/common";
import {} from './dto/report.dto' ; 
import { ShiftsService } from './../shifts/shifts.service'
import { StocksService } from "./../stocks/stocks.service"; 
import { CashCountsService } from "./../cash-counts/cash-counts.service"; 

@Injectable() 
export class ReportsService {
    constructor(
        private readonly shiftService : ShiftsService ,
        private readonly stockService : StocksService ,
        private readonly cashCountService : CashCountsService ,  
    ) 
    {}
    //helper
    //create
    //read
    async getPreviousShiftData(user : any , boothId : string) {
        const data = []  ; 

        const shiftData = await this.shiftService.getNonOpenPreviousShiftByBoothId(boothId) ; 
        if(shiftData) {
            const shiftId = shiftData?.id  ;
            const stockData = this.stockService.getStockByShiftId(shiftId)  ;
            const cashCountData = this.cashCountService.getCashCountByShiftId(shiftId) ; 
            await Promise.all([stockData , cashCountData]) ; 

            data.push(shiftId) ;
            data.push(stockData) ; 
        }
        
        return data ; 
    }
    //update
    //delete

}