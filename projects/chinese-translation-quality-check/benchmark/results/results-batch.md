# Benchmark results (batch), 2026-10-19 03:13

20 of 20 planted defects caught; pass mark met. 18 findings (18 graded), 1 on clean targets (0 must), 0 unplanned on planted targets; 0 findings failed the checks after retries, 0 requests failed. Cost of this run $0.19.

| Stage | Caught | Cases |
|---|---|---|
| accuracy | 8 | 8 |
| register | 3 | 3 |
| section | 6 | 6 |
| glossary | 3 | 3 |

| Case | Target | Result | Caught by | What |
|---|---|---|---|---|
| D1 | P17 | caught | S01-F001 accuracy/mistranslation | Revenue RM86.42 million written with two digits swapped |
| D2 | P36 | caught | S02-F003 accuracy/mistranslation | IPO proceeds RM48.00 million converted to 亿 wrongly (correct 4,800万) |
| D3 | P5 | caught | S01-F010 accuracy/mistranslation | "There were no unusual items" with the negation dropped |
| D4 | P30 | caught | S02-F006 accuracy/omission | The diesel subsidy risk sentence left out |
| D5 | P23 | caught | S02-F004 accuracy/mistranslation | "Immediate preceding quarter" rendered as the same quarter last year |
| D6 | P19 | caught | S01-F003 accuracy/mistranslation | Gross profit margin "decreased" rendered as rose |
| D8 | P31 | caught | S02-F001 accuracy/mistranslation | "Expects ... to remain satisfactory" rendered as certain to hit a new record |
| D7 | P31 | caught | S02-F002 accuracy/addition | A profit growth forecast added that is not in the English |
| D9 | P17 | caught | S01-F002 accuracy/addition | "Increased" rendered as soared |
| D10 | P10 | caught | S01-F006 accuracy/addition | Colloquial "business is hot" in the segment note |
| D11 | P18 | caught | S01-F008 section/fluency | Literal, ungrammatical word order |
| D12 | P33 | caught | S02-F008 section/fluency | The taxation note as one run-on sentence with the reason buried |
| D13 | P24 | caught | S02-F005 accuracy/mistranslation | Cause and effect reversed: the reason reads as the result |
| D14 | P32 | caught | S02-F007 section/punctuation | Half-width commas |
| D15 | P17 | caught | S01-F007 section/punctuation | Half-width brackets around the defined term |
| D16 | P1 | caught | S01-F005 section/quotation | Mismatched quotation marks around the defined term |
| D17 | F4 | caught | S01-F009 accuracy/omission | Inside the protected sponsor statement: "assumes no responsibility" left out. An accuracy correction only |
| D18 | P9 P17 | caught | glossary stage | Revenue as 营业额 against the glossary's 收入 |
| D19 | P11 P20 | caught | glossary stage | Last-mile delivery as 最后一公里配送 against the glossary's 末端配送 |
| D20 | P27 P41 | caught | glossary stage | Company short name written a second way |

## Findings on clean targets

- S01-F004 P16 accuracy/mistranslation (should, grader doubtful): 「一处仓库」 → 「一处物流站」 "Depot" is rendered as 仓库, which means warehouse and is a different facility in this report.

## Unplanned findings on planted targets

None.
