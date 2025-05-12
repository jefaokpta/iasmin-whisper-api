import { UserfieldEnum } from '../utils/enums';

export interface Cdr {
  readonly id: number;
  readonly uniqueId: string;
  readonly callRecord: string;
  readonly userfield: UserfieldEnum;
}
