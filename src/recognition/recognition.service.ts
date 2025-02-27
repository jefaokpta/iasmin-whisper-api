import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import { Cdr } from '../model/cdr';
@Injectable()
export class RecognitionService {
  constructor(private readonly configService: ConfigService) {}

  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL = this.configService.get('IASMIN_BACKEND_URL');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto

  async start(cdr: Cdr) {
    await this.downloadAudio(cdr);
  }

  private async downloadAudio(cdr: Cdr) {
    try {
      const audioName = cdr.callRecord;
      if (fs.existsSync(`${this.TRANSCRIPTIONS_PATH}/${audioName.replace('.mp3', '.json')}`)) {
        Logger.log(`transcricao ja existe ${cdr.callRecord}`, 'downloadAudio');
        await this.notifyIASMIN(cdr, audioName);
        return;
      }
      const request = await axios({
        method: 'get',
        url: `${this.IASMIN_PABX_URL}/${audioName}`,
        responseType: 'stream',
      })
      const writer = fs.createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
      request.data.pipe(writer);

      writer.on('finish', async () => {
        Logger.log(`audio baixado ${cdr.callRecord}`, 'downloadAudio');
        await this.processRecognition(cdr, audioName);
      });

      writer.on('error', (err) => {
        Logger.error(`erro ao baixar audio ${cdr.callRecord}`, err.message, 'downloadAudio');
      });
    } catch (err) {
      Logger.error(`erro ao baixar audio ${cdr.callRecord}`, err.message, 'downloadAudio');
    }
  }

  private async processRecognition(cdr: Cdr, audioName: string) {
    const command =
      this.WHISPER_COMMAND +
      ' ' +
      'audios/' +
      audioName +
      ' ' +
      '--model=large ' +
      '--fp16=False ' +
      '--language=pt ' +
      '--beam_size=5 ' +
      '--patience=2 ' +
      '--output_format=json ' +
      `--output_dir=${this.TRANSCRIPTIONS_PATH}`

    const result = spawnSync(command, { shell: true })
    if (result.status === 0) {
      Logger.log(`transcricao finalizada com sucesso ${cdr.callRecord}`, 'processRecognition');
      await this.notifyIASMIN(cdr, audioName);
    } else {
      Logger.error(`erro na transcricao ${cdr.callRecord}`, 'processRecognition');
    }
  }

  private async notifyIASMIN(cdr: Cdr, audioName: string) {
    Logger.log(`notificando IASMIN ${cdr.callRecord}`, 'notifyIASMIN');
    try {
      await axios.post(`${this.IASMIN_BACKEND_URL}/recognitions`, {
        id: cdr.id,
      createRecognitionDto: JSON.parse(fs.readFileSync(`${this.TRANSCRIPTIONS_PATH}/${audioName.replace('.mp3', '.json')}`, 'utf8')),
      }, {
        timeout: this.REQUEST_TIMEOUT,
      })
      this.deleteAudioAndTranscription(audioName);
    } catch (err) {
      Logger.error(`erro ao notificar IASMIN ${cdr.callRecord}`, err.message, 'notifyIASMIN');
    }
  }

  private deleteAudioAndTranscription(audioName: string) {
    fs.unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        Logger.error(`erro ao deletar audio ${audioName}`, err, 'deleteAudioAndTranscription');
      }
    });
    fs.unlink(this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.mp3', '.json'), (err) => {
      if (err) {
        Logger.error(`erro ao deletar transcrição ${audioName}`, err, 'deleteAudioAndTranscription');
      }
    });
  }
}
