import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import {
  QueryDateDto,
  QueryShiftId,
  ShiftAuditBody,
  ShiftAuditParam,
  UserIdDto,
  ShiftIdDto,
  BoothIdDto,
  GetShiftBoothQuery,
  GetShiftPreviousCashcount,
  GetShiftCurrrentDetails,
} from './dto/shift.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('actives')
  findActivesShift(@Query() query: QueryDateDto) {
    return this.shiftsService.getActiveShifts(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get()
  findShifts(@Query() query: QueryDateDto) {
    return this.shiftsService.getShifts(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('booth')
  getShiftsBooth(@Query() query: GetShiftBoothQuery) {
    return this.shiftsService.getLastShiftByBoothId(query.id, false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('previous/cashcount')
  getShiftPreviousCashcount(@Query() query: GetShiftPreviousCashcount) {
    return this.shiftsService.getCashCountFromPreviousShift(query.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('current/detail/')
  getShiftsCurrentDetails(@Query() query: GetShiftCurrrentDetails) {
    return this.shiftsService.getCurrentShiftDetails(query.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  open(@CurrentUser() currentUser: any, @Body() body: BoothIdDto) {
    return this.shiftsService.openShift(currentUser, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE', 'ADMIN', 'MANAGER')
  @Put()
  close(@CurrentUser() currentUser: any, @Body() body: ShiftIdDto) {
    return this.shiftsService.setStatusToCLose(currentUser, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('audit/:id')
  PutShift(
    @CurrentUser() user: any,
    @Param() param: ShiftAuditParam,
    @Body() body: ShiftAuditBody,
  ) {
    return this.shiftsService.updateAuditShift(user, param.id, body);
  }
}
