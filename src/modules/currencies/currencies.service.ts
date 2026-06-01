import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Cron, Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { firstValueFrom } from 'rxjs';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { CurrencyUpdateModeDto, UpdateMode } from './dto/currency.dto';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { handleError } from '../../common/error/error';
import { re } from 'mathjs';
import { SseService } from '../sse/sse.service';

@Injectable()
export class CurrenciesService implements OnModuleInit {
  private readonly logger = new Logger(CurrenciesService.name);
  private readonly baseUrl =
    process.env.BOT_API_URL ||
    'https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/';
  private readonly authHeader = {
    Accept: '*/*',
    Authorization: process.env.BOT_API_KEY || '',
  };

  // ข้อมูลสำรองกรณี API ล่ม (Fallback Data)
  // ข้อมูลสำรองกรณี API ล่ม (Fallback Data) - เพิ่มสกุลเงินยอดนิยม
  private readonly fallbackCurrencies = [
    {
      code: 'THB',
      name: 'Thailand : Baht (THB)',
      buyRate: 1,
      sellRate: 1,
    },
    {
      code: 'USD',
      name: 'United States : Dollar (USD)',
      buyRate: 32.4313,
      sellRate: 32.7511,
    },
    {
      code: 'GBP',
      name: 'United Kingdom : Pound Sterling (GBP)',
      buyRate: 43.3639,
      sellRate: 44.1317,
    },
    {
      code: 'EUR',
      name: 'Eurozone : Euro (EUR)',
      buyRate: 37.4028,
      sellRate: 38.025,
    },
    {
      code: 'JPY',
      name: 'Japan : Yen (JPY)',
      buyRate: 0.2032,
      sellRate: 0.209,
    }, // Normalize แล้ว (ต่อ 1 เยน)
    {
      code: 'SGD',
      name: 'Singapore : Dollar (SGD)',
      buyRate: 25.2148,
      sellRate: 25.7528,
    },
    {
      code: 'CNY',
      name: 'China : Yuan Renminbi (CNY)',
      buyRate: 4.6879,
      sellRate: 4.7755,
    },
    {
      code: 'HKD',
      name: 'Hong Kong : Dollar (HKD)',
      buyRate: 4.1304,
      sellRate: 4.1937,
    },
    {
      code: 'AUD',
      name: 'Australia : Dollar (AUD)',
      buyRate: 22.7211,
      sellRate: 23.4431,
    },
    {
      code: 'MYR',
      name: 'Malaysia : Ringgit (MYR)',
      buyRate: 8.1808,
      sellRate: 8.4041,
    },
  ];

  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepo: Repository<Currency>,
    private readonly httpService: HttpService,
    private readonly dataSource: DataSource,
    @Inject(SystemLogsService)
    private readonly systemLogsService: SystemLogsService,
    @Inject(ExchangeRatesService)
    private readonly exchangeRatesService: ExchangeRatesService,
    @Inject(SseService)
    private readonly sseService: SseService,
  ) {}

  @Cron(process.env.UPDATE_RATE_AUTO_TIME || '0 7 * * *', {
    name: 'daily_morning_update',
    timeZone: 'Asia/Bangkok', // กำหนดเป็นเวลาไทย
  })
  async handleMorningUpdate() {
    this.logger.log('[Cron] Starting 07:00 AM mandatory update...');
    await this.updateAutoRateAll();
  }

  // ทุกๆ 5 ชั่วโมง (18000000 ms) จะพยายามอัปเดตจาก BOT API
  @Interval(
    process.env.UPDATE_RATE_INTERVAL
      ? parseInt(process.env.UPDATE_RATE_INTERVAL)
      : 18000000,
  ) // 5 ชั่วโมง
  async handleIntervalUpdate() {
    this.logger.log('[Interval] Starting 5-hour periodic update...');
    await this.updateAutoRateAll();
  }

  // เมื่อโมดูลนี้ถูกโหลดขึ้นมา จะพยายามอัปเดตจาก BOT API ทันที
  async onModuleInit() {
    this.logger.log('Initializing Currencies System...');

    // พยายามอัปเดตจาก BOT ก่อน
    const apiSuccess = await this.updateAutoRateAll();

    // ถ้า API ล้มเหลว และใน DB ยังไม่มีข้อมูลเลย ให้ใช้ Fallback Seed
    if (!apiSuccess) {
      const count = await this.currencyRepo.count();
      if (count === 0) {
        this.logger.warn(
          'BOT API Offline on startup. Seeding fallback data...',
        );
        await this.seedFallbackData();
      }
    }
  }

  // +++++++++++++++++++++++++++ 1. Seed Fallback Data ++++++++++++++++++++++++++++
  private async seedFallbackData() {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Currency);

        // ตรวจสอบอีกครั้งว่ามีข้อมูลหรือไม่ เพื่อป้องกันการซ้ำซ้อน
        for (const data of this.fallbackCurrencies) {
          const currency = repo.create({
            ...data, // มาร์คไว้ว่ายังไม่เคยผ่าน BOT (ทำให้ยัง Manual ไม่ได้)
            updateMode: UpdateMode.AUTO,
          });
          await repo.save(currency);
          await this.exchangeRatesService.createDefaultSubRate(
            manager,
            currency,
          ); // สร้างเรทลูกเริ่มต้นให้ด้วย
        }
        this.logger.log('Fallback data seeded successfully.');
      });
    } catch (error) {
      handleError(error, 'Failed to seed fallback data');
    }
  }

  // +++++++++++++++++++++++++++ 2. Auto Update All (BOT API) ++++++++++++++++++++++++++++
  async updateAutoRateAll(): Promise<boolean> {
    try {
      const SynUpdataData: { code: string; buy: number; sell: number }[] = [];
      const today = new Date().toISOString().split('T')[0];
      const dateRes = await firstValueFrom(
        this.httpService.get(this.baseUrl, {
          params: { start_period: today, end_period: today },
          headers: this.authHeader,
        }),
      );

      const lastUpdated = dateRes.data?.result?.data?.data_header?.last_updated;
      if (!lastUpdated) return false;

      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Currency);
        const rateRes = await firstValueFrom(
          this.httpService.get(this.baseUrl, {
            params: { start_period: lastUpdated, end_period: lastUpdated },
            headers: this.authHeader,
          }),
        );

        const detailRates = rateRes.data?.result?.data?.data_detail;
        if (!detailRates) throw new Error('Invalid BOT response');
        detailRates.push({
          currency_id: 'THB',
          currency_name_th: 'Thailand : Baht (THB)',
          buying_transfer: '1',
          selling: '1',
        });
        for (const rate of detailRates) {
          const code = rate.currency_id;
          let buy = parseFloat(rate.buying_transfer) || 0;
          let sell = parseFloat(rate.selling) || 0;

          // Normalize สำหรับสกุลเงินที่มีหน่วยย่อยมาก เช่น JPY (เยน) และ IDR (รูเปียห์) ให้หารด้วย 100 หรือ 1000 ตามลำดับ เพื่อให้แสดงผลเป็นอัตราแลกเปลี่ยนต่อหน่วยหลัก
          if (code === 'JPY') {
            buy /= 100;
            sell /= 100;
          }
          if (code === 'IDR') {
            buy /= 1000;
            sell /= 1000;
          }

          const existing = await repo.findOne({ where: { code } });

          if (existing) {
            // อัปเดตเฉพาะโหมด AUTO หรือตัวที่ยังไม่เคยมีต้นกำเนิดจาก BOT
            if (
              existing.updateMode === UpdateMode.AUTO ||
              !existing.hasInitialBotData
            ) {
              SynUpdataData.push({ code, buy, sell });
              await repo.update(
                { code },
                {
                  buyRate: buy,
                  sellRate: sell,
                  hasInitialBotData: true,
                  lastBotUpdate: new Date(lastUpdated),
                },
              );
            }
          } else {
            SynUpdataData.push({ code, buy, sell });
            const newCurrency = repo.create({
              code,
              name: rate.currency_name_th || code,
              buyRate: buy,
              sellRate: sell,
              hasInitialBotData: true,
              lastBotUpdate: new Date(lastUpdated),
            });
            await repo.save(newCurrency);
            await this.exchangeRatesService.createDefaultSubRate(
              manager,
              newCurrency,
            ); // สร้างเรทลูกเริ่มต้นให้ด้วย
          }
        }

        await this.systemLogsService.createLog(
          null,
          {
            userId: null, // หรือใส่ userId จริงถ้ามี context
            action: 'CURRENCY_AUTO_UPDATE_ALL_SUCCESS',
            details: `Synced from BOT for date: ${lastUpdated} details: ${SynUpdataData?.map((r: any) => r.code + '(b/s): ' + r.buy.toFixed(4) + '/' + r.sell.toFixed(4)).join(', ') || 'No data in mode AUTO'} `,
          },
          manager,
        );
      });
      await this.exchangeRatesService.updateRateAll(); // อัปเดตเรทลูกทั้งหมดหลังจากอัปเดตเรทแม่เสร็จ
      return true;
    } catch (err: any) {
      this.logger.error(`BOT API Sync Failed: ${err.message}`);
      await this.systemLogsService.createLog(null, {
        userId: null,
        action: 'CURRENCY_AUTO_UPDATE_ALL_FAILED',
        details: `Error: ${err.message}`,
      });
      return false;
    }
  }

  // +++++++++++++++++++++++++++ 3. Manual Update Bulk ++++++++++++++++++++++++++++
  async updateManualBulk(
    user: any,
    updateData: { id: string; buyRate: number; sellRate: number }[],
  ) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Currency);
        const updatedCodes: any = [];
        const skippedCodes: any = []; // เก็บตัวที่ข้ามเพราะไม่ใช่โหมด MANUAL

        // 1. Validation เบื้องต้น
        if (
          !updateData ||
          !Array.isArray(updateData) ||
          updateData.length === 0
        ) {
          throw new BadRequestException(
            'Invalid input data. Expecting an array.',
          );
        }

        for (const item of updateData) {
          // ค้นหาข้อมูล Currency
          const currency = await repo.findOne({ where: { id: item.id } });

          if (!currency) {
            this.logger.warn(`ID ${item.id} not found during bulk update`);
            continue; // หรือจะ throw Error ก็ได้แล้วแต่ดีไซน์ครับ
          }

          // ตรวจสอบโหมด: ถ้าไม่ใช่ MANUAL ให้ข้ามไป (Skipped)
          if (currency.updateMode !== UpdateMode.MANUAL) {
            skippedCodes.push(currency.code);
            continue; // ข้ามการอัปเดตตัวนี้ไปทำงานตัวถัดไป
          }

          if (item.buyRate > item.sellRate) {
            skippedCodes.push(currency.code);
            continue; // ข้ามการอัปเดตตัวนี้ไปทำงานตัวถัดไป
          }

          // 2. อัปเดตเฉพาะตัวที่เป็น MANUAL
          await repo.update(item.id, {
            buyRate: item.buyRate,
            sellRate: item.sellRate,
            updatedAt: new Date(),
          });

          updatedCodes.push({
            code: currency.code,
            buyRate: item.buyRate,
            sellRate: item.sellRate,
          });
        }

        // 3. บันทึก Log เฉพาะตัวที่อัปเดตสำเร็จ
        if (updatedCodes.length > 0) {
          await this.systemLogsService.createLog(
            null,
            {
              userId: null,
              action: 'CURRENCY_MANUAL_UPDATE_BULK_SUCCESS',
              details: `Successfully updated details: 
        ${updatedCodes.map((c: any) => `${c.code} (b/s): ${c.buyRate.toFixed(4)}/${c.sellRate.toFixed(4)}`).join(', ')}
        ${skippedCodes.length > 0 ? `| Skipped (Not Manual): ${skippedCodes.join(', ')}` : ''}`,
            },
            manager,
          );
        }

        await this.exchangeRatesService.updateRateAll(user, manager); // อัปเดตเรทลูกทั้งหมดหลังจากอัปเดตเรทแม่เสร็จ
        this.sseService.triggerRefreshSignal(); // แจ้งให้หน้าเว็บรีเฟรชข้อมูล
        // 4. คืนผลลัพธ์ให้ชัดเจนว่าตัวไหนผ่าน ตัวไหนติด
        return {
          message: 'Bulk update processed',
          successCount: updatedCodes.length,
          updated: updatedCodes,
          skippedCount: skippedCodes.length,
          skipped: skippedCodes,
          note:
            skippedCodes.length > 0
              ? 'Some currencies were skipped because they are in AUTO mode.'
              : null,
        };
      });
    } catch (err) {
      handleError(err, 'Failed to update manual bulk');
    }
  }
  // +++++++++++++++++++++++++++ 4. Select All ++++++++++++++++++++++++++++
  async findAll() {
    return await this.currencyRepo.find({
      order: { updateMode: 'DESC', code: 'ASC' },
    });
  }

  async findOne(id: string) {
    const currency = await this.currencyRepo.findOne({ where: { id } });
    if (!currency) throw new NotFoundException('Not found');
    return currency;
  }
  async findOneByCode(code: string) {
    const currency = await this.currencyRepo.findOne({ where: { code } });
    if (!currency) throw new NotFoundException('Not found');
    return currency;
  }

  // +++++++++++++++++++++++++++ 5. Toggle Mode ++++++++++++++++++++++++++++
  // เพิ่ม manager?: EntityManager เข้ามา และเปลี่ยนไปใช้ repo ตามสถานการณ์
  async setUpdateMode(user: any, id: string, mode: UpdateMode, manager?: any) {
    // ถ้ามี manager ให้ใช้ manager ถ้าไม่มีให้ใช้ repo ปกติ
    const repo = manager ? manager.getRepository(Currency) : this.currencyRepo;

    const currency = await repo.findOne({ where: { id } });
    if (!currency) throw new NotFoundException('Not found');

    if (mode === UpdateMode.MANUAL && !currency.hasInitialBotData) {
      throw new ForbiddenException('Missing initial BOT data.');
    }

    await repo.update(id, { updateMode: mode });

    await this.systemLogsService.createLog(user, {
      userId: user?.id || null,
      action: 'CURRENCY_MODE_CHANGE_SUCCESS',
      details: `Currency ${currency.code} update mode changed to: ${mode}`,
    });
    return repo.findOne({ where: { id } });
  }

  async setUpdateModeBulk(user: any, updateData: CurrencyUpdateModeDto[]) {
    try {
      if (
        !updateData ||
        !Array.isArray(updateData) ||
        updateData.length === 0
      ) {
        throw new BadRequestException(
          'Invalid input data. Expecting an array.',
        );
      }

      const results = await this.dataSource.transaction(async (manager) => {
        console.log('Received bulk mode update request:', updateData);

        const results = [];

        // ✅ ใช้ for...of เพื่อให้ทำงานเรียงลำดับ ป้องกัน Database Deadlock
        for (const item of updateData) {
          try {
            // ✅ โยน manager เข้าไปให้ setUpdateMode ใช้งาน
            const report = await this.setUpdateMode(
              user,
              item.id,
              item.mode,
              manager,
            );
            results.push({ ...report, statusUpdate: true });
          } catch (err: any) {
            console.error(`Failed to update ${item.id}:`, err);
            results.push({
              id: item.id,
              error: err.message || 'Unknown error',
              statusUpdate: false,
            });
          }
        }

        // หลังจากอัปเดตโหมดทั้งหมดแล้ว ค่อยอัปเดตเรทลูกทีเดียวเพื่อลดโอกาสเกิด Deadlock
        this.sseService.triggerRefreshSignal(); // แจ้งให้หน้าเว็บรีเฟรชข้อมูล
      });
      await this.updateAutoRateAll();
      return results;
    } catch (err: any) {
      handleError(err, 'Failed to set update mode for all currencies');
    }
  }

  async getTHBCurrency() {
    try {
      return await this.currencyRepo.findOne({ where: { code: 'THB' } });
    } catch (err: any) {
      const errMessage = err instanceof Error ? err.message : String(err);
      await this.systemLogsService.createLog(null, {
        userId: null,
        action: 'CURRENCY_THB_FETCH_FAILED',
        details: `Error fetching THB currency: ${errMessage}`,
      });
      throw new NotFoundException('Internal Server Error');
    }
  }

  async getCurrencyByCode(code: string) {
    try {
      const currency = await this.currencyRepo.findOne({ where: { code } });
      if (!currency) throw new NotFoundException('Currency not found');
      return currency;
    } catch (err: any) {
      const errMessage = err instanceof Error ? err.message : String(err);
      await this.systemLogsService.createLog(null, {
        userId: null,
        action: 'CURRENCY_FETCH_FAILED',
        details: `Error fetching currency ${code}: ${errMessage}`,
      });
      throw new NotFoundException('Internal Server Error');
    }
  }
}
