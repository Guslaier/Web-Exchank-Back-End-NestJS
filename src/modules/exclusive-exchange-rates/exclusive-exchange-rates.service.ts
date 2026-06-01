import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, Repository, In } from 'typeorm';
import { ExclusiveExchangeRate } from './entities/exclusive-exchange-rate.entity';
import { ExchangeRate } from '../exchange-rates/entities/exchange-rate.entity';
import { Booth } from '../booths/entities/booth.entity';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { Inject } from '@nestjs/common';
import { evaluate, im, re } from 'mathjs';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { handleError } from '../../common/error/error';
import { SseService } from '../sse/sse.service';
import { UpdateExclusiveExchangeRateDto } from './dto/exclusive-exchange-rate.dto';
import { DataSource } from 'typeorm';

@Injectable()
export class ExclusiveExchangeRatesService {
  constructor(
    @Inject(SystemLogsService)
    private readonly systemLogsService: SystemLogsService,
    @InjectRepository(ExclusiveExchangeRate)
    private readonly exclusiveRateRepo: Repository<ExclusiveExchangeRate>,
    @InjectRepository(ExchangeRate)
    private readonly exchangeRateRepo: Repository<ExchangeRate>,
    @InjectRepository(Booth)
    private readonly boothRepo: Repository<Booth>,
    @Inject(SseService)
    private readonly sseService: SseService,
    @Inject(DataSource)
    private readonly dataSource: DataSource,
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
      manager,
    );
  }

  // // สร้างเรทลูกอัตโนมัติเมื่อมีการเพิ่มเรทแม่ใหม่
  async createForNewExchangeRate(
    manager: EntityManager,
    exchangeRate: ExchangeRate,
  ): Promise<void> {
    const repo = manager.getRepository(ExclusiveExchangeRate);

    const boothIds = await manager
      .getRepository(Booth)
      .find({ select: ['id'] })
      .then((booths) => booths.map((b) => b.id));

    try {
      for (const boothId of boothIds) {
        const exclusive = repo.create({
          exchange_rate_id: exchangeRate.id,
          booth_id: boothId as unknown as string,
          formula_buy: 'BUY',
          formula_buy_max: `BUY + (SELL - BUY) * ${process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE ? parseFloat(process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE) / 100 : 0.02}`,
          buy_rate: exchangeRate.buy_rate,
          buy_rate_max:
            exchangeRate.buy_rate +
            (exchangeRate.sell_rate - exchangeRate.buy_rate) *
              (process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE
                ? parseFloat(
                    process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE,
                  ) / 100
                : 0.02),
        });
        await repo.save(exclusive);
        await this.log(
          null,
          'CREATE_EXCLUSIVE_SUCCESS',
          `Created exclusive rate for rate ID: ${exchangeRate.id} at booth: ${boothId}`,
          manager,
        );
      }
    } catch (err: any) {
      await this.log(
        null,
        'CREATE_EXCLUSIVE_FAILED',
        `Error: ${err.message}`,
        manager,
      );
      throw err;
    }
  }

  // // สร้างเรทลูกทั้งหมดสำหรับบูธใหม่
  async generateExclusivesForBooth(
    user: any,
    manager: EntityManager,
    boothId: string,
  ): Promise<void> {
    const exchangeRateRepo = manager.getRepository(ExchangeRate);
    const exclusiveRepo = manager.getRepository(ExclusiveExchangeRate);

    try {
      const allBaseRates = await exchangeRateRepo.find();
      const exclusiveEntries = allBaseRates.map((base) => {
        return exclusiveRepo.create({
          exchange_rate_id: base.id,
          booth_id: boothId,
          formula_buy: 'BUY',
          formula_buy_max: `BUY + (SELL - BUY) * ${process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE ? parseFloat(process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE) / 100 : 0.02}`,
          buy_rate: base.buy_rate,
          buy_rate_max:
            base.buy_rate +
            (base.sell_rate - base.buy_rate) *
              (process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE
                ? parseFloat(
                    process.env.DEFAULT_MAX_RATE_EXCLUSIVE_PERCENTAGE,
                  ) / 100
                : 0.02),
        });
      });

      if (exclusiveEntries.length > 0) {
        await exclusiveRepo.save(exclusiveEntries);
        await this.log(
          user,
          'GENERATE_EXCLUSIVE_BOOTH_SUCCESS',
          `Generated ${exclusiveEntries.length} rates for booth ID: ${boothId}`,
          manager,
        );
      }
    } catch (err: any) {
      await this.log(
        user,
        'GENERATE_EXCLUSIVE_BOOTH_FAILED',
        `Error: ${err.message}`,
        manager,
      );
      throw err;
    }
  }

  // // ลบเรทลูกเมื่อเรทแม่ถูกลบ
  async deleteByExchangeRateId(
    manager: EntityManager,
    exchangeRateId: string,
  ): Promise<void> {
    const repo = manager.getRepository(ExclusiveExchangeRate);
    try {
      await repo.softDelete({ exchange_rate_id: exchangeRateId });
      await this.log(
        null,
        'DELETE_EXCLUSIVE_SUCCESS',
        `Soft deleted exclusive rates for rate ID: ${exchangeRateId}`,
        manager,
      );
    } catch (err: any) {
      handleError(err, 'DELETE_EXCLUSIVE_FAILED');
    }
  }

  // // อัปเดตเรทลูกทั้งหมดเมื่อเรทแม่มีการเปลี่ยนแปลง
  async updateByExchangeRate(
    manager: EntityManager,
    exchangeRate: ExchangeRate,
  ): Promise<void> {
    const repo = manager.getRepository(ExclusiveExchangeRate);
    try {
      const exclusives = await repo.find({
        where: { exchange_rate_id: exchangeRate.id },
      });

      for (const ex of exclusives) {
        ex.buy_rate = await this.calculateFormula(
          ex.formula_buy,
          exchangeRate.buy_rate,
        );
        ex.buy_rate_max = await this.calculateFormula(
          ex.formula_buy_max,
          exchangeRate.buy_rate,
        );

        await repo.save(ex);
        await this.syncAndClampRate(
          ex.id,
          exchangeRate.buy_rate,
          exchangeRate.sell_rate,
          manager,
        );
      }

      await this.log(
        null,
        'UPDATE_BY_MASTER_SUCCESS',
        `Updated all exclusives for master rate ID: ${exchangeRate.id}`,
        manager,
      );
    } catch (err: any) {
      await this.log(
        null,
        'UPDATE_BY_MASTER_FAILED',
        `Error: ${err.message}`,
        manager,
      );
      throw err;
    }
  }

  // // ตรวจสอบความถูกต้องของสูตรคำนวณ
  async validateFormulas(
    exchangeRateId: string,
    fBuy: string,
    fMax: string,
    base: { fBuy: number; fSell: number },
  ) {
    if (fBuy) this.validateFormulaSyntax(fBuy);
    if (fMax) this.validateFormulaSyntaxMax(fMax);

    try {
      const buy_rate_max = await this.calculateFormula(
        fMax,
        base.fBuy,
        { BUY: base.fBuy, SELL: base.fSell },
        true,
      );
      const buy_rate = await this.calculateFormula(
        fBuy,
        base.fBuy,
        { BUY: base.fBuy, SELL: base.fSell, MAX: buy_rate_max },
        true,
      );
      return { buy_rate, buy_rate_max, isValid: true };
    } catch (e: any) {
      await this.log(
        null,
        'VALIDATE_FORMULA_ERROR',
        `Formula validation failed for RateID: ${exchangeRateId}`,
      );
      throw new BadRequestException(
        `Invalid formula syntax: ${e.message} - Rate ID: ${exchangeRateId}`,
      );
    }
  }

  // // ตรวจสอบโครงสร้างตัวอักษรในสูตร
  private validateFormulaSyntax(formula: string): void {
    const forbiddenChars = formula.replace(
      /[0-9.+\-*/^()\s]|BASE|BUY|SELL|MAX/gi,
      '',
    );

    if (forbiddenChars.length > 0) {
      throw new BadRequestException(
        `Formula contains forbidden characters: ${forbiddenChars}`,
      );
    }

    if (/[+\-*/]{2,}/.test(formula.replace(/\s/g, ''))) {
      if (!/[+\-*/]-/.test(formula)) {
        throw new ForbiddenException(
          'Invalid operator sequence detected in formula',
        );
      }
    }
  }

  private validateFormulaSyntaxMax(formula: string): void {
    const forbiddenChars = formula.replace(
      /[0-9.+\-*/^()\s]|BASE|BUY|SELL/gi,
      '',
    );

    if (forbiddenChars.length > 0) {
      throw new BadRequestException(
        `Formula for MAX contains forbidden characters: ${forbiddenChars}`,
      );
    }

    if (/[+\-*/]{2,}/.test(formula.replace(/\s/g, ''))) {
      if (!/[+\-*/]-/.test(formula)) {
        throw new ForbiddenException(
          'Invalid operator sequence detected in MAX formula',
        );
      }
    }
  }

  // // คำนวณสูตรคณิตศาสตร์โดยใช้ MathJS
  private async calculateFormula(
    formula: string,
    baseValue: number,
    options: { BUY?: number; SELL?: number; MAX?: number } = {},
    throwOnError = false,
  ): Promise<number> {
    if (!formula) return baseValue;

    const upperFormula = formula.toUpperCase().trim();
    if (upperFormula === 'BUY' && options.BUY !== undefined) return options.BUY;
    if (upperFormula === 'SELL' && options.SELL !== undefined)
      return options.SELL;
    if (upperFormula === 'BASE') return baseValue;
    if (upperFormula === 'MAX' && options.MAX !== undefined) return options.MAX;

    if (formula.length > 100) {
      await this.log(
        null,
        'CALCULATE_FORMULA_FAILED',
        'Formula string length exceeds limit',
      );
      return baseValue;
    }

    try {
      const scope = {
        BASE: baseValue,
        base: baseValue,
        BUY: options.BUY ?? baseValue,
        SELL: options.SELL ?? baseValue,
        MAX: options.MAX ?? baseValue,
      };

      const result = evaluate(formula, scope);
      const finalValue = Number(result);

      if (isNaN(finalValue) || !isFinite(finalValue)) {
        throw new Error('Result is NaN or Infinity');
      }

      const MAX_DB_VALUE = 99999999999.9999;
      if (Math.abs(finalValue) > MAX_DB_VALUE) {
        throw new Error('Numeric overflow detected');
      }

      return parseFloat(finalValue.toFixed(6));
    } catch (err: any) {
      await this.log(
        null,
        'CALCULATE_FORMULA_ERROR',
        `Formula: ${formula} | Error: ${err.message}`,
      );
      if (throwOnError)
        throw new BadRequestException(`Calculation Error: ${err.message}`);
      return baseValue;
    }
  }
  async updateBulkByIDs(user: any, data: UpdateExclusiveExchangeRateDto[]) {
    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const resultd = await Promise.all(
          data.map(async (d) => {
            try {
              await this.update(
                user,
                d.id,
                {
                  formula_buy: d.formula_buy,
                  formula_buy_max: d.formula_buy_max,
                } as any,
                manager,
              );
              return {
                id: d.id,
                status: 'success',
                message: `Updated successfully with buy: ${d.formula_buy} and max: ${d.formula_buy_max}`,
              };
            } catch (err: any) {
              return { id: d.id, status: 'error', message: err.message };
            }
          }),
        );

        await this.log(
          user,
          'BULK_UPDATE_SUCCESS',
          // 🚀 แก้ไขตรงบรรทัดนี้: เปลี่ยน result เป็น resultd ให้หมด
          `Bulk update completed with ${resultd.filter((r) => r.status === 'success').length} successes and ${resultd.filter((r) => r.status === 'error').length} errors.`,
        );

        return resultd;
      });

      this.sseService.triggerRefreshSignal();
      return result;
    } catch (err: any) {
      await this.log(user, 'BULK_UPDATE_FAILED', `Error: ${err.message}`);
      handleError(err, 'BULK_UPDATE_FAILED');
    }
  }
  // // อัปเดตข้อมูลเรทลูกรายรายการ
  async update(
    user: any,
    id: string,
    data: Partial<ExclusiveExchangeRate>,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(ExclusiveExchangeRate)
      : this.exclusiveRateRepo;

    if (isUUID(id) === false) {
      await this.log(user, 'UPDATE_EXCLUSIVE_FAILED', `Invalid UUID: ${id}`);
      throw new BadRequestException('Invalid ID format');
    }
    const target = await repo.findOne({
      where: { id },
      relations: ['exchangeRate'],
    });

    if (!target) {
      await this.log(user, 'UPDATE_EXCLUSIVE_FAILED', `ID ${id} not found`);
      throw new NotFoundException('Exclusive rate not found');
    }

    const fBuy = (data.formula_buy as string) || target.formula_buy;
    const fMax = (data.formula_buy_max as string) || target.formula_buy_max;

    const formulaVal = await this.validateFormulas(
      target.exchange_rate_id,
      fBuy,
      fMax,
      {
        fBuy: target.exchangeRate.buy_rate,
        fSell: target.exchangeRate.sell_rate,
      },
    );

    const calculatedBuy = formulaVal.buy_rate;
    const calculatedMax = formulaVal.buy_rate_max;
    const baseSellRate = target.exchangeRate.sell_rate;

    // // ตรวจสอบเงื่อนไข Buy <= Max < Sell
    if (calculatedBuy > calculatedMax) {
      await this.log(
        user,
        'UPDATE_EXCLUSIVE_FAILED',
        `Buy(${calculatedBuy}) > Max(${calculatedMax})`,
      );
      throw new BadRequestException(
        `Buy rate cannot be greater than Max rate Detil:ed Buy: ${calculatedBuy} > Max: ${calculatedMax}`,
      );
    }

    if (calculatedMax >= baseSellRate) {
      await this.log(
        user,
        'UPDATE_EXCLUSIVE_FAILED',
        `Max(${calculatedMax}) >= Sell(${baseSellRate})`,
      );
      throw new BadRequestException(
        `Max rate must be lower than master sell rate Detil:ed Max: ${calculatedMax} >= Sell: ${baseSellRate}`,
      );
    }

    target.formula_buy = fBuy;
    target.formula_buy_max = fMax;
    target.buy_rate = calculatedBuy;
    target.buy_rate_max = calculatedMax;

    if (data.booth_id) target.booth_id = data.booth_id as any;

    const saved = await repo.save(target);

    await this.log(
      user,
      'UPDATE_EXCLUSIVE_SUCCESS',
      `Updated ID: ${id} | Result: ${saved.buy_rate} < ${saved.buy_rate_max} < ${baseSellRate}`,
      manager,
    );

    return saved;
  }

  // // ดึงข้อมูลเรทลูกทั้งหมดแบบแบ่งกลุ่มตามบูธ
  async findAll() {
    const rates = await this.exclusiveRateRepo.find({
      relations: ['exchangeRate', 'booth'],
    });

    if (rates.length === 0) return [];

    return rates.reduce((acc: any[], rate) => {
      let boothGroup = acc.find((b) => b.booth_id === rate.booth?.id);
      if (!boothGroup) {
        boothGroup = {
          booth_id: rate.booth?.id,
          booth_name: rate.booth?.name,
          exchange_rates: [],
        };
        acc.push(boothGroup);
      }

      let rateGroup = boothGroup.exchange_rates.find(
        (r: any) => r.exchange_rate_id === rate.exchangeRate.id,
      );
      if (!rateGroup) {
        rateGroup = {
          exchange_rate_id: rate.exchangeRate.id,
          name: rate.exchangeRate.name,
          rate_start: rate.exchangeRate.range_start,
          rate_stop: rate.exchangeRate.range_stop,
          base_buy: rate.exchangeRate.buy_rate,
          base_sell: rate.exchangeRate.sell_rate,
          exclusive_details: [],
        };
        boothGroup.exchange_rates.push(rateGroup);
      }

      rateGroup.exclusive_details.push({
        id: rate.id,
        formula_buy: rate.formula_buy,
        formula_buy_max: rate.formula_buy_max,
        buy_rate: rate.buy_rate,
        buy_rate_max: rate.buy_rate_max,
        sync_status: rate.sync_status,
        is_reviewed: rate.is_reviewed,
      });

      return acc;
    }, []);
  }

  // // ฟังก์ชันสำหรับตรวจสอบและบีบเรทให้อยู่ในขอบเขตที่ปลอดภัย
  async syncAndClampRate(
    childId: string,
    masterBuy: number,
    masterSell: number,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(ExclusiveExchangeRate)
      : this.exclusiveRateRepo;
    const child = await repo.findOne({ where: { id: childId } });
    if (!child) throw new NotFoundException('Exclusive record missing');

    let newMax = await this.calculateFormula(child.formula_buy_max, masterBuy, {
      BUY: masterBuy,
      SELL: masterSell,
    });
    let newBuy = await this.calculateFormula(child.formula_buy, masterBuy, {
      BUY: masterBuy,
      SELL: masterSell,
      MAX: newMax,
    });

    let isAdjusted = false;
    let remark = '';

    // // ตรวจสอบหาก Max เกินเรทขายแม่
    if (newMax >= masterSell) {
      newMax = masterSell - 0.0001;
      isAdjusted = true;
      remark = `AUTO_CLAMP: Max Buy capped at Sell (${masterSell})`;
      if (newBuy > newMax) newBuy = newMax;
    }

    // // ตรวจสอบหาก Buy เกิน Max
    if (newBuy > newMax) {
      newMax = newBuy;
      isAdjusted = true;
      remark = `AUTO_ADJUST: Max Buy synced with Buy Rate`;
    }

    await repo.update(childId, {
      buy_rate: newBuy,
      buy_rate_max: newMax,
      sync_status: isAdjusted ? 'SYSTEM_ADJUSTED' : 'NORMAL',
      is_reviewed: !isAdjusted,
      system_remark: remark,
      updated_at: new Date(),
    });

    if (isAdjusted) {
      await this.log(
        null,
        'SYSTEM_RATE_ADJUSTED_SUCCESS',
        `ID: ${childId} | ${remark}`,
        manager,
      );
    }
  }

  // // กดยืนยันการตรวจสอบเรทแบบกลุ่ม
  async bulk_review(user: any, ids: string[]) {
    if (!ids || ids.length === 0) {
      await this.log(user, 'BULK_REVIEW_FAILED', 'No IDs provided for review');
      return { success: false, message: 'No items provided' };
    }

    try {
      const userId = user?.id || null;
      await this.exclusiveRateRepo.update(
        { id: In(ids) },
        {
          is_reviewed: true,
          sync_status: 'NORMAL',
          reviewed_by: userId,
          reviewed_at: new Date(),
        },
      );
      await this.log(
        user,
        'BULK_REVIEW_SUCCESS',
        `Reviewed ${ids.length} items`,
      );
      return {
        success: true,
        message: `Successfully reviewed ${ids.length} items`,
      };
    } catch (err: any) {
      await this.log(user, 'BULK_REVIEW_ERROR', `Error: ${err.message}`);
      throw err;
    }
  }

  // // ค้นหาเรททั้งหมดของ Booth เฉพาะเจาะจง
  async findByBooth(boothId: string) {
    const booth = await this.boothRepo.findOne({ where: { id: boothId } });
    if (!booth) {
      await this.log(
        null,
        'FIND_BY_BOOTH_FAILED',
        `Booth ID ${boothId} not found`,
      );
      throw new NotFoundException('Booth not found');
    }

    const rates = await this.exclusiveRateRepo.find({
      where: { booth_id: boothId },
      relations: ['exchangeRate'],
    });

    return rates.map((rate) => ({
      id: rate.id,
      exchange_rate_id: rate.exchange_rate_id,
      booth_id: booth.id,
      booth_name: booth.name,
      name: rate.exchangeRate.name,
      range_start: rate.exchangeRate.range_start,
      range_stop: rate.exchangeRate.range_stop,
      formula_buy: rate.formula_buy,
      formula_buy_max: rate.formula_buy_max,
      buy_rate: rate.buy_rate,
      buy_rate_max: rate.buy_rate_max,
      base_buy_rate: rate.exchangeRate.buy_rate,
      base_sell_rate: rate.exchangeRate.sell_rate,
      sync_status: rate.sync_status,
      is_reviewed: rate.is_reviewed,
    }));
  }

  // // ค้นหาเรทลูกทั้งหมดที่ผูกกับเรทแม่ตัวนี้
  async findByExchangeRate(exchangeRateId: string) {
    const master = await this.exchangeRateRepo.findOne({
      where: { id: exchangeRateId },
    });
    if (!master) {
      await this.log(
        null,
        'FIND_BY_MASTER_FAILED',
        `Master Rate ID ${exchangeRateId} not found`,
      );
      throw new NotFoundException('Exchange rate not found');
    }

    const rates = await this.exclusiveRateRepo.find({
      where: { exchange_rate_id: exchangeRateId },
      relations: ['booth'],
    });

    return rates.map((rate) => ({
      id: rate.id,
      exchange_rate_id: rate.exchange_rate_id,
      booth_id: rate.booth ? rate.booth.id : null,
      booth_name: rate.booth ? rate.booth.name : null,
      name: master.name,
      range_start: master.range_start,
      range_stop: master.range_stop,
      formula_buy: rate.formula_buy,
      formula_buy_max: rate.formula_buy_max,
      buy_rate: rate.buy_rate,
      buy_rate_max: rate.buy_rate_max,
      base_buy_rate: master.buy_rate,
      base_sell_rate: master.sell_rate,
      sync_status: rate.sync_status,
      is_reviewed: rate.is_reviewed,
    }));
  }

  // // ค้นหาข้อมูลเรทลูกด้วย ID ตรงๆ
  async findById(id: string) {
    const rate = await this.exclusiveRateRepo.findOne({
      where: { id },
      relations: ['exchangeRate', 'booth'],
    });

    if (!rate) {
      await this.log(null, 'FIND_BY_ID_FAILED', `Exclusive ID ${id} not found`);
      throw new NotFoundException('Exclusive rate not found');
    }

    return {
      id: rate.id,
      exchange_rate_id: rate.exchange_rate_id,
      booth_id: rate.booth.id,
      booth_name: rate.booth.name,
      name: rate.exchangeRate.name,
      range_start: rate.exchangeRate.range_start,
      range_stop: rate.exchangeRate.range_stop,
      formula_buy: rate.formula_buy,
      formula_buy_max: rate.formula_buy_max,
      buy_rate: rate.buy_rate,
      buy_rate_max: rate.buy_rate_max,
      base_buy_rate: rate.exchangeRate.buy_rate,
      base_sell_rate: rate.exchangeRate.sell_rate,
      sync_status: rate.sync_status,
      is_reviewed: rate.is_reviewed,
      system_remark: rate.system_remark,
    };
  }

  // // ค้นหาเรททั้งหมดตามรหัสสกุลเงิน (เช่น USD, JPY)
  async findByCurrency(currencyCode: string) {
    const masters = await this.exchangeRateRepo.find({
      where: { currencyId: currencyCode },
      relations: ['exclusiveRates', 'exclusiveRates.booth'],
    });

    return masters.map((master: any) => ({
      id: master.id,
      name: master.name,
      rate_start: master.range_start,
      rate_stop: master.range_stop,
      buy_rate: master.buy_rate,
      sell_rate: master.sell_rate,
      exclusive_details: master.exclusiveRates.map((ex: any) => ({
        id: ex.id,
        booth_name: ex.booth.name,
        formula_buy: ex.formula_buy,
        formula_buy_max: ex.formula_buy_max,
        buy_rate: ex.buy_rate,
        buy_rate_max: ex.buy_rate_max,
        sync_status: ex.sync_status,
        is_reviewed: ex.is_reviewed,
      })),
    }));
  }

  // // ค้นหารายการที่รอการตรวจสอบ (Blocking Review)
  async findPendingReviews() {
    const pending = await this.exclusiveRateRepo.find({
      where: { is_reviewed: false },
      relations: ['exchangeRate', 'booth'],
    });

    if (pending.length > 0) {
      await this.log(
        null,
        'FETCH_PENDING_REVIEWS_SUCCESS',
        `Found ${pending.length} items waiting for review`,
      );
    }

    return pending.map((rate) => ({
      id: rate.id,
      booth_name: rate.booth.name,
      currency_name: rate.exchangeRate.name,
      old_buy_max: rate.buy_rate_max,
      system_remark: rate.system_remark,
      updated_at: rate.updated_at,
    }));
  }

  async isBuyRateAllowed(
    currentUser: any,
    exclusiveRateId: string,
    proposedRate: number,
  ) {
    const exclusiveRate = await this.findById(exclusiveRateId);
    if (!exclusiveRate) {
      await this.log(
        currentUser,
        'CREATE_EXCHANGE_TRANSACTION_FAILED',
        `Exclusive ID ${exclusiveRateId} not found`,
      );
      throw new NotFoundException('Exclusive rate not found');
    }

    return !(
      proposedRate > exclusiveRate.buy_rate_max ||
      proposedRate < Math.trunc(exclusiveRate.buy_rate)
    );
  }
}
