# Training report: multiclass model

- Model version: `multiclass-20261105T110356Z-af868855`
- Trained at: 2026-11-05T11:03:56.263462+00:00
- Training file: `UNSW_NB15_training-set.csv` (175,341 rows read)
- Testing file: `UNSW_NB15_testing-set.csv` (82,332 rows read)

## Data preparation

- Training rows without a label dropped: 0
- Exact duplicate training rows dropped: 67,601
- Training rows used: 107,740
- Test rows used (test file not deduplicated): 82,332
- Features: 39 numeric, 3 categorical
- Columns deliberately excluded from the features: id, label

## Model comparison (validation split, used for selection)

| Model | Status | Fit seconds | Accuracy | Macro precision | Macro recall | Macro F1 | Weighted F1 |
|---|---|---|---|---|---|---|---|
| Logistic Regression | ok | 31.46 | 0.6783 | 0.4556 | 0.5983 | 0.4353 | 0.7224 |
| Random Forest | ok | 63.49 | 0.8015 | 0.5807 | 0.6008 | 0.5782 | 0.8166 |

**Selected:** Random Forest (by macro F1 on validation data).

## Final result on the official test file (scored once)

- Samples: 82,332
- Accuracy: 0.7020
- Macro F1: 0.4960
- Weighted F1: 0.7488

### Per-class performance

| Class | Precision | Recall | F1 | False-positive rate | Support |
|---|---|---|---|---|---|
| Analysis | 0.0561 | 0.2674 | 0.0927 | 0.0373 | 677 |
| Backdoor | 0.0526 | 0.5746 | 0.0964 | 0.0738 | 583 |
| DoS | 0.6186 | 0.0944 | 0.1638 | 0.0030 | 4,089 |
| Exploits | 0.7587 | 0.6374 | 0.6928 | 0.0317 | 11,132 |
| Fuzzers | 0.2648 | 0.6496 | 0.3763 | 0.1433 | 6,062 |
| Generic | 0.9986 | 0.9679 | 0.9830 | 0.0004 | 18,871 |
| Normal | 0.9863 | 0.6588 | 0.7900 | 0.0075 | 37,000 |
| Reconnaissance | 0.8538 | 0.8221 | 0.8377 | 0.0062 | 3,496 |
| Shellcode | 0.2181 | 0.8598 | 0.3480 | 0.0142 | 378 |
| Worms | 0.6875 | 0.5000 | 0.5789 | 0.0001 | 44 |

### Confusion matrix (rows = true class, columns = predicted class)

| true \ predicted | Analysis | Backdoor | DoS | Exploits | Fuzzers | Generic | Normal | Reconnaissance | Shellcode | Worms |
|---|---|---|---|---|---|---|---|---|---|---|
| Analysis | 181 | 393 | 0 | 57 | 44 | 0 | 1 | 1 | 0 | 0 |
| Backdoor | 177 | 335 | 2 | 10 | 50 | 0 | 0 | 2 | 7 | 0 |
| DoS | 556 | 2,228 | 386 | 646 | 132 | 10 | 3 | 52 | 74 | 2 |
| Exploits | 701 | 2,323 | 119 | 7,096 | 294 | 7 | 28 | 311 | 249 | 4 |
| Fuzzers | 367 | 787 | 17 | 237 | 3,938 | 3 | 301 | 42 | 370 | 0 |
| Generic | 14 | 29 | 44 | 411 | 72 | 18,265 | 0 | 5 | 28 | 3 |
| Normal | 1,179 | 3 | 43 | 707 | 10,270 | 5 | 24,377 | 71 | 344 | 1 |
| Reconnaissance | 51 | 269 | 11 | 163 | 33 | 0 | 3 | 2,874 | 92 | 0 |
| Shellcode | 0 | 0 | 1 | 9 | 33 | 0 | 2 | 8 | 325 | 0 |
| Worms | 0 | 0 | 1 | 17 | 3 | 0 | 0 | 0 | 1 | 22 |

## Settings

```json
{
  "models_requested": [
    "logreg",
    "rf"
  ],
  "class_weight": "balanced",
  "val_fraction": 0.2,
  "seed": 42,
  "rf_estimators": 100,
  "max_train_rows": null
}
```

## Caveats

- The model was selected using the validation split only; the official test file was scored once, after selection.
- Predicted probabilities are not calibrated. Treat them as scores, not exact chances.
- Results describe this dataset only. Real-world traffic will differ and results will likely be worse.
