import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Query,
  Header,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, GetImgDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import * as mime from 'mime-types';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  @Get()
  findOne(
    @CurrentUser() currentUser: any,
    @Query() getImgDto: GetImgDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const contentType =
      mime.lookup(getImgDto.passportImg) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    return this.customersService.getImg(currentUser, getImgDto);
  }
}
