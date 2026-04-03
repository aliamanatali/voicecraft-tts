"""Pre-download TTS model files during Docker build (download only, no loading)."""
import warnings
warnings.filterwarnings('ignore')

from TTS.utils.manage import ModelManager

# Auto-accept XTTS-v2 CPML license
_original_ask_tos = ModelManager.ask_tos
def _auto_accept_tos(self, *args, **kwargs):
    return True
ModelManager.ask_tos = _auto_accept_tos

manager = ModelManager()

print('Downloading VITS...')
model_path, _, _ = manager.download_model('tts_models/en/vctk/vits')
print(f'VITS downloaded to {model_path}')

print('Downloading XTTS-v2...')
model_path, _, _ = manager.download_model('tts_models/multilingual/multi-dataset/xtts_v2')
print(f'XTTS-v2 downloaded to {model_path}')

print('Models downloaded (not loaded into memory)')
