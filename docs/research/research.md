# Research Notes

**Project:** AI-Powered Cyber Threat Detection and SOC Assistant
Each claim below says where it came from. "Fetched" means the author read the page during Phase 11; "from memory"
means the author is fairly sure but did not re-open the source, so **check it before citing in the report**.

---

## 1. The UNSW-NB15 data set

**Source (fetched):** UNSW Canberra, "The UNSW-NB15 Dataset" page (page last updated 02 June 2021).

| Fact | Detail |
|---|---|
| Created by | Cyber Range Lab, UNSW Canberra, using the IXIA PerfectStorm tool to mix real normal activity with synthetic attacks |
| Capture | about 100 GB of raw traffic (tcpdump); features generated with Argus and Bro-IDS |
| Size | 2,540,044 records; 49 features plus a class label (the page is inconsistent and elsewhere says 47; **count the real columns** with `inspect_dataset.py`) |
| Attack categories | Fuzzers, Analysis, Backdoors, DoS, Exploits, Generic, Reconnaissance, Shellcode, Worms |
| Official partition | training set 175,341 records; testing set 82,332 records |
| Files | UNSW-NB15_1..4.csv, ground-truth and event-list files, `UNSW_NB15_training-set.csv`, `UNSW_NB15_testing-set.csv`, a features description file |
| Licence | free for academic use; commercial use needs the authors' agreement; users are asked to cite the authors' papers |

**Class counts for the full set (fetched, arXiv 2205.06177):** Normal 2,218,761; Generic 215,481; Exploits 44,525;
Fuzzers 24,246; DoS 16,535; Reconnaissance 13,987; Analysis 2,677; Backdoor 2,329; Shellcode 1,511; Worms 174.
Normal traffic is about 87%; the paper reports an imbalance ratio of up to 514.29 and notes that many attack records
mimic normal behaviour.

