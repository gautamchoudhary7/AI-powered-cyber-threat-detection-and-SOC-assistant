# Training report: binary model

- Model version: `binary-20261105T094038Z-4df6b13d`
- Trained at: 2026-11-05T09:40:38.031329+00:00
- Training file: `UNSW_NB15_training-set.csv` (175,341 rows read)
- Testing file: `UNSW_NB15_testing-set.csv` (82,332 rows read)

## Data preparation

- Training rows without a label dropped: 0
- Exact duplicate training rows dropped: 67,601
- Training rows used: 107,740
- Test rows used (test file not deduplicated): 82,332
- Features: 39 numeric, 3 categorical
- Columns deliberately excluded from the features: id, attack_cat

## Model comparison (validation split, used for selection)

| Model | Status | Fit seconds | Accuracy | Precision | Recall | F1 | False-positive rate |
|---|---|---|---|---|---|---|---|
| Logistic Regression | ok | 2.19 | 0.9028 | 0.8563 | 0.9764 | 0.9124 | 0.1763 |
| Random Forest | ok | 7.98 | 0.9321 | 0.9144 | 0.9587 | 0.9360 | 0.0966 |

**Selected:** Random Forest (by attack-class F1 on validation data).

## Final result on the official test file (scored once)

- Samples: 82,332
- Accuracy: 0.8660
- Precision (attack): 0.8104
- Recall (attack): 0.9876
- F1 (attack): 0.8903
- False-positive rate: 0.2831
- False-negative rate: 0.0124
- ROC-AUC: 0.9823

### Per-class performance

| Class | Precision | Recall | F1 | False-positive rate | Support |
|---|---|---|---|---|---|
| normal | 0.9793 | 0.7169 | 0.8278 | 0.0124 | 37,000 |
| attack | 0.8104 | 0.9876 | 0.8903 | 0.2831 | 45,332 |

### Confusion matrix (rows = true class, columns = predicted class)

| true \ predicted | normal | attack |
|---|---|---|
| normal | 26,527 | 10,473 |
| attack | 561 | 44,771 |

## Settings

```json
{
  "models_requested": [
    "logreg",
    "rf"
  ],
  "class_weight": null,
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
