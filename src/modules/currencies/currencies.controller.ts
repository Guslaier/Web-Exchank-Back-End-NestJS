import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Header,
} from '@nestjs/common';
import { CurrenciesService } from './currencies.service';
import { CurrencyUpdateModeDto } from './dto/currency.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  // 1. ดึงข้อมูลสกุลเงินทั้งหมด (Select All)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findAll() {
    return this.currenciesService.findAll();
  }

  // 2. สั่งอัปเดตข้อมูลจาก BOT API ด้วยตัวเอง (Manual Trigger Auto Update)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Post('sync-bot')
  async syncWithBot() {
    return await this.currenciesService.updateAutoRateAll();
  }
  // 3. ตั้งค่าโหมดการอัปเดต (Auto/Manual) แบบ Bulk Update - ส่งมาเป็น Array
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch('mode')
  async setModeBulk(
    @CurrentUser() user: any,
    @Body('data') updateData: CurrencyUpdateModeDto[],
  ) {
    return await this.currenciesService.setUpdateModeBulk(user, updateData);
  }

  // 4. อัปเดตเรทแบบ Manual (Bulk Update - ส่งมาเป็น Array)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Patch('manual-update')
  async updateManualBulk(
    @CurrentUser() user: any,
    @Body('data') data: { id: string; buyRate: number; sellRate: number }[],
  ) {
    return await this.currenciesService.updateManualBulk(user, data);
  }

  // 5. ดึงข้อมูลรายตัว
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get('id/:id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.currenciesService.findOne(id);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get('code/:id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findOneByCode(@Param('id') id: string) {
    return this.currenciesService.findOneByCode(id);
  }
}
