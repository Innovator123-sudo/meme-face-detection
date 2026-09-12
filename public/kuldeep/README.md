# Kuldeep FER CNN (committed ONNX)

Source: https://github.com/kuldeepstechwork/Face-Expression-Recognition-using-Deep-Learning
File: `model.h5` (Keras, 16.1 MB, 1.3M params, input 48x48x1 grayscale, output 7 emotions)

Converted to `kuldeep_fer48.onnx` (~5.1 MB, ONNX opset 13) so it runs in the
browser via `onnxruntime-web` alongside ResMaskingNet — no Python server needed.

## Labels (ONNX output order)

0 Angry -> `angry`, 1 Disgust -> `disgusted`, 2 Fear -> `fearful`,
3 Happy -> `happy`, 4 Neutral -> `neutral`, 5 Sad -> `sad`, 6 Surprise -> `surprised`

## Preprocessing (mirrors `main.py`)

- Tight face-box crop `gray[y:y+h, x:x+w]` (no 1.1x expansion)
- Bilinear resize to 48x48 (OpenCV pixel-center mapping)
- `/255` to float, shape `[1,48,48,1]` NHWC single channel

## Re-convert

```powershell
pip install tf2onnx onnxruntime
python C:\Users\Samrat\AppData\Local\Temp\opencode\convert_kuldeep.py
# or inline:
# @tf.function(input_signature=[tf.TensorSpec([1,48,48,1], tf.float32, name="input")])
# def fn(x): return model(x, training=False)
# tf2onnx.convert.from_function(fn, ..., opset=13, output_path="public/kuldeep/kuldeep_fer48.onnx")
```

Verified parity: max abs diff vs TF `4.5e-08` on random input.

Unlike `public/rmn/*.onnx` (139 MB, gitignored, downloaded by postinstall),
this 5 MB file IS committed to git (under GitHub's 100 MB limit) so the
Kuldeep voter works offline on first load.
