import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
  StreamableFile,
  Response,
} from '@nestjs/common';
import { SystemLogsService } from './../system-logs/system-logs.service';
import { ShiftsService } from './../shifts/shifts.service';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { GetImgDto } from './dto/customer.dto';
import { join } from 'path';
import { existsSync, createReadStream } from 'fs';

@Injectable()
export class CustomersService {
  constructor(
    private readonly systemLogsService: SystemLogsService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly shiftsService: ShiftsService,
  ) {}

  private async log(
    user: any,
    action: string,
    details: string,
    manager?: EntityManager,
  ) {
    await this.systemLogsService.createLog(
      user,
      {
        userId: user?.id || null,
        action,
        details,
      },
      manager, // ส่งต่อ manager เพื่อให้อยู่ใน Transaction เดียวกัน
    );
  }

  async create(
    manager: EntityManager,
    exchangeTransactionId: string,
    passportNo: string,
    fullName: string,
    nationality: string,
    phoneNumber: string,
    hotelName: string,
    roomNumber: string,
    customer_img_filename: string,
  ) {
    try {
      const customerRepo = manager.getRepository(Customer);
      const newCustomer = customerRepo.create({
        transactionId: exchangeTransactionId,
        passportNo: passportNo,
        passportImg: customer_img_filename,
        fullName: fullName,
        nationality: nationality,
        phoneNumber: phoneNumber,
        hotelName: hotelName,
        roomNumber: roomNumber,
      });
      const customerResult = await customerRepo.save(newCustomer);
      await this.log(
        null,
        'CREATE_CUSTOMER_SUCCESS',
        `Created customer with passportNo: ${passportNo}`,
        manager,
      );
      return customerResult;
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      await this.log(
        null,
        'CREATE_CUSTOMER_FAILED',
        `Failed to create customer with passportNo: ${passportNo}. Error: ${err}`,
        manager,
      );
      throw new InternalServerErrorException('Failed to create customer');
    }
  }

  async getImg(currentUser: any, getImgDto: GetImgDto) {
    const isEmployee = currentUser.role === 'EMPLOYEE' ? true : false;

    if (isEmployee) {
      const activeShift = await this.shiftsService.getLastShiftByUserId(
        currentUser.id,
      );

      if (!activeShift) {
        throw new NotFoundException('Your active shift is not found.');
      }

      const shift = await this.customerRepository.findOne({
        relations: {
          transaction: true,
        },
        where: {
          passportImg: getImgDto.passportImg,
          transaction: {
            shiftId: activeShift.id,
          },
        },
      });

      if (!shift) {
        throw new BadRequestException(
          'This customer image is not in your active shift.',
        );
      }
    }

    const filePath = join('upload/customers', getImgDto.passportImg);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Customer image not found.');
    }

    const file = createReadStream(filePath);

    return new StreamableFile(file);
  }
}
