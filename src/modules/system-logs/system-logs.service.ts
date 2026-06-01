import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SystemLog } from './entities/system-log.entity'; // Assuming you have a SystemLog entity defined
import { CreateSystemLogDto, QueryDateDto } from './dto/system-log.dto'; // Assuming you have a DTO for creating system logs
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  EntityManager,
  LessThan,
  QueryFailedError,
  Repository,
} from 'typeorm';

@Injectable()
export class SystemLogsService {
  constructor(
    @InjectRepository(SystemLog)
    private readonly systemLogRepo: Repository<SystemLog>,
  ) {}

  async createLog(
    currentUser: any,
    log: CreateSystemLogDto,
    manager?: EntityManager,
  ) {
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      cyan: '\x1b[36m',
    };

    const timestamp = new Date().toLocaleString('sv-SE');
    const isError =
      log.action.includes('FAILED') || log.action.includes('ERROR');
    const isSuccess = log.action.includes('SUCCESS');

    const actionColor = isError
      ? colors.red
      : isSuccess
        ? colors.green
        : colors.yellow;
    const details = log.details || '';
    const executorId = log.userId || 'System';

    console.log(
      `${colors.cyan}[APPLOG] ${timestamp}${colors.reset} : ` +
        `${actionColor}${colors.bright}${log.action}${colors.reset} - ` +
        `${details} - ` +
        `${colors.bright}By User: ${executorId}${colors.reset}`,
    );

    const repo = manager
      ? manager.getRepository(SystemLog)
      : this.systemLogRepo;

    try {
      const row = repo.create({
        userId: log.userId || null,
        action: log.action,
        details: log.details,
      });

      await repo.save(row);
    } catch (err) {
      const error = err as any;
      console.error(
        `${colors.red}[LOG_DB_ERROR]${colors.reset} : ${error.message}`,
      );

      if (error.code === '23503') {
        throw new BadRequestException('Log failed: User reference not found.');
      }
      if (error.code === '23502') {
        throw new BadRequestException('Log failed: Missing required fields.');
      }

      throw error;
    }
  }

  async getAllByDate(currentUser: any, query: QueryDateDto) {
    query.startDate.setHours(0, 0, 0, 0);
    query.endDate.setHours(23, 59, 59, 999);
    const logs = await this.systemLogRepo.find({
      relations: {
        user: true,
      },
      where: {
        createdAt: Between(query.startDate, query.endDate),
      },
      select: {
        user: {
          username: true,
        },
        userId: true,
        id: true,
        action: true,
        details: true,
        createdAt: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (!logs || logs.length === 0) {
      throw new NotFoundException('No logs found for the specified period.');
    }
    return logs;
  }

  // system-logs.service.ts

  async cleanupOldLogs() {
    const retentionMonths = 4; // กำหนดระยะเวลาการเก็บรักษาเป็น 4 เดือน
    const cutOffDate = new Date();
    cutOffDate.setMonth(cutOffDate.getMonth() - retentionMonths);

    const result = await this.systemLogRepo.delete({
      createdAt: LessThan(cutOffDate),
    });

    await this.createLog(null, {
      userId: null,
      action: 'SYSTEM_LOG_CLEANUP_SUCCESS',
      details: `Deleted ${result.affected} logs older than ${retentionMonths} months.`,
    });
  }
}
