import { Module } from "@nestjs/common";
import { ReportsController} from './reports.controller' ; 
import { ReportsService } from './reports.service' ; 
import { ShiftsModule } from './../shifts/shifts.module' ;
import { StocksModule } from "./../stocks/stocks.module";
import { CashCountsModule } from "./../cash-counts/cash-counts.module" ; 
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmployeePerformance } from "./entities/employeePerfor.entity";

@Module({
    imports :[
        TypeOrmModule.forFeature([EmployeePerformance]) ,
        ShiftsModule , StocksModule , CashCountsModule] ,
    controllers : [ReportsController] , 
    providers : [ReportsService] , 
    exports :[ReportsService] ,
})
export class ReportsModule {}