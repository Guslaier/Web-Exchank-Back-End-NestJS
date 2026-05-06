import { Controller , UseGuards , Param  , Query , Body , Put , Get } from "@nestjs/common";
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator'; 
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GetPreviousShift , PutShiftBody } from './dto/report.dto'
import { ReportsService } from './reports.service'  ;
import { report } from "process";

@Controller('reports') 
export class ReportsController {

    constructor(
        private readonly reportService : ReportsService ,
    ){}

    @UseGuards(JwtAuthGuard , RolesGuard)
    @Roles('ADMIN' , 'MANAGER')
    @Get('previous/shift')
    getPreviousShfit(@CurrentUser() user : any , @Query() query : GetPreviousShift) {
        return this.reportService.getPreviousShiftData(user , query.id) ; 
    }

}