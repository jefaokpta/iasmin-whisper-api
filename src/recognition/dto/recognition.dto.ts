import { IsNotEmpty, IsNumber } from 'class-validator';

export class RecognitionDto {
  @IsNumber()
  readonly id: number;

  @IsNotEmpty()
  readonly record: string;

}
