/**
 * @author Jefferson Alves Reis (jefaokpta)
 * @email jefaokpta@hotmail.com
 * @create 22/07/2025
 */
import { AudioData, CallLegEnum } from './types';

export function defineAudioNameAndUrl(audioData: AudioData) {
  switch (audioData.callLeg) {
    case CallLegEnum.A:
      return { audioName: audioData.audioNameA, audioUrl: audioData.audioUrlA };
    case CallLegEnum.B:
      return { audioName: audioData.audioNameB, audioUrl: audioData.audioUrlB };
    case CallLegEnum.BOTH:
      return { audioName: audioData.uploadName!, audioUrl: audioData.uploadUrl! };
  }
}
