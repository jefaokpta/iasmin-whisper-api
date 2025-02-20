import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { KafkaService } from './kafka.service';
import { MessagePattern } from '@nestjs/microservices';
import { Payload } from '@nestjs/microservices';
import { CreateKafkaDto } from './dto/create-kafka.dto';
import { UpdateKafkaDto } from './dto/update-kafka.dto';

@Controller('kafka')
export class KafkaController {
  constructor(private readonly kafkaService: KafkaService) {}


  @MessagePattern('transcriptions')
  consume(@Payload() message: CreateKafkaDto) {
      console.log('recebido do kafka', message, message.agentId);
  }
    
  @Post()
  create(@Body() createKafkaDto: CreateKafkaDto) {
    return this.kafkaService.create(createKafkaDto);
  }

  @Get()
  findAll() {
    return this.kafkaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kafkaService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateKafkaDto: UpdateKafkaDto) {
    return this.kafkaService.update(+id, updateKafkaDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kafkaService.remove(+id);
  }
}