**What this means for the project**
- Report per-class precision, recall and F1, not accuracy alone. On the **full** 2.5 million record set a model that
  always says "normal" would look about 87% accurate (arithmetic from the counts above, not a measured result of this
  project). **The official split this project uses is different:** its test file has 37,000 normal and 45,332 attack
  rows (counts from this project's own training report), so "always attack" would score 45,332 / 82,332 = 55.1% and
  "always normal" 44.9% (arithmetic, not a model result). Compare accuracy against those figures, not against 87%.
- Expect weak results on Worms, Shellcode, Analysis and Backdoor, which have few examples.
- Use the official training/testing files for the comparison; do not mix them.
- Do not claim the model works on real networks. The data are from a 2015 lab with synthetic attacks.

**Citation (from memory; verify the details on the data set page):**
Moustafa, N., and Slay, J. (2015). "UNSW-NB15: a comprehensive data set for network intrusion detection systems
(UNSW-NB15 network data set)." Military Communications and Information Systems Conference (MilCIS), IEEE.
Also cite the 2016 follow-up by the same authors on the statistical analysis of the data set if you use its findings.

## 2. Models used and why

| Model | Reason | Caveat |
|---|---|---|
| Logistic regression | Fast, simple baseline | Linear; may underfit |
| Random forest | Handles mixed features and non-linear patterns | Larger model, slower |
| XGBoost (optional) | Often strong on tabular data | Extra install; tuning needed |

Selection uses a stratified validation split of the training data; the official test file is used once at the end.
The attack score is the model's output for the attack class. Tree ensembles and boosted models are generally **not**
calibrated probabilities, so the project treats scores as a ranking and uses severity bands only for sorting.
(General machine-learning background; no single source cited. Calibration methods such as Platt scaling or isotonic
regression are standard future work.)

## 3. Retrieval-augmented generation (RAG)

- **Concept (from memory):** Lewis, P., et al. (2020). "Retrieval-Augmented Generation for Knowledge-Intensive NLP
  Tasks." NeurIPS. Retrieval supplies passages to a generator so answers can rest on documents rather than only on
  what the model memorised.
- **BM25 (from memory):** Robertson, S., and Zaragoza, H. (2009). "The Probabilistic Relevance Framework: BM25 and
  Beyond." Foundations and Trends in Information Retrieval. The default retriever here is a BM25-style keyword scorer.
- **Project design choices:** chunks of at most 1,200 characters with 150 overlap; headings start a new chunk;
  documents must carry title, publisher and URL; the answer may cite only the numbered passages it was given; no
  passage above the minimum score means "no match".
- **Honest limits:** `RAG_MIN_SCORE` was not tuned on labelled questions. The keyword retriever matches weakly on
  generic words. The shipped knowledge base is the team's own notes (publisher "Project team (own notes)"); the team
  should add official guidance (for example NIST SP 800-61 on incident handling, CISA playbooks, MITRE ATT&CK pages)
  and keep each document's real URL and publisher. Check each publisher's reuse terms before copying text into the
  knowledge folder.

## 4. Prompt injection and the agent design

**Source (fetched via a capture of the OWASP page; OWASP's own URL was not reachable from the build sandbox):**
OWASP Top 10 for LLM Applications 2025, LLM01 Prompt Injection.
- Direct injection is a user's own prompt changing model behaviour; indirect injection comes from external content the
  model reads (files, web pages, here: alert fields and CSV values).
- Listed mitigations: constrain model behaviour, validate output formats, filter inputs and outputs, enforce least
  privilege, require human approval for high-risk actions, separate and label untrusted content, run adversarial tests.
- OWASP states that RAG and fine-tuning do not fully mitigate the problem.

**How the project responds**
1. Untrusted text is wrapped in tags with tag characters neutralised, and the prompt says it is data. This reduces the
   risk but does not remove it.
2. The model has no tools. Its only output is text shown to the user.
3. The agent is rule-based. A model never chooses an action.
4. Three whitelisted actions, strict parameters, re-validation at execution, approver's own permissions, audit log.
5. Citations are validated, so an injected "source" label is dropped.
6. **Not done:** adversarial testing against the real model. The prompt-building tests check the text, not how Gemini
   behaves. The team should try injection strings in alert text with a real key and record what happens.

## 5. Privacy note on the Gemini API

The project sends the question, retrieved passages and (optionally) alert context to Google's Gemini API. When the
decision was made (Phase 9) the author read that Google's free-tier terms say content may be used to improve its
products and may be read by human reviewers, and advise against submitting sensitive or personal data. **Terms change:
re-read the current terms before use.** For that reason raw row values are off by default and need both a server switch
(`ASSISTANT_ALLOW_ROW_VALUES`) and a per-question tick. Do not use real company traffic with the free tier.

## 6. Web application security references the design follows
(General practice; none re-fetched in Phase 11, so cite from the OWASP site directly.)
- OWASP Top 10 (broken access control, injection, identification failures) - motivates owner-scoped queries, strict
  validation, hashed passwords, rate limits.
- OWASP guidance on password storage (bcrypt with an adequate work factor) and on JWT handling (short expiry,
  server-side checks).
- CSV injection ("formula injection"): cells beginning with `=`, `+`, `-` or `@` can run as formulas in spreadsheets;
  the project prefixes such cells in downloads.

## 7. Evaluation: plan and real results

All numbers in this section come from runs on the team's own Windows machine on 5 November 2026 (Python 3.13.1) with
the official UNSW-NB15 training file (175,341 rows) and testing file (82,332 rows). Source files:
`ml-service/reports/training_report_binary.md` and `training_report_multiclass.md`. Nothing here is quoted from papers.

### 7.1 Data preparation seen in the reports
- 67,601 exact duplicate training rows were dropped (ignoring `id`), leaving 107,740 training rows.
- Features: 39 numeric and 3 categorical. `id` and the other target column were excluded on purpose.
- The test file is used as given (82,332 rows), and scored once, after model selection on a validation split.

### 7.2 Binary detector (normal or attack)
Validation split (used to choose the model): Random Forest F1 0.9360 against Logistic Regression 0.9124.

Official test file, selected model Random Forest:

| Measure | Value |
|---|---|
| Accuracy | 0.8660 |
| Precision (attack) | 0.8104 |
| Recall (attack) | 0.9876 |
| F1 (attack) | 0.8903 |
| False-positive rate | 0.2831 |
| False-negative rate | 0.0124 |
| ROC-AUC | 0.9823 |

Confusion matrix (rows = true class): normal 26,527 correct and **10,473 wrongly flagged**; attack 44,771 caught and
561 missed.

What it means: the model rarely misses an attack but flags about 28% of normal traffic, which would overwhelm analysts
in practice. Validation F1 (0.936) was higher than test F1 (0.890), so the official test file is harder than a random
slice of the training file; we did not investigate why. A 20,000-row trial gave a similar test F1 (0.8864), so the
result does not depend on the extra training rows. Scores are not calibrated, and the application's severity bands
(0.70 / 0.85 / 0.95) were not tuned.

### 7.3 Attack-category model (10 classes)
Random Forest with balanced class weights: validation accuracy 0.8015, **test accuracy 0.7020, macro F1 0.4960,
weighted F1 0.7488**.

| Class | Precision | Recall | F1 | Test rows |
|---|---|---|---|---|
| Generic | 0.9986 | 0.9679 | 0.9830 | 18,871 |
| Reconnaissance | 0.8538 | 0.8221 | 0.8377 | 3,496 |
| Normal | 0.9863 | 0.6588 | 0.7900 | 37,000 |
| Exploits | 0.7587 | 0.6374 | 0.6928 | 11,132 |
| Worms | 0.6875 | 0.5000 | 0.5789 | 44 |
| Fuzzers | 0.2648 | 0.6496 | 0.3763 | 6,062 |
| Shellcode | 0.2181 | 0.8598 | 0.3480 | 378 |
| DoS | 0.6186 | 0.0944 | 0.1638 | 4,089 |
| Backdoor | 0.0526 | 0.5746 | 0.0964 | 583 |
| Analysis | 0.0561 | 0.2674 | 0.0927 | 677 |

What it means: Generic and Reconnaissance are predicted well. DoS is mostly missed (386 of 4,089 found; most are called
Backdoor), 10,270 normal rows are labelled Fuzzers, and Backdoor and Analysis have precision near 5%. Category labels
shown in the application are therefore hints, not facts; the attack-or-normal decision is the stronger signal.

### 7.4 Application checks on the same machine
- `tests/e2e/smoke.mjs` against a real stack (backend, MongoDB Atlas, ML service): **first run 19 passed, 0 failed, 2 skipped**
  (the two assistant steps, because the AI service was not running; a skip is not a pass), **second run with the AI
  service running 21 passed, 0 failed, 0 skipped**. The assistant step got "no match" (0 passages, `generated=false`), so
  it tests the route and the honest "no match" path, not Gemini output. Upload of a 5,000-row sample taken from the official test file: 5,000 rows analysed, 3,395 flagged
  (67.9%). That count is consistent with the false-positive rate above, and it also shows many alerts are false alarms.
- Backend Jest: 20 suites, 340 tests passed. Frontend Vitest: 12 files, 110 tests passed. (Backend tests mock the
  database models; the smoke run is what exercised real database queries, in a single-user run only.)

### 7.5 Still not measured
| Item | Status |
|---|---|
| End-to-end timing (1,000 and 50,000 rows) | **Not measured** |
| Assistant answer quality (fraction of questions with a relevant first passage) | **No labelled question list exists.** The team reports the assistant answers; its accuracy has not been evaluated |
| Behaviour on traffic other than UNSW-NB15 | **Not tested.** Results will likely be worse |
| Two-account access check | **Done by hand on 6 Nov 2026, team-reported** (a second account saw none of the first account's data); one pair of accounts, direct API calls not tried |
| Prompt-injection test with a real model | **Not done** |

Do not copy numbers from papers into your results table; label them as literature values if you quote them.

## 8. Reference list (verify each before final submission)
1. UNSW Canberra. The UNSW-NB15 Dataset (web page). Fetched in Phase 11.
2. Moustafa, N., Slay, J. (2015). UNSW-NB15: a comprehensive data set for network intrusion detection systems. MilCIS. From memory.
3. arXiv:2205.06177 (analysis of UNSW-NB15 class distribution). Fetched.
4. OWASP. Top 10 for LLM Applications 2025: LLM01 Prompt Injection. Fetched via capture.
5. Lewis, P., et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. NeurIPS. From memory.
6. Robertson, S., Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. From memory.
7. Google. Gemini API documentation and terms. Read in Phase 9; re-check.
