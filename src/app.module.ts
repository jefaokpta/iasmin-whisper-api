import { Module } from '@nestjs/common';
import { RecognitionModule } from './recognition/recognition.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RecognitionModule
  ],
})
export class AppModule {}
