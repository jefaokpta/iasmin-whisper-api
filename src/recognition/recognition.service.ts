import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createWriteStream, readFileSync, unlink } from 'node:fs';
import { RuntimeException } from '@nestjs/core/errors/exceptions';
import { Worker } from 'node:worker_threads';
import { AudioData, CallLegEnum, Cdr, UserfieldEnum } from '../types';
import { defineAudioNameAndUrl } from '../utils';

@Injectable()
export class RecognitionService {
  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL = this.configService.get('IASMIN_BACKEND_URL');
  private readonly IASMIN_BACKEND_URL_DEVELOPER = this.configService.get('IASMIN_BACKEND_URL_DEVELOPER');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto
  private readonly logger = new Logger(RecognitionService.name);
  private worker: Worker;
  private isWorkerBusy = false;

  constructor(private readonly configService: ConfigService) {
    this.createWorker();
  }

  jobManager(cdr: Cdr) {
    if (this.isWorkerBusy) {
      this.logger.debug(`Whisper ocupado ${cdr.uniqueId}`);
      throw new RuntimeException('Whisper ocupado');
    }
    this.isWorkerBusy = true;
    this.start(cdr);
  }

  private async start(cdr: Cdr) {
    if (await this.hasTranscription(cdr)) return;
    if (cdr.userfield === UserfieldEnum.UPLOAD) return this.processUpload(cdr);
    const audioNameA = cdr.uniqueId.replace('.', '-').concat('-a.sln');
    const audioNameB = cdr.uniqueId.replace('.', '-').concat('-b.sln');
    const audioUrlA = `${this.IASMIN_PABX_URL}/${audioNameA}`;
    const audioUrlB = `${this.IASMIN_PABX_URL}/${audioNameB}`;
    const audioData: AudioData = { cdr, audioNameA, audioUrlA, audioNameB, audioUrlB, callLeg: CallLegEnum.A };
    this.downloadAudio(audioData);
  }

  private createWorker() {
    this.worker = new Worker('./dist/workers/transcription.worker.js');
    this.isWorkerBusy = false;
    this.worker.on('message', async (audioData: AudioData) => {
      this.logger.debug(`Transcricao finalizada perna ${audioData.callLeg} ${audioData.cdr.uniqueId}`);
      if (audioData.callLeg === CallLegEnum.A) {
        this.downloadAudio({ ...audioData, callLeg: CallLegEnum.B });
        return;
      }
      this.isWorkerBusy = false;
      if (audioData.cdr.userfield === UserfieldEnum.UPLOAD) {
        await this.notifyTranscriptionToBackend(audioData.cdr, audioData.audioNameA, audioData.audioNameB, true);
        this.deleteAudioAndTranscription(audioData.uploadName!);
        return;
      }
      await this.notifyTranscriptionToBackend(audioData.cdr, audioData.audioNameA, audioData.audioNameB);
      this.deleteAudioAndTranscription(audioData.audioNameA);
      this.deleteAudioAndTranscription(audioData.audioNameB);
    });
    this.worker.on('error', (error) => {
      console.error('Worker error:', error);
      this.isWorkerBusy = false;
    });
    this.worker.on('exit', (code) => {
      console.log(`${code} - desligou worker, reiniciando...`);
      this.createWorker();
    });
  }

  private async hasTranscription(cdr: Cdr): Promise<boolean> {
    try {
      const backendUrl = this.defineBackendUrl(cdr.isDeveloperInstance);
      await axios.get(`${backendUrl}/recognitions/${cdr.uniqueId}`, {
        timeout: this.REQUEST_TIMEOUT,
      });
      this.logger.debug(`Verificado q ja tem transcricao ${cdr.uniqueId}, cancelando trabalhos`);
      return true;
    } catch (error) {
      this.logger.debug(`Verificado q nao tem transcricao ainda ${cdr.uniqueId}`, error.message);
      return false;
    }
  }

  private async processUpload(cdr: Cdr) {
    const audioUrl = `${this.IASMIN_PABX_URL}/mp3s/${cdr.callRecord}`;
    const audioData: AudioData = {
      cdr,
      audioNameA: '',
      audioUrlA: audioUrl,
      audioNameB: '',
      audioUrlB: '',
      uploadName: cdr.callRecord,
      uploadUrl: audioUrl,
      callLeg: CallLegEnum.BOTH,
    };
    this.downloadAudio(audioData);
  }

  private downloadAudio(audioData: AudioData) {
    const { audioName, audioUrl } = defineAudioNameAndUrl(audioData);
    axios({
      method: 'get',
      url: audioUrl,
      responseType: 'stream',
    })
      .then((request) => {
        const writer = createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
        request.data.pipe(writer);

        writer.on('finish', () => {
          this.logger.log(`audio baixado ${audioName}`);
          this.worker.postMessage(audioData);
        });

        writer.on('error', (err) => {
          this.logger.error(`Erro ao escrever audio no disco ${audioName}`, err.message);
        });
      })
      .catch((err) => {
        this.logger.error(`Erro ao baixar audio ${audioName}`, err.message);
      });
  }

  private async notifyTranscriptionToBackend(cdr: Cdr, audioNameA: string, audioNameB: string, upload: boolean = false) {
    this.logger.log(`Notificando backend transcricao da ligacao ${cdr.uniqueId}`);
    try {
      let segments: any[];
      if (upload) {
        segments = this.getSegmentWithCallLeg(this.readTranscription(cdr.callRecord), CallLegEnum.BOTH);
      } else {
        const segmentsA = this.getSegmentWithCallLeg(this.readTranscription(audioNameA), CallLegEnum.A);
        const segmentsB = this.getSegmentWithCallLeg(this.readTranscription(audioNameB), CallLegEnum.B);
        segments = segmentsA.concat(segmentsB);
      }
      const backendUrl = this.defineBackendUrl(cdr.isDeveloperInstance);
      await axios.post(
        `${backendUrl}/recognitions`,
        {
          cdrId: cdr.id,
          segments,
        },
        {
          timeout: this.REQUEST_TIMEOUT,
        },
      );
    } catch (err) {
      this.logger.error(`Erro ao notificar backend ${cdr.uniqueId}`, err.response?.data?.message, err.message);
    }
  }

  private getSegmentWithCallLeg(transcriptionA: any, callLeg: string) {
    return transcriptionA.segments.map((s: any) => {
      s.callLeg = callLeg;
      return s;
    });
  }

  private readTranscription(audioName: string) {
    const jsonFileName = audioName.replace(/\.(sln|mp3)$/, '.json');
    return JSON.parse(readFileSync(`${this.TRANSCRIPTIONS_PATH}/${jsonFileName}`, 'utf8'));
  }

  private deleteAudioAndTranscription(audioName: string) {
    unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar audio ${audioName}`, err);
      }
    });
    unlink(this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.sln', '.json'), (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar transcrição ${audioName}`, err);
      }
    });
  }

  private defineBackendUrl(isDeveloperInstance?: boolean) {
    if (isDeveloperInstance) {
      return this.IASMIN_BACKEND_URL_DEVELOPER;
    }
    return this.IASMIN_BACKEND_URL;
  }
}
