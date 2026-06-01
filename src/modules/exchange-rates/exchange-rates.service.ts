import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { e, evaluate, re } from 'mathjs';
import { DataSource } from 'typeorm';
import { ExclusiveExchangeRatesService } from '../exclusive-exchange-rates/exclusive-exchange-rates.service';
import { handleError } from '../../common/error/error';
import { SseService } from '../sse/sse.service';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepo: Repository<ExchangeRate>,
    private readonly systemLogsService: SystemLogsService,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => ExclusiveExchangeRatesService))
    private readonly exclusiveRateService: ExclusiveExchangeRatesService,
    @Inject(SseService)
    private readonly sseService: SseService,
  ) {}

  // บันทึก Log ลง Database
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
      manager,
    );
  }

  // คำนวณสูตรคณิตศาสตร์ (MathJS)
  private async MathjsFormula(
    formula: string,
    baseValue: number,
    throwOnError = false,
  ): Promise<number> {
    if (!formula || formula.toUpperCase() === 'BASE') return baseValue;

    if (formula.length > 100) {
      await this.log(
        null,
        'FAILED_FORMULA_TOO_LONG',
        `Too long: ${formula.substring(0, 20)}`,
      );
      return baseValue;
    }

    try {
      const scope = { BASE: baseValue, base: baseValue };
      const result = evaluate(formula, scope);
      const finalValue = Number(result);

      // 1. เช็คค่า Infinity หรือไม่ใช่ตัวเลข
      if (isNaN(finalValue) || !isFinite(finalValue)) {
        throw new Error('Invalid calculation result (Infinity or NaN)');
      }

      // 2.ป้องกัน Numeric Overflow (Precision 15, Scale 4)
      // เลขหน้าทศนิยมสูงสุดคือ 11 หลัก (99,999,999,999)
      const MAX_DB_VALUE = 99999999999.9999;
      if (Math.abs(finalValue) > MAX_DB_VALUE) {
        throw new Error(
          `Calculated value is too large for database (Max: ${MAX_DB_VALUE.toLocaleString()})`,
        );
      }

      // 3. ปรับทศนิยมให้เหมาะสม (ใช้ 4 หรือ 6 ตามความต้องการของธุรกิจ)
      return parseFloat(finalValue.toFixed(6));
    } catch (err: any) {
      // ทำ Log สั้นลงเพื่อประหยัดพื้นที่ DB
      await this.log(
        null,
        'FAILED_FORMULA_EVAL',
        `Formula: ${formula}, Error: ${err.message}`,
      );

      if (throwOnError)
        throw new BadRequestException(
          `Formula error or value exceeds limit: ${err.message}`,
        );
      return baseValue;
    }
  }

  async createDefaultSubRate(
    manager: EntityManager,
    currency: Currency,
  ): Promise<void> {
    const repo = manager.getRepository(ExchangeRate);

    // สร้างเรทมาตรฐาน (Standard) โดยใช้ค่า BASE (เรทแม่ตรงๆ)
    const defaultSubRate = repo.create({
      name: `${currency.code}`,
      currencyId: currency.id,
      range_start: 0,
      range_stop: 9999999, // ตั้งค่าไว้สูงๆ เพื่อให้ครอบคลุมทุกจำนวนเงิน
      formula_buy: 'BASE',
      formula_sell: 'BASE',
      buy_rate: currency.buyRate,
      sell_rate: currency.sellRate,
    });

    await repo.save(defaultSubRate);

    // สร้าง Exclusive Exchange Rate สำหรับบูธทั้งหมด
    await this.exclusiveRateService.createForNewExchangeRate(
      manager,
      defaultSubRate,
    );

    await this.log(
      null,
      'CREATE_DEFAULT_SUBRATE_SUCCESS',
      `Created default sub-rate for ${currency.code} with Name: ${defaultSubRate.name} id: ${defaultSubRate.id}`,
    );
  }
  // อัปเดตเรทลูกตามเรทแม่ (Sync BOT)
  async updateRatesForCurrency(
    manager: EntityManager,
    currency: Currency,
  ): Promise<void> {
    const repo = manager.getRepository(ExchangeRate);
    const subRates = await repo.find({ where: { currencyId: currency.id } });
    if (currency.code === 'USD')
      console.log(
        `Found ${subRates.length} sub-rates for currency ${currency.code} buy_rate: ${currency.buyRate} sell_rate: ${currency.sellRate}`,
      );
    for (const subRate of subRates) {
      subRate.buy_rate = await this.MathjsFormula(
        subRate.formula_buy,
        currency.buyRate,
      );
      subRate.sell_rate = await this.MathjsFormula(
        subRate.formula_sell,
        currency.sellRate,
      );
      const updated = await repo.save(subRate);
      if (updated.name === 'USD')
        console.log(
          `Updated sub-rate ${updated.name} for currency ${currency.code}: buy_rate=${updated.buy_rate}, sell_rate=${updated.sell_rate}`,
        );
      await this.exclusiveRateService.updateByExchangeRate(manager, updated); // อัปเดตเรทลูกใน Exclusive ด้วย
      await this.log(
        null,
        'UPDATE_RATE_SUCCESS',
        `Name:"${updated.name}" = buy: ${updated.buy_rate} sell: ${updated.sell_rate} id: ${updated.id}`,
      );
    }
  }

  // อัปเดตเรททั้งหมดในระบบ (Bulk Sync)
  async updateRateAll(user?: any, manager?: EntityManager): Promise<void> {
    const currencies = manager
      ? await manager.find(Currency)
      : await this.exchangeRateRepo.manager.find(Currency);
    await this.exchangeRateRepo.manager.transaction(async (manager) => {
      await Promise.all(
        currencies.map((c) => this.updateRatesForCurrency(manager, c)),
      );
      await this.log(
        user,
        'SYNC_ALL_RATES',
        `Updated rates for ${currencies.length} currencies`,
      );
    });
  }

  async Mutiupdate(
    user: any,
    updates: any[], // รับ Flat Array มาเลย
  ): Promise<{ success: boolean; message: string; details?: any }> {
    console.log('Processing bulk update request:', updates);
    try {
      return this.dataSource.transaction(async (manager) => {
        const results = [];

        for (const item of updates) {
          // แยก id ออกจากฟิลด์อื่นๆ (เช่น name, formula_buy)
          const { id, ...data } = item;

          try {
            // ตรวจสอบว่ามี ID ไหม
            if (!id) throw new Error('Missing ID for update');

            // เรียกฟังก์ชัน update ตัวเดิมที่มีอยู่ (ส่ง id แยกกับ data)
            const updated = await this.update(user, id, data);

            this.sseService.triggerRefreshSignal(); // แจ้งให้หน้าเว็บรีเฟรชข้อมูลหลังอัปเดตแต่ละเรท
            results.push({
              id,
              success: true,
              updated: {
                id: updated.id,
                name: updated.name,
                range_start: updated.range_start,
                range_stop: updated.range_stop,
                formula_buy: updated.formula_buy,
                formula_sell: updated.formula_sell,
                buy_rate: updated.buy_rate,
                sell_rate: updated.sell_rate,
              },
            });
          } catch (e: any) {
            results.push({ id, success: false, error: e.message });
          }
        }

        // บันทึก Log
        await this.log(
          user,
          'BULK_UPDATE_RATES_SUCCESS',
          `Success detail: ${results
            .filter((r) => r.success)
            .map(
              (r) => `
${JSON.stringify(r.updated)}`,
            )
            .join(', ')}
, Fail: ${results
            .filter((r) => !r.success)
            .map((r) => `(${JSON.stringify(r.error)})`)
            .join(', ')}`,
          manager,
        );

        return {
          success: results.every((r) => r.success),
          message: `Processed ${updates.length} items`,
          details: results,
        };
      });
    } catch (error) {
      handleError(error, 'ExchangeRatesService.Mutiupdate');
    }
    return { success: false, message: 'An error occurred during bulk update' };
  }

  // สร้างเรทใหม่ (พร้อมเช็คขอบเขตและสูตร)
  async create(user: any, data: Partial<ExchangeRate>): Promise<ExchangeRate> {
    try {
      if (!data.currencyId)
        throw new BadRequestException('currencyId is required');

      const currency = await this.exchangeRateRepo.manager.findOne(Currency, {
        where: { id: data.currencyId },
      });
      if (!currency) throw new NotFoundException('Currency not found');

      // เช็ค Range ไม่ให้ทับกัน และเช็ค Syntax ของสูตร
      await this.validateRange(
        currency.id,
        data.range_start || 0,
        data.range_stop || 999999,
      );

      // ถ้าไม่มีสูตรให้ตั้งเป็น BASE (เรทแม่ตรงๆ)
      this.validateFormulaSyntax(data.formula_buy || 'BASE');
      this.validateFormulaSyntax(data.formula_sell || 'BASE');
      const formulaVal = await this.validateFormulas(
        currency.id,
        data.formula_buy || 'BASE',
        data.formula_sell || 'BASE',
      );

      const newRate = this.exchangeRateRepo.create({
        ...data,
        name: data.name || `${currency.code}.${Date.now()}`, // ถ้าไม่มีชื่อให้ตั้งเป็นรหัสสกุลเงิน + timestamp
        formula_buy: data.formula_buy || 'BASE',
        formula_sell: data.formula_sell || 'BASE',
        buy_rate: formulaVal.buy_rate,
        sell_rate: formulaVal.sell_rate,
      });

      const saved = await this.exchangeRateRepo.save(newRate);
      await this.exclusiveRateService.createForNewExchangeRate(
        this.exchangeRateRepo.manager,
        saved,
      );
      await this.log(
        user,
        'CREATE_RATE_SUCCESS',
        `Name: "${saved.name}" = buy: ${saved.buy_rate} sell: ${saved.sell_rate} id: ${saved.id}`,
      );
      this.sseService.triggerRefreshSignal(); // แจ้งให้หน้าเว็บรีเฟรชข้อมูลหลังสร้างเรทใหม่
      return saved;
    } catch (error) {
      handleError(error, 'ExchangeRatesService.create');
    }
  }

  // แก้ไขเรท (เช็คขอบเขตใหม่และคำนวณเรทใหม่)
  async update(
    user: any,
    id: string,
    data: Partial<ExchangeRate>,
  ): Promise<any> {
    const target = await this.exchangeRateRepo.findOne({
      where: { id },
      relations: ['currency'],
    });
    if (!target) throw new NotFoundException('Not found');

    // // จัดการเรื่องช่วงจำนวนเงิน (Range)
    if (data.range_start !== undefined || data.range_stop !== undefined) {
      const fStart = data.range_start ?? target.range_start;
      const fStop = data.range_stop ?? target.range_stop;
      await this.validateRange(target.currency.id, fStart, fStop, id);
      target.range_start = fStart;
      target.range_stop = fStop;
    }

    // // จัดการเรื่องสูตร (Formula)

    const fBuy = data.formula_buy || target.formula_buy;
    const fSell = data.formula_sell || target.formula_sell;
    this.validateFormulaSyntax(fBuy);
    this.validateFormulaSyntax(fSell);
    const formulaVal = await this.validateFormulas(
      target.currency.id,
      fBuy,
      fSell,
    );

    target.formula_buy = fBuy;
    target.formula_sell = fSell;
    target.buy_rate = formulaVal.buy_rate;
    target.sell_rate = formulaVal.sell_rate;

    if (target.buy_rate > target.sell_rate) {
      throw new BadRequestException(
        'Buy rate cannot be greater than Sell rate',
      );
    }

    if (data.name) target.name = data.name;

    const updated = await this.exchangeRateRepo.save(target);
    await this.exclusiveRateService.updateByExchangeRate(
      this.exchangeRateRepo.manager,
      updated,
    ); // อัปเดตเรทลูกใน Exclusive ด้วย
    await this.log(
      user,
      'UPDATE_RATE_SUCCESS',
      `Name: "${updated.name}" = buy: ${updated.buy_rate} sell: ${updated.sell_rate} id: ${updated.id}`,
    );
    return {
      id: updated.id,
      name: updated.name,
      currencyId: updated.currencyId,
      range_start: updated.range_start,
      range_stop: updated.range_stop,
      formula_buy: updated.formula_buy,
      formula_sell: updated.formula_sell,
      buy_rate: updated.buy_rate,
      sell_rate: updated.sell_rate,
      currency: {
        id: updated.currency.id,
        code: updated.currency.code,
        name: updated.currency.name,
      },
    };
  }

  // // ตรวจสอบความถูกต้องของสูตร
  async validateFormulas(currencyId: string, fBuy: string, fSell: string) {
    const currency = await this.exchangeRateRepo.manager.findOne(Currency, {
      where: { id: currencyId },
    });
    if (!currency) throw new NotFoundException('Currency not found');

    if (fBuy) this.validateFormulaSyntax(fBuy);
    if (fSell) this.validateFormulaSyntax(fSell);

    try {
      // // บังคับ throw error ถ้าสูตรผิดเพื่อให้รู้ทันที
      const buy_rate = await this.MathjsFormula(fBuy, currency.buyRate, true);
      const sell_rate = await this.MathjsFormula(
        fSell,
        currency.sellRate,
        true,
      );
      return { buy_rate, sell_rate, isValid: true };
    } catch (e: any) {
      throw new BadRequestException(
        `Invalid formula: ${e} - Buy Formula: ${fBuy}, Sell Formula: ${fSell} for Currency ID: ${currencyId}`,
      );
    }
  }

  private validateFormulaSyntax(formula: string): void {
    // เช็คว่ามีตัวอักษรแปลกปลอมหลุดมาหรือไม่
    const forbiddenChars = formula.replace(/[0-9.+\-*/^()\s]|BASE/gi, '');

    if (forbiddenChars.length > 0) {
      throw new ForbiddenException(
        `Forbidden characters found in formula: ${forbiddenChars}`,
      );
    }

    // ป้องกันการใส่จุดทศนิยมซ้ำซ้อน หรือเครื่องหมายติดกันจนคำนวณไม่ได้
    if (/[+\-*/]{2,}/.test(formula.replace(/\s/g, ''))) {
      // อนุญาตเฉพาะกรณีเลขติดลบ เช่น BASE * -1 (ถ้าต้องการ)
      // แต่ถ้าเป็น ++ หรือ -- ให้ Error
      if (!/[+\-*/]-/.test(formula)) {
        throw new ForbiddenException('Invalid operator sequence');
      }
    }
  }

  // // ตรวจสอบความถูกต้องของช่วงจำนวนเงิน (Range)
  private async validateRange(
    currencyId: string,
    nStart: number,
    nStop: number,
    excludeId?: string,
  ) {
    if (nStart >= nStop)
      throw new BadRequestException('range_start must be less than range_stop');
  }

  // // ดึงข้อมูลทั้งหมดเรียงตามชื่อและช่วงเงิน
  async findAll() {
    const rates = await this.exchangeRateRepo.find({
      select: {
        id: true,
        name: true,
        currencyId: true,
        range_start: true,
        range_stop: true,
        formula_buy: true,
        formula_sell: true,
        buy_rate: true,
        sell_rate: true,
        currency: {
          id: true,
          code: true,
          name: true,
          buyRate: true, // เพิ่มมาเผื่อไว้โชว์เทียบกับเรทหน้าร้าน
          sellRate: true,
        },
      },
      relations: ['currency'],
      order: {
        currency: { code: 'ASC' },
        range_start: 'ASC',
        createdAt: 'ASC',
      },
    });

    // 💡 จัดกลุ่มข้อมูลด้วย Reduce
    const grouped = rates.reduce((acc: Record<string, any>, current) => {
      const code = current.currency.code;

      // ถ้ายังไม่มีกลุ่มของสกุลเงินนี้ ให้สร้าง Array รอไว้
      if (!acc[code]) {
        acc[code] = {
          currencyInfo: current.currency, // เก็บข้อมูลแม่ไว้ที่หัวกลุ่ม
          rates: [],
        };
      }

      // เพิ่มเรทลูกเข้าไปในกลุ่ม
      acc[code].rates.push({
        id: current.id,
        name: current.name,
        range_start: current.range_start,
        range_stop: current.range_stop,
        formula_buy: current.formula_buy,
        formula_sell: current.formula_sell,
        buy_rate: current.buy_rate,
        sell_rate: current.sell_rate,
      });

      return acc;
    }, {});

    return grouped;
  }

  async delete(user: any, id: string): Promise<void> {
    try {
      return this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ExchangeRate);
        const target = await repo.findOne({ where: { id } });
        if (!target) throw new NotFoundException('Item not found');
        const count = await repo.count({
          where: { currencyId: target.currencyId },
        });
        if (count <= 1) {
          await this.log(
            user,
            'FAILED_DELETE_RATE',
            `Attempted to delete last rate for currency ID: ${target.currencyId}`,
          );
          throw new BadRequestException(
            'Cannot delete the last rate for a currency',
          );
        }
        await repo.save({ ...target, name: `${target.name} (deleted)` }); // อัปเดต timestamp ของเรทที่ถูกลบ (soft delete)
        await repo.softDelete(id);
        await this.exclusiveRateService.deleteByExchangeRateId(manager, id); // ลบเรทลูกที่เกี่ยวข้องด้วย
        await this.log(
          user,
          'DELETE_RATE_SUCCESS',
          `Deleted rate: ${target.name} id: ${id}`,
          manager,
        );
      });
    } catch (error) {
      handleError(error, 'ExchangeRatesService.delete');
    }
  }

  async findById(id: string) {
    const rates = await this.exchangeRateRepo.findOne({
      where: { id: id },
      relations: ['currency'],
    });
    return rates as ExchangeRate;
  }

  async isSellRateAllowed(
    currentUser: any,
    exchangeRateId: string,
    proposedRate: number,
  ) {
    const exchangeRate = await this.findById(exchangeRateId);
    if (!exchangeRate) {
      await this.log(
        currentUser,
        'CREATE_EXCHANGE_TRANSACTION_FAILED',
        `Exchange ID ${exchangeRateId} not found`,
      );
      throw new NotFoundException('Exchange rate not found');
    }

    return !(proposedRate < exchangeRate.sell_rate);
  }

  async findByCurrency(currencyCode: string) {
    const rates = await this.exchangeRateRepo.find({
      where: { currency: { code: currencyCode } },
      relations: ['currency'],
    });
    return rates;
  }

  async findByTHBCurrency(manager?: EntityManager) {
    if (manager) {
      const exchangeRates = await manager.findOne(ExchangeRate, {
        where: { currency: { code: 'THB' } },
        relations: ['currency'],
      });
      return exchangeRates;
    } else {
      const exchangeRates = await this.findByCurrency('THB');
      for (const rate of exchangeRates) {
        if (rate.currency.code === 'THB') {
          return rate;
        }
      }
    }
  }
}
