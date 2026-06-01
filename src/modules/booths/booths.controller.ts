import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Header,
} from '@nestjs/common';
import { BoothsService } from './booths.service';
import { CreateBoothDto, UpdateBoothDto } from './dto/booth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('booths')
export class BoothsController {
  constructor(private readonly boothsService: BoothsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('create')
  create(@CurrentUser() user: any, @Body() createBoothDto: CreateBoothDto) {
    return this.boothsService.create(user, createBoothDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('find-all')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findAll() {
    return this.boothsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('find-one/:id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findOne(@Param('id') id: string) {
    return this.boothsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('update/:id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateBoothDto: UpdateBoothDto,
  ) {
    return this.boothsService.update(user, id, updateBoothDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('remove/:id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.boothsService.remove(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('set-currentshift/:id')
  setCurrentShift(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('shiftId') shiftId: string,
  ) {
    return this.boothsService.setCurrentShift(user, id, shiftId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('set-deactive/:id')
  setDeActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.boothsService.setDeActive(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Put('set-reactive/:id')
  setReActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.boothsService.setReActive(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('find-by-shift/:shiftId')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  findBoothByShiftId(
    @CurrentUser() user: any,
    @Param('shiftId') shiftId: string,
  ) {
    return this.boothsService.findBoothByShiftId(shiftId);
  }
}
