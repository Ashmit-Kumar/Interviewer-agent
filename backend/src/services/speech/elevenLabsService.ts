import axios from 'axios';
import { elevenLabsConfig } from '../../config/services';

export class ElevenLabsService {
  private apiUrl = 'https://api.elevenlabs.io/v1';

  async generateSpeech(text: string): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/text-to-speech/${elevenLabsConfig.voiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': elevenLabsConfig.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('ElevenLabs TTS error:', error);
      throw new Error('Failed to generate speech');
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
