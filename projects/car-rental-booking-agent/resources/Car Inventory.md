# Car Inventory

Kereta Sewa Jalan-jalan (fictional demo car rental company at KLIA). 56 cars in 4 tiers. Prices follow Rental Policy R12 to R14.

## Tiers and rates

| Tier | Seats | Cars | Hourly | Daily | Weekly |
|---|---|---|---|---|---|
| Standard | 4 | 20 | RM 20 | RM 120 | RM 700 |
| Premium | 4 | 24 | RM 35 | RM 200 | RM 1,200 |
| SUV | 7 | 6 | RM 65 | RM 380 | RM 2,300 |
| MPV | 7 | 6 | RM 120 | RM 700 | RM 4,200 |

## Models

| Tier | Model | Seats | Cars |
|---|---|---|---|
| Standard | Perodua Axia | 4 | 10 |
| Standard | Perodua Myvi | 4 | 10 |
| Premium | Honda City | 4 | 10 |
| Premium | Toyota Vios | 4 | 10 |
| SUV | Toyota Fortuner | 7 | 3 |
| SUV | Mazda CX-8 | 7 | 3 |
| MPV | Toyota Alphard | 7 | 3 |
| MPV | Toyota Vellfire | 7 | 3 |
| Premium | Toyota Camry | 4 | 2 |
| Premium | Honda Accord | 4 | 2 |

## How a rental is priced

- Minimum 2 hours. Up to 5 hours: hours x hourly rate. 6 hours or more counts as one day (R12).
- Beyond whole days, extra hours at the hourly rate, capped at one more day (R13).
- Whole weeks at the weekly rate, remaining days at the daily rate, capped at the two-week rate (R14).
- Longer than 2 weeks goes to staff (R17). Every booking also needs the RM 100 deposit (R5).
- Worked examples: Standard 4 hours RM 80; Standard 1 day 3 hours RM 180; Standard 9 days RM 940.
- Quote prices only from check_availability results, which apply these rules in code.
