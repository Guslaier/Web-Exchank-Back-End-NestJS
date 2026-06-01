import {
  Controller,
  UseGuards,
  Param,
  Query,
  Body,
  Put,
  Get,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GetPreviousShift, GetShifts, PutShiftBody } from './dto/report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportService: ReportsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('previous/shift')
  getPreviousShfit(@CurrentUser() user: any, @Query() query: GetPreviousShift) {
    return this.reportService.getPreviousShiftData(user, query.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('shifts')
  getShfits(@CurrentUser() user: any, @Query() query: GetShifts) {
    return this.reportService.getShiftsReport(
      user,
      query.status,
      query.from,
      query.to,
    );
  }

  //==================report employee performance ================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  // 1. Update ข้อมูล (ใช้ Sync เพื่อความหมายที่ชัดเจน)
  @Put('sync/:userId')
  updateCurrent(@Param('userId') userId: string, @Body('date') date?: Date) {
    if (date) {
      return this.reportService.updateEmployeePerformanceForMonth(userId, date);
    }
    return this.reportService.updateEmployeePerformance(userId);
  }

  // 2. ดึงข้อมูลภาพรวม (รองรับทั้ง All และ Range ใน Path เดียว)
  @Get()
  getAll(
    @Query('startDate') start?: string,
    @Query('endDate') end?: string,
    @Query('withShifts') withShifts: string = 'false',
  ) {
    if (start && end) {
      return this.reportService.getAllEmployeePerformance(
        new Date(start),
        new Date(end),
        withShifts === 'true',
      );
    }
    return this.reportService.getAllEmployeePerformance();
  }

  // 3. ดึงข้อมูลรายคนตามเดือน (แยกว่าจะเอา Shift หรือไม่เอาด้วย Query boolean)
  @Get('user/:userId')
  getByUser(
    @Param('userId') userId: string,
    @Query('date') date: string,
    @Query('withShifts') withShifts: string,
  ) {
    return this.reportService.getEmployeePerformanceByUserIdAndMonth(
      userId,
      new Date(date),
      withShifts === 'true',
    );
  }

  // 4. ดึงตาม ID ของ Record (สำหรับดูรายละเอียดเชิงลึก)
  @Get('detail/:id')
  getById(@Param('id') id: string) {
    return this.reportService.getEmployeePerformanceByID(id);
  }
}
