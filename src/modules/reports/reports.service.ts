import { Injectable, NotFoundException } from '@nestjs/common';
import {} from './dto/report.dto';
import { ShiftsService } from './../shifts/shifts.service';
import { StocksService } from './../stocks/stocks.service';
import { CashCountsService } from './../cash-counts/cash-counts.service';
import { EmployeePerformance } from './entities/employeePerfor.entity';
import { Between, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Shift } from '../shifts/entities/shift.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ReportsService {
  constructor(
    private readonly shiftService: ShiftsService,
    private readonly stockService: StocksService,
    private readonly cashCountService: CashCountsService,
    @InjectRepository(EmployeePerformance)
    private readonly employeePerformanceRepository: Repository<EmployeePerformance>,
    private readonly dataSource: DataSource,
  ) {}
  //helper
  //create
  //read
  async getPreviousShiftData(user: any, boothId: string) {
    const shiftData =
      await this.shiftService.getNonOpenPreviousShiftByBoothId(boothId);
    if (shiftData) {
      const shiftId = shiftData?.id;
      const stockDataPromise = this.stockService.getStockByShiftId(shiftId);
      const cashCountDataPromise =
        this.cashCountService.getCashCountByShiftId(shiftId);
      const [stockData, cashCountData] = await Promise.all([
        stockDataPromise,
        cashCountDataPromise,
      ]);

      return {
        shift: shiftData,
        stock: stockData,
        cash: cashCountData,
      };
    }

    return {};
  }
  //update
  //delete

  //==================report employee performance ================

 private async saveCalculatedPerformance(userId: string, year: number, month: number) {
    const reportMonth = new Date(year, month - 1, 1);
    
    // ดึงกะการทำงานในเดือนนั้นๆ
    const shifts = await this.shiftService.getShiftsByUserIdAndMonth(userId, month, year);

    const totalBalanceCheck = shifts.reduce(
      (sum, shift) => Number(sum) + Number(shift.balance_check || 0), 0
    );
    const totalCashAdvance = shifts.reduce(
      (sum, shift) => Number(sum) + Number(shift.cash_advance || 0), 0
    );

    let performance = await this.employeePerformanceRepository.findOne({
      where: { userId, reportMonth }
    });

    if (performance) {
      performance.totalBalanceCheck = totalBalanceCheck;
      performance.totalCashAdvance = totalCashAdvance;
    } else {
      performance = this.employeePerformanceRepository.create({
        userId,
        reportMonth,
        totalBalanceCheck,
        totalCashAdvance,
      });
    }

    return await this.employeePerformanceRepository.save(performance);
  }

  async updateEmployeePerformance(userId: string) {
    const now = new Date();
    return this.saveCalculatedPerformance(userId, now.getFullYear(), now.getMonth() + 1);
  }

  async updateEmployeePerformanceForMonth(userId: string, date: Date) {
    const d = new Date(date);
    return this.saveCalculatedPerformance(userId, d.getFullYear(), d.getMonth() + 1);
  }

  async getEmployeePerformanceByUserIdAndMonth(userId: string, date: Date, withShifts: boolean) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const reportMonth = new Date(year, month - 1, 1);

    const relations = withShifts ? ['user', 'user.shifts', 'user.shifts.booth'] : ['user'];
    
    return await this.employeePerformanceRepository.findOne({
      relations,
      where: {
        userId,
        reportMonth,
        ...(withShifts && {
          user: {
            shifts: {
              startTime: Between(new Date(year, month - 1, 1), new Date(year, month, 0))
            }
          }
        })
      },
      select: {
        id: true,
        totalBalanceCheck: true,
        totalCashAdvance: true,
        reportMonth: true,
        user: {
          id: true,
          username: true,
          ...(withShifts && {
            shifts: {
              id: true,
              startTime: true,
              endTime: true,
              balance_check: true,
              cash_advance: true,
              booth: { id: true, name: true }
            }
          })
        }
      }
    });
  }

  async getAllEmployeePerformance(startDate?: Date, endDate?: Date) {
    const where = startDate && endDate ? {
      reportMonth: Between(
        new Date(startDate.getFullYear(), startDate.getMonth(), 1),
        new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0)
      )
    } : {};

    return await this.employeePerformanceRepository.find({
      relations: ['user'],
      where,
      select: {
        id: true,
        totalBalanceCheck: true,
        totalCashAdvance: true,
        reportMonth: true,
        user: { id: true, username: true }
      }
    });
  }

  async getEmployeePerformanceByID(id: string) {
    const performance = await this.employeePerformanceRepository.findOne({
      relations: ['user', 'user.shifts', 'user.shifts.booth'],
      where: { id },
        select: {
            id: true,
            totalBalanceCheck: true,
            totalCashAdvance: true,
            reportMonth: true,
            user: {
                id: true,
                username: true,
                shifts: {
                    id: true,
                    startTime: true,
                    endTime: true,
                    balance_check: true,
                    cash_advance: true,
                    booth: { id: true, name: true }
                }
            }
        }
    });
    if (!performance) throw new NotFoundException('Performance record not found');
    return performance;
  }
}