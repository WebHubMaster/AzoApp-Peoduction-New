"""Deterministic face verification with OpenCV YuNet (detector) + SFace (recognizer).
Models live in backend/ml_models; compare() returns a cosine similarity of the largest
face in each image (None when a face can't be found)."""
from pathlib import Path
import threading
import cv2
import numpy as np

_DIR = Path(__file__).parent.parent / "ml_models"
_YUNET = _DIR / "face_detection_yunet_2023mar.onnx"
_SFACE = _DIR / "face_recognition_sface_2021dec.onnx"
_lock = threading.Lock()
_det = None
_rec = None

# SFace cosine: official same-identity threshold is 0.363 — we are stricter.
MATCH_MIN = 0.42
MISMATCH_MAX = 0.30


def _models():
    global _det, _rec
    if _det is None:
        _det = cv2.FaceDetectorYN.create(str(_YUNET), "", (320, 320), 0.7, 0.3, 5000)
        _rec = cv2.FaceRecognizerSF.create(str(_SFACE), "")
    return _det, _rec


def _decode(raw: bytes):
    return cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)


def _prep(img, side: int):
    h, w = img.shape[:2]
    f = side / max(h, w)
    im = cv2.resize(img, (max(1, int(w * f)), max(1, int(h * f))))
    # Pad so close-up faces that fill the frame (typical selfies) are still detected.
    p = int(side * 0.25)
    return cv2.copyMakeBorder(im, p, p, p, p, cv2.BORDER_CONSTANT, value=(0, 0, 0))


def _largest_face(det, img):
    """Multi-scale + rotation search (YuNet misses very large or sideways faces)."""
    for rot in (None, cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_90_COUNTERCLOCKWISE, cv2.ROTATE_180):
        base = img if rot is None else cv2.rotate(img, rot)
        best = None
        for side in (640, 960, 400):
            im = _prep(base, side)
            h, w = im.shape[:2]
            det.setInputSize((w, h))
            _, faces = det.detect(im)
            if faces is not None and len(faces):
                f = max(faces, key=lambda x: x[2] * x[3] * x[14])
                if best is None or f[14] > best[1][14]:
                    best = (im, f)
        if best:
            return best
    return None, None


def _feature(raw: bytes):
    det, rec = _models()
    img = _decode(raw)
    if img is None:
        return None
    im, face = _largest_face(det, img)
    if face is None:
        return None
    return rec.feature(rec.alignCrop(im, face))


def compare(kyc_raw: bytes, selfie_raw: bytes) -> dict:
    """{'kyc_face': bool, 'selfie_face': bool, 'score': float|None}"""
    with _lock:
        a, b = _feature(kyc_raw), _feature(selfie_raw)
        score = None
        if a is not None and b is not None:
            score = float(_models()[1].match(a, b, cv2.FaceRecognizerSF_FR_COSINE))
    return {"kyc_face": a is not None, "selfie_face": b is not None, "score": score}
