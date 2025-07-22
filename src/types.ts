/**
 * @author Jefferson Alves Reis (jefaokpta)
 * @email jefaokpta@hotmail.com
 * @create 22/07/2025
 */

export interface Cdr {
  readonly id: number;
  readonly uniqueId: string;
  readonly callRecord: string;
  readonly userfield: UserfieldEnum;
  readonly isDeveloperInstance?: boolean;
}

export enum CallLegEnum {
  A = 'A',
  B = 'B',
  BOTH = 'BOTH',
}

export enum UserfieldEnum {
  OUTBOUND = 'OUTBOUND',
  INBOUND = 'INBOUND',
  UPLOAD = 'UPLOAD',
}

export interface AudioData {
  cdr: Cdr;
  audioNameA: string;
  audioUrlA: string;
  audioNameB: string;
  audioUrlB: string;
  uploadName?: string;
  uploadUrl?: string;
  callLeg: CallLegEnum
}