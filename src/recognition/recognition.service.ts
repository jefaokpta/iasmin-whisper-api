import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { createWriteStream, readFileSync, unlink } from 'node:fs';
import { Cdr } from '../model/cdr';

@Injectable()
export class RecognitionService {
  constructor(private readonly configService: ConfigService) {}

  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL =
    this.configService.get('IASMIN_BACKEND_URL');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto
  private readonly logger = new Logger(RecognitionService.name);

  async start(cdr: Cdr) {
    const audioNameA = cdr.uniqueId.replace('.', '-').concat('-a.sln');
    const audioNameB = cdr.uniqueId.replace('.', '-').concat('-b.sln');
    try {
      await Promise.all([
        this.processAudio(audioNameA),
        this.processAudio(audioNameB),
      ]);
      await this.notifyTranscriptionToBackend(cdr, audioNameA, audioNameB);
      this.deleteAudioAndTranscription(audioNameA);
      this.deleteAudioAndTranscription(audioNameB);
    } catch (error) {
      this.logger.error(
        `Erro no processamento de áudio para ${cdr.uniqueId}`,
        error,
      );
    }
  }

  private processAudio(audioName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      axios({
        method: 'get',
        url: `${this.IASMIN_PABX_URL}/${audioName}`,
        responseType: 'stream',
      })
        .then((request) => {
          const writer = createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
          request.data.pipe(writer);

          writer.on('finish', async () => {
            this.logger.log(`audio baixado ${audioName}`);
            await this.processRecognition(audioName);
            resolve();
          });

          writer.on('error', (err) => {
            this.logger.error(
              `Erro ao escrever audio no disco ${audioName}`,
              err.message,
            );
            reject(err);
          });
        })
        .catch((err) => {
          this.logger.error(`Erro ao baixar audio ${audioName}`, err.message);
          reject(err);
        });
    });
  }

  private async processRecognition(audioName: string) {
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
      `--output_dir=${this.TRANSCRIPTIONS_PATH}`;

    const result = spawnSync(command, { shell: true });
    if (result.status === 0)
      this.logger.log(`Transcricao finalizada com sucesso ${audioName}`);
    else this.logger.error(`Erro na transcricao ${audioName}`);
  }

  private async notifyTranscriptionToBackend(
    cdr: Cdr,
    audioNameA: string,
    audioNameB: string,
  ) {
    this.logger.log(`Notificando backend transcricao ${cdr.uniqueId}`);
    try {
      const segmentsA = this.getSegmentWithCallLeg(
        this.readTranscription(audioNameA),
        'A',
      );
      const segmentsB = this.getSegmentWithCallLeg(
        this.readTranscription(audioNameB),
        'B',
      );
      const segments = segmentsA.concat(segmentsB);
      await axios.post(
        `${this.IASMIN_BACKEND_URL}/recognitions`,
        {
          cdrId: cdr.id,
          segments,
        },
        {
          timeout: this.REQUEST_TIMEOUT,
        },
      );
    } catch (err) {
      this.logger.error(
        `Erro ao notificar backend ${cdr.uniqueId}`,
        err.response?.data?.message,
        err.message,
      );
    }
  }

  private getSegmentWithCallLeg(transcriptionA: any, callLeg: string) {
    return transcriptionA.segments.map((s: any) => {
      s.callLeg = callLeg;
      return s;
    });
  }

  private readTranscription(audioNameA: string) {
    return JSON.parse(
      readFileSync(
        `${this.TRANSCRIPTIONS_PATH}/${audioNameA.replace('.sln', '.json')}`,
        'utf8',
      ),
    );
  }

  private deleteAudioAndTranscription(audioName: string) {
    unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar audio ${audioName}`, err);
      }
    });
    unlink(
      this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.sln', '.json'),
      (err) => {
        if (err) {
          this.logger.error(`Erro ao deletar transcrição ${audioName}`, err);
        }
      },
    );
  }
}