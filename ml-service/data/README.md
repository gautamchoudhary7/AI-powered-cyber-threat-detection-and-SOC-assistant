# Dataset folder

Put the dataset files in `data/raw/`. That folder is ignored by git, so the data is never committed.

## UNSW-NB15

Official page: https://research.unsw.edu.au/projects/unsw-nb15-dataset
The files are hosted on SharePoint (link on that page). Download these:

| File | Purpose |
|------|---------|
| `UNSW_NB15_training-set.csv` | the official training partition |
| `UNSW_NB15_testing-set.csv` | the official testing partition |
| `UNSW-NB15_features.csv` | the authors' description of the features (read it, it explains every column) |

The four large `UNSW-NB15_1..4.csv` files are the full raw data. They have no header row, so we
start with the training/testing partition files instead.

**Licence and citation.** The page grants free use for academic research. Commercial use needs the
authors' agreement. Your report and paper must cite the papers listed on the dataset page
(Moustafa and Slay, 2015 and 2016, and the other papers the page names as required).

## Next step after downloading

Run the inspection script and read its output **before** training (see the main README).
The script reports the real column names, so nothing in this project guesses the schema.
