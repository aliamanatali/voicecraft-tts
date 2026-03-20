"""Pre-download TTS models during Docker build."""
import warnings
warnings.filterwarnings('ignore')

import torch
_orig = torch.load
def _patched(*a, **kw):
    kw.setdefault('weights_only', False)
    return _orig(*a, **kw)
torch.load = _patched

# Monkey-patch the TOS prompt to auto-accept for XTTS-v2 (CPML license)
from TTS.utils.manage import ModelManager
_original_ask_tos = ModelManager.ask_tos
def _auto_accept_tos(self, *args, **kwargs):
    return True
ModelManager.ask_tos = _auto_accept_tos

from TTS.api import TTS

print('Downloading VITS...')
TTS('tts_models/en/vctk/vits')
print('Downloading XTTS-v2...')
TTS('tts_models/multilingual/multi-dataset/xtts_v2')
print('Models ready')
