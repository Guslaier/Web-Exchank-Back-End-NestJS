import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Header,
} from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  // 1. ดึงข้อมูลเรททั้งหมด (เรียงตามชื่อสกุลเงินและช่วงเงิน)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async findAll() {
    return await this.exchangeRatesService.findAll();
  }

  // 2. สร้างเรทใหม่ (เช่น เพิ่ม Tier แลกเยอะเรทถูก)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Post()
  async create(@CurrentUser() user: any, @Body() data: Partial<ExchangeRate>) {
    return await this.exchangeRatesService.create(user, data);
  }

  // 3. อัพเดตเรททีละตัว (เช่น แก้สูตรคำนวณหรือแก้เรทเฉพาะตัว)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Post('bulk-update')
  async mutiUpdate(
    @CurrentUser() user: any,
    @Body('updates') updates: Partial<ExchangeRate>[],
  ) {
    console.log('Received bulk update request in controller:', updates);
    return await this.exchangeRatesService.Mutiupdate(user, updates);
  }

  // 4. บังคับอัพเดตเรททั้งหมด (เช่น เมื่อมีการเปลี่ยนแปลงสูตรคำนวณหลักหรือมีการอัพเดตเรทหลัก)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch('sync/force-all')
  async syncAll(@CurrentUser() user: any) {
    await this.exchangeRatesService.updateRateAll(user);
    return { message: 'All child rates have been recalculated successfully' };
  }

  // 5. ลบเรท (เช่น ลบ Tier ที่ไม่ต้องการแล้ว)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Delete(':id')
  async remove(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.exchangeRatesService.delete(user, id);
    return { message: 'Deleted successfully' };
  }

  // 6. อัพเดตเรททีละตัว (เช่น แก้สูตรคำนวณหรือแก้เรทเฉพาะตัว)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: Partial<ExchangeRate>,
  ) {
    return await this.exchangeRatesService.update(user, id, data);
  }
}
