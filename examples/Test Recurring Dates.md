
TODO recurring example 1
SCHEDULED: <2026-01-01 Sun +1m>

- TODO recurring example 2
  DEADLINE: <2026-01-01 Sun +1m>
  
+ TODO recurring example 3
	SCHEDULED: <2026-01-01 .+1d>

> TODO recurring example 4
> DEADLINE: <2026-01-01 .+1d>

TODO recurring example 5
  SCHEDULED: <2026-01-01 ++1w>

TODO recurring example 6
  DEADLINE: <2026-01-01 ++1w>
  - [ ] subtask 1
  - [ ] subtask 2

---

```todoseq
search: file:"Test Recurring Dates"
```

---

TODO Pay the rent
  DEADLINE: <2005-10-01 Sat +1m>

TODO Call Father
  DEADLINE: <2008-02-10 Sun ++1w>
  Marking this as DONE shifts the date by at least one week, but also
  by as many weeks as it takes to get this date into the future.
  However, it stays on a Sunday, even if you called and marked it
  done on Saturday.

TODO Empty kitchen trash
  DEADLINE: <2008-02-08 Fri 20:00 ++1d>
  Marking this as DONE shifts the date by at least one day, and also
  by as many days as it takes to get the timestamp into the future.
  Since there is a time in the timestamp, the next deadline in the
  future will be on today's date if you complete the task before
  20:00.

TODO Check the batteries in the smoke detectors
  DEADLINE: <2005-11-01 Tue .+1m>
  Marking this as DONE shifts the date to one month after today.

TODO Wash my hands
  DEADLINE: <2019-04-05 08:00 Fri .+1h>
  Marking this as DONE shifts the date to exactly one hour from now.
