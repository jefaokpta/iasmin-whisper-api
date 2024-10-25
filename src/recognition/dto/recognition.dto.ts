import { IsNotEmpty, IsNumber } from 'class-validator';

export class RecognitionDto {
  @IsNumber()
  readonly id: number;

  @IsNotEmpty()
  readonly callRecord: string;

}
