import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class InputValidator {
  validateNumberFieldsPositive(fields: number[]) {
    for (const field of fields) {
      if (field < 0) {
        throw new BadRequestException('Number fields must be positive');
      }
    }
  }

  validateSumOfThaiBahtAmount(cash: number[], totalThaiBahtAmount: number) {
    const thaiDenominations = [1000, 500, 100, 50, 20, 10, 5, 2, 1];
    const sum = cash.reduce(
      (acc, val, index) => acc + val * thaiDenominations[index],
      0,
    );
    if (sum !== Math.trunc(totalThaiBahtAmount)) {
      throw new BadRequestException(
        'Sum of cash amounts does not match total Thai Baht amount',
      );
    }
  }

  validateCustomerFieldFilled(fields: string[]) {
    let filledFieldsCount = 0;
    for (const field of fields) {
      if (field && field.trim() !== '') {
        filledFieldsCount++;
      }
    }

    if (filledFieldsCount === 0) {
      return false;
    }

    if (filledFieldsCount > 0 && filledFieldsCount !== fields.length) {
      throw new BadRequestException(
        'All customer fields must be filled or all must be empty',
      );
    }

    return true;
  }
}
