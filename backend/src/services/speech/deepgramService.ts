import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { deepgramConfig } from '../../config/services';

export class DeepgramService {
  private deepgram;

  constructor() {
    this.deepgram = createClient(deepgramConfig.apiKey);
  }

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const { result } = await this.deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: 'nova-2',
          smart_format: true,
        }
      );

      if (!result) {
        console.error('Deepgram returned null result');
        return '';
      }

      const transcript = result.results?.channels[0]?.alternatives[0]?.transcript || '';
      return transcript;
    } catch (error) {
      console.error('Deepgram transcription error:', error);
      return '';
    }
  }

  createLiveTranscriber(onTranscript: (text: string) => void) {
    const connection = this.deepgram.listen.live({
      model: 'nova-2',
      language: 'en-US',
      smart_format: true,
      interim_results: false,
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel?.alternatives[0]?.transcript;
      if (transcript) {
        onTranscript(transcript);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('Deepgram live error:', error);
    });

    return connection;
  }
}

export const deepgramService = new DeepgramService();
