# Answer Key

Written from `sample/defects.json` before any run. A finding catches a defect when it is on the right target, uses one of the listed categories, and its Chinese span overlaps the planted span (an omission: right target and category).

## Review defects

| Case | Target | Stage | Categories | Planted span | What |
|---|---|---|---|---|---|
| D1 | P17 | accuracy | mistranslation | 8,462万令吉 | Revenue RM86.42 million written with two digits swapped |
| D2 | P36 | accuracy | mistranslation | 4.8亿令吉 | IPO proceeds RM48.00 million converted to 亿 wrongly (correct 4,800万) |
| D3 | P5 | accuracy | mistranslation, omission | 出现影响 | "There were no unusual items" with the negation dropped |
| D4 | P30 | accuracy | omission | (omission) | The diesel subsidy risk sentence left out |
| D5 | P23 | accuracy | mistranslation | 去年同期 | "Immediate preceding quarter" rendered as the same quarter last year |
| D6 | P19 | accuracy | mistranslation | 上升至25.00% | Gross profit margin "decreased" rendered as rose |
| D8 | P31 | register | register, mistranslation | 必将再创新高 | "Expects ... to remain satisfactory" rendered as certain to hit a new record |
| D7 | P31 | accuracy | addition | 预计全年盈利将增长三成。 | A profit growth forecast added that is not in the English |
| D9 | P17 | register | register | 大幅飙升 | "Increased" rendered as soared |
| D10 | P10 | register | register, addition | 生意很火 | Colloquial "business is hot" in the segment note |
| D11 | P18 | section | wording, fluency | 做出了贡献到收入增长 | Literal, ungrammatical word order |
| D12 | P33 | section | fluency, structure, punctuation | 本季度税项支出为311万令吉而由于部分开支不可扣税所以实际税率为24.01%略高于24%的法定税率。 | The taxation note as one run-on sentence with the reason buried |
| D13 | P24 | section | structure, mistranslation | 包裹及货运量下降以及工作日减少，主要由于收入减少 | Cause and effect reversed: the reason reads as the result |
| D14 | P32 | section | punctuation | ,因此, | Half-width commas |
| D15 | P17 | section | punctuation | (“2026财年第一季度”) | Half-width brackets around the defined term |
| D16 | P1 | section | quotation, punctuation | “本集团“ | Mismatched quotation marks around the defined term |
| D17 | F4 | accuracy | omission | (omission) | Inside the protected sponsor statement: "assumes no responsibility" left out. An accuracy correction only (the suggestion must restore the meaning: 准确性、完整性、责任) |

## Glossary stage

| Case | Occurrences | What |
|---|---|---|
| D18 | P9 营业额; P17 营业额 | Revenue as 营业额 against the glossary's 收入 |
| D19 | P11 最后一公里配送; P20 最后一公里配送 | Last-mile delivery as 最后一公里配送 against the glossary's 末端配送 |
| D20 | P27 特拉斯; P41 特拉斯 | Company short name written a second way |

## Clean targets

F1, F2, F3, P2, P3, P4, P6, P7, P8, P12, P13, P14, P15, P16, P21, P22, P25, P26, P28, P29, P34, P35, P37, P38, P39, P40, P42, P43, P44

Pass mark: every review defect found with one of its listed categories, every glossary occurrence changed and no other glossary change, and at most 2 must findings on clean targets.
