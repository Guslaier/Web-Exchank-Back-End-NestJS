import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  CreateUserResponseDto,
  UpdateUserDto,
} from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard) // ใช้ Guards ทั้ง JWT และ Roles เพื่อป้องกันการเข้าถึง Endpoint นี้
  @Roles('MANAGER', 'ADMIN') // จำกัดเฉพาะผู้ใช้ที่มี Role เป็น 'MANAGER' หรือ 'ADMIN' เท่านั้นที่สามารถเข้าถึง Endpoint นี้ได้
  @Post('register')
  create(@Body() createUserDto: CreateUserResponseDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Get('find-all')
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('find-one/:id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Put('update/:id')
  update(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(currentUser, id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Delete('remove/:id')
  remove(@CurrentUser() currentUser: any, @Param('id') id: string) {
    return this.usersService.remove(currentUser, id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password/:id')
  changePassword(
    @CurrentUser() currentUser: any,
    @Param('id') id: string,
    @Body() body: { newPass: string; oldPass: string },
  ) {
    return this.usersService.changePassword(
      currentUser,
      body.newPass,
      body.oldPass,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Roles('MANAGER', 'ADMIN')
  @Post('request-reset-password')
  requestResetPassword(
    @CurrentUser() currentUser: any,
    @Body('email') email: string,
    @Body('id') id: string,
  ) {
    return this.usersService.requestResetPassword(currentUser, email, id); // ใช้ email เป็น id ชั่วคราวสำหรับการส่ง token reset password
  }

  @Put('reset-password')
  resetPassword(
    @Body() body: { email: string; token: string; newPassword: string },
  ) {
    return this.usersService.resetPassword(
      body.email,
      body.token,
      body.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Put('set-deactivate/:id')
  deactivate(@CurrentUser() currentUser: any, @Param('id') id: string) {
    return this.usersService.deactivate(currentUser, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  @Put('set-reactivate/:id')
  reactivate(@CurrentUser() currentUser: any, @Param('id') id: string) {
    return this.usersService.reactivate(currentUser, id);
  }
}
